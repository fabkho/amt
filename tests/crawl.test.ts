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

async function testProfile(notesDir: string): Promise<Profile> {
  const base = await loadProfile(join(import.meta.dirname, 'fixtures/profile-home'))
  return profileSchema.parse({
    ...base,
    paths: { ...base.paths, notesDir, outputBase: notesDir },
  })
}

describe('crawl', () => {
  const sources = sourcesSchema.parse({
    boards: ['arbeitnow'],
    companies: [{ name: 'shopware', ats: 'recruitee', slug: 'shopwareag' }],
  })

  it('fetches boards and companies, filters, and writes notes', async () => {
    const notesDir = mkdtempSync(join(tmpdir(), 'job-kit-crawl-'))
    const profile = await testProfile(notesDir)

    const summary = await crawl(routedClient, profile, sources, {
      today: '2026-08-20',
    })
    expect(summary.fetched).toBe(4) // 2 arbeitnow + 2 recruitee
    expect(summary.errors).toHaveLength(0)
    expect(summary.created + summary.cut + summary.stale).toBe(4)

    const notes = listNotes(notesDir)
    expect(notes.length).toBe(summary.created + summary.cut)
    // auto-cut notes carry a reason
    for (const { note } of notes.filter(n => n.note.status === 'cut')) {
      expect(note.cutReason).not.toBeNull()
    }
  })

  it('is idempotent — re-crawling refreshes instead of duplicating', async () => {
    const notesDir = mkdtempSync(join(tmpdir(), 'job-kit-crawl-'))
    const profile = await testProfile(notesDir)
    await crawl(routedClient, profile, sources, { today: '2026-08-20' })
    const first = listNotes(notesDir).length
    const summary = await crawl(routedClient, profile, sources, { today: '2026-08-20' })
    expect(listNotes(notesDir)).toHaveLength(first)
    expect(summary.updated).toBeGreaterThan(0)
  })

  it('isolates per-source failures', async () => {
    const notesDir = mkdtempSync(join(tmpdir(), 'job-kit-crawl-'))
    const profile = await testProfile(notesDir)
    const broken = sourcesSchema.parse({
      boards: ['arbeitnow'],
      companies: [{ name: 'ghost', ats: 'recruitee', slug: 'ghost' }],
    })
    const summary = await crawl(routedClient, profile, broken, { today: '2026-08-20' })
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
