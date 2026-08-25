import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  crawl,
  listNotes,
  loadProfile,
  loadSeen,
  parsePostingUrl,
  importPostingFromUrl,
  postingToNoteInput,
  profileSchema,
  sourcesSchema,
  upsertNote,
  type HttpClient,
  type JobPosting,
  type Profile,
} from '../src/index.js'

const fixturesDir = join(import.meta.dirname, 'fixtures/sources')

function fixture(file: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, file), 'utf-8'))
}

const routedClient: HttpClient = {
  json: async (url) => {
    // terminate pagination: the fixture would otherwise loop for every page
    if (url.includes('arbeitnow.com'))
      return { ...(fixture('arbeitnow.json') as Record<string, unknown>), links: null }
    if (url.includes('shopwareag.recruitee.com')) return fixture('recruitee.json')
    throw new Error(`404: ${url}`)
  },
  text: async () => {
    throw new Error('404')
  },
}

interface Env {
  home: string
  notesDir: string
  profile: Profile
}

async function testEnv(stacks: string[]): Promise<Env> {
  const home = mkdtempSync(join(tmpdir(), 'amt-crawl-'))
  const notesDir = join(home, 'notes')
  const base = await loadProfile(join(import.meta.dirname, 'fixtures/profile-home'))
  const profile = profileSchema.parse({
    ...base,
    search: { ...base.search, stacksPrimary: stacks, stacksSecondary: [] },
    paths: { ...base.paths, notesDir, outputBase: notesDir },
  })
  return { home, notesDir, profile }
}

