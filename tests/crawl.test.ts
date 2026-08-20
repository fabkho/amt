import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  crawl,
  listNotes,
  loadProfile,
  parsePostingUrl,
  importPostingFromUrl,
  profileSchema,
  sourcesSchema,
  type HttpClient,
  type Profile,
} from '../src/index.js'

const fixturesDir = join(import.meta.dirname, 'fixtures/sources')

function fixture(file: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, file), 'utf-8'))
}

const routedClient: HttpClient = {
  json: async (url) => {
    if (url.includes('arbeitnow.com')) return fixture('arbeitnow.json')
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
  const home = mkdtempSync(join(tmpdir(), 'job-kit-crawl-'))
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
    expect(summary.irrelevant).toBe(3)
    expect(summary.created + summary.cut).toBe(1)
    // files exist only for real candidates — never for ledger entries
    expect(listNotes(notesDir)).toHaveLength(summary.created)
  })

  it('never surfaces judged postings again, but refreshes existing notes', async () => {
    const { home, notesDir, profile } = await testEnv(['databricks'])
    const first = await crawl(routedClient, home, profile, sources, { today: '2026-08-20' })
    const noteCount = listNotes(notesDir).length

    const second = await crawl(routedClient, home, profile, sources, { today: '2026-08-20' })
    expect(second.created).toBe(0)
    expect(second.refreshed).toBe(first.created)
    expect(second.seenBefore).toBe(first.irrelevant + first.cut)
    expect(listNotes(notesDir)).toHaveLength(noteCount)
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
  it('parses the five ATS URL shapes', () => {
    expect(parsePostingUrl('https://shopwareag.recruitee.com/o/some-job')).toMatchObject({ ats: 'recruitee', company: 'shopwareag' })
    expect(parsePostingUrl('https://boards.greenhouse.io/n26/jobs/7965433')).toMatchObject({ ats: 'greenhouse', postingRef: '7965433' })
    expect(parsePostingUrl('https://jobs.lever.co/emma-sleep/be3ee809-x')).toMatchObject({ ats: 'lever' })
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