describe('crawl', () => {
  const sources = sourcesSchema.parse({
    boards: ['arbeitnow'],
    companies: [{ name: 'shopware', ats: 'recruitee', slug: 'shopwareag' }],
  })

  it('creates notes only for stack-relevant postings; the rest goes to the ledger', async () => {
    // "databricks" matches exactly one fixture posting (Senior Data Engineer)
    const { home, notesDir, profile } = await testEnv(['databricks'])
    const summary = await crawl(routedClient, home, profile, sources, {
      today: '2026-08-20',
    })
    expect(summary.fetched).toBe(4) // 2 arbeitnow + 2 recruitee
    expect(summary.errors).toHaveLength(0)
    expect(summary.offStack).toBe(3)
    expect(summary.created + summary.filtered).toBe(1)
    // files exist only for real candidates — never for ledger entries
    expect(listNotes(notesDir)).toHaveLength(summary.created)
  })

  it('crawls a channel with a machine-usable spec into notes (with detail description)', async () => {
    const { home, notesDir, profile } = await testEnv(['vue'])
    const listHtml = `<li class="card">
      <h3 class="t">Senior Vue Engineer</h3>
      <a class="c" href="z">Channel Co</a>
      <a class="l" href="https://ex/jobs/view/vue-eng-4457345623">view</a>
    </li>`
    const channelClient: HttpClient = {
      json: async () => ({}),
      text: async (url) => {
        if (url.includes('/search')) return listHtml
        if (url.includes('/detail/')) return '<div class="d"><p>We use <b>Vue</b> 3.</p></div>'
        throw new Error(`404: ${url}`)
      },
    }
    const channelSources = sourcesSchema.parse({
      channels: [{
        name: 'demo-channel',
        crawl: {
          urlTemplate: 'https://ex/search?keywords={keyword}',
          keywords: 'stacks',
          mode: 'selectors',
          item: 'li.card',
          fields: {
            title: 'h3.t',
            company: 'a.c',
            url: { selector: 'a.l', attr: 'href' },
          },
          nativeId: { field: 'url', regex: '-(\\d{8,})' },
          detail: { urlTemplate: 'https://ex/detail/{id}', selector: '.d' },
        },
      }],
    })
    const summary = await crawl(channelClient, home, profile, channelSources, { today: '2026-08-20' })
    expect(summary.errors).toHaveLength(0)
    expect(summary.created).toBe(1)
    const notes = listNotes(notesDir)
    expect(notes).toHaveLength(1)
    expect(notes[0]!.note.source).toBe('demo-channel')
    expect(notes[0]!.note.nativeId).toBe('4457345623')
    expect(notes[0]!.body).toContain('Vue') // detail description made it into the note body
  })

  it('never surfaces judged postings again, but refreshes existing notes', async () => {
    const { home, notesDir, profile } = await testEnv(['databricks'])
    const first = await crawl(routedClient, home, profile, sources, { today: '2026-08-20' })
    const noteCount = listNotes(notesDir).length

    const second = await crawl(routedClient, home, profile, sources, { today: '2026-08-20' })
    expect(second.created).toBe(0)
    expect(second.refreshed).toBe(first.created)
    expect(second.known).toBe(first.offStack + first.filtered)
    expect(listNotes(notesDir)).toHaveLength(noteCount)
  })

  it('resolves a logo on refresh only when the note lacks one', async () => {
    const { home, notesDir, profile } = await testEnv(['vue'])
    const seed = (company: string, logo: string | null): void => {
      const posting: JobPosting = {
        source: 'arbeitnow', nativeId: `seed-${company}`, company, title: 'Vue Engineer',
        url: 'https://ex/seed', descriptionHtml: '<p>Vue work</p>', location: 'Berlin',
        workMode: null, salaryMin: null, salaryMax: null, salaryCurrency: null, publishedAt: null, tags: [],
      }
      const input = postingToNoteInput(posting, '2026-08-19')
      input.logo = logo
      upsertNote(notesDir, input, 'Vue work')
    }
    // Two pre-existing notes (empty logo cache) the crawl will refresh.
    seed('Alpha Logo GmbH', 'https://icons.duckduckgo.com/ip3/alpha.ico')
    seed('Beta Nologo GmbH', null)

    const post = (id: string, company: string): Record<string, unknown> => ({
      slug: `r-${id}`, title: 'Vue Engineer', company_name: company, url: `https://ex/${id}`,
      description: 'Vue work', location: 'Berlin', remote: true, created_at: 1787238038, tags: [], job_types: [],
    })
    const clearbit: string[] = []
    const client: HttpClient = {
      json: async (url) => {
        if (url.includes('clearbit')) { clearbit.push(url); return [] }
        if (url.includes('arbeitnow')) return { data: [post('a', 'Alpha Logo GmbH'), post('b', 'Beta Nologo GmbH')], links: null }
        throw new Error(`404 ${url}`)
      },
      text: async () => '',
    }
    const summary = await crawl(client, home, profile, sourcesSchema.parse({ boards: ['arbeitnow'] }), { today: '2026-08-20' })

    expect(summary.refreshed).toBe(2) // both matched the pre-seeded identities
    // Alpha already had a logo → skipped; Beta had none → resolved.
    expect(clearbit.some(u => u.includes('beta'))).toBe(true)
    expect(clearbit.some(u => u.includes('alpha'))).toBe(false)
    const alpha = listNotes(notesDir).find(n => n.note.company === 'Alpha Logo GmbH')!
    expect(alpha.note.logo).toContain('alpha.ico') // preserved
  })

  it('collapses postings that share company and title to one identity', async () => {
    const { home, notesDir, profile } = await testEnv(['vue'])
    // Same role, two source ids and even a legal-suffix variant on the company
    // name — one opening, so one note.
    const twin = (id: string, company: string) => ({
      slug: `same-role-${id}`,
      title: 'Vue Developer (m/w/d)',
      company_name: company,
      url: `https://example.com/${id}`,
      description: 'Vue work',
      location: 'Berlin',
      remote: true,
      created_at: 1787238038,
      tags: [],
      job_types: [],
    })
    const twinClient: HttpClient = {
      json: async () => ({ data: [twin('a', 'Twin GmbH'), twin('b', 'Twin')], links: null }),
      text: async () => '',
    }
    const summary = await crawl(twinClient, home, profile, sourcesSchema.parse({ boards: ['arbeitnow'] }), { today: '2026-08-20' })
    expect(summary.errors).toHaveLength(0)
    expect(summary.created).toBe(1) // same identity — merged, not duplicated
    expect(listNotes(notesDir)).toHaveLength(1)
  })

  it('keys the seen-ledger per posting, not by identity (no silent suppression)', async () => {
    const { home, profile } = await testEnv(['vue'])
    // Two OFF-STACK postings that share company+title but are different roles
    // (distinct ids). Neither becomes a note; both must be ledgered separately.
    const off = (id: string) => ({
      slug: `role-${id}`,
      title: 'Marketing Manager',
      company_name: 'Acme GmbH',
      url: `https://example.com/${id}`,
      description: 'sales and outreach',
      location: 'Berlin',
      remote: true,
      created_at: 1787238038,
      tags: [],
      job_types: [],
    })
    const client: HttpClient = {
      json: async () => ({ data: [off('a'), off('b')], links: null }),
      text: async () => '',
    }
    const sources = sourcesSchema.parse({ boards: ['arbeitnow'] })
    const summary = await crawl(client, home, profile, sources, { today: '2026-08-20' })
    expect(summary.offStack).toBe(2) // both ledgered, not one suppressing the other
    // ledger keys are source:nativeId, not company::title
    const ledger = loadSeen(home)
    expect(Object.keys(ledger)).toHaveLength(2)
    expect(Object.keys(ledger).every(k => k.startsWith('arbeitnow:'))).toBe(true)
  })

  it('isolates per-source failures', async () => {
    const { home, profile } = await testEnv(['databricks'])
    const broken = sourcesSchema.parse({
      boards: ['arbeitnow'],
      companies: [{ name: 'ghost', ats: 'recruitee', slug: 'ghost' }],
    })
    const summary = await crawl(routedClient, home, profile, broken, { today: '2026-08-20' })
    expect(summary.errors).toHaveLength(1)
    expect(summary.fetched).toBe(2) // the board still delivered
  })
})

describe('import from URL', () => {
  it('parses the six ATS URL shapes', () => {
    expect(parsePostingUrl('https://shopwareag.recruitee.com/o/some-job')).toMatchObject({ ats: 'recruitee', company: 'shopwareag' })
    expect(parsePostingUrl('https://boards.greenhouse.io/n26/jobs/7965433')).toMatchObject({ ats: 'greenhouse', postingRef: '7965433' })
    expect(parsePostingUrl('https://jobs.lever.co/emma-sleep/be3ee809-x')).toMatchObject({ ats: 'lever' })
    expect(parsePostingUrl('https://jobs.ashbyhq.com/n8n/42e72645-abcd')).toMatchObject({ ats: 'ashby', company: 'n8n' })
    expect(parsePostingUrl('https://gridx.jobs.personio.de/job/2659676')).toMatchObject({ ats: 'personio' })
    expect(parsePostingUrl('https://jobs.smartrecruiters.com/BoschGroup/744000144588559')).toMatchObject({ ats: 'smartrecruiters' })
    expect(parsePostingUrl('https://www.linkedin.com/jobs/view/123')).toBeNull()
  })

  it('resolves a recruitee URL to its posting', async () => {
    const url = 'https://shopwareag.recruitee.com/o/business-development-representative-mfd-2'
    const { posting } = await importPostingFromUrl(routedClient, url)
    expect(posting.title).toContain('Business Development')
  })

  it('rejects unknown URLs with a coded error', async () => {
    await expect(
      importPostingFromUrl(routedClient, 'https://www.linkedin.com/jobs/view/1'),
    ).rejects.toMatchObject({ code: 'URL_NOT_RECOGNIZED' })
  })
})
