import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  getAdapter,
  listAdapters,
  postingToNoteInput,
  toIsoDate,
  unescapeHtml,
  type HttpClient,
} from '../src/index.js'

const fixturesDir = join(import.meta.dirname, 'fixtures/sources')

function fixtureClient(file: string): HttpClient {
  const load = () => readFileSync(join(fixturesDir, file), 'utf-8')
  return {
    json: async () => JSON.parse(load()) as unknown,
    text: async () => load(),
  }
}

describe('normalize helpers', () => {
  it('converts epoch seconds, epoch millis, and UTC strings to ISO dates', () => {
    expect(toIsoDate(1787238038)).toBe('2026-08-20')
    expect(toIsoDate(1783109951806)).toBe('2026-07-03')
    expect(toIsoDate('2026-08-19 11:05:24 UTC')).toBe('2026-08-19')
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate('not a date')).toBeNull()
  })

  it('unescapes exactly one HTML layer', () => {
    expect(unescapeHtml('&lt;p&gt;Tom &amp;amp; Jerry&lt;/p&gt;'))
      .toBe('<p>Tom &amp; Jerry</p>')
  })
})

describe('registry', () => {
  it('knows all seven adapters', () => {
    expect(listAdapters().map(a => a.name)).toEqual([
      'recruitee',
      'ashby',
      'greenhouse',
      'lever',
      'personio',
      'smartrecruiters',
      'arbeitnow',
    ])
  })

  it('throws a coded error for unknown sources', () => {
    expect(() => getAdapter('nope')).toThrowError(/Unknown source/)
  })
})

describe('recruitee', () => {
  it('normalizes offers with explicit work-mode flags', async () => {
    const postings = await getAdapter('recruitee').fetchCompany!(
      fixtureClient('recruitee.json'),
      'shopwareag',
    )
    expect(postings).toHaveLength(2)
    const [first] = postings
    expect(first!.source).toBe('recruitee')
    expect(first!.company).toBe('shopware AG')
    expect(first!.workMode).toBe('remote')
    expect(first!.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(first!.url).toContain('recruitee.com/o/')
  })
})

describe('greenhouse', () => {
  it('unescapes content and parses first_published', async () => {
    const postings = await getAdapter('greenhouse').fetchCompany!(
      fixtureClient('greenhouse.json'),
      'n26',
    )
    expect(postings.length).toBeGreaterThan(0)
    const [first] = postings
    expect(first!.company).toBe('N26')
    expect(first!.descriptionHtml).not.toContain('&lt;')
    expect(first!.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('lever', () => {
  it('maps workplaceType and epoch-ms createdAt', async () => {
    const postings = await getAdapter('lever').fetchCompany!(
      fixtureClient('lever.json'),
      'emma-sleep',
    )
    const [first] = postings
    expect(first!.workMode).toBe('hybrid')
    expect(first!.publishedAt).toBe('2026-07-03')
    expect(first!.location).toBe('Mexico City')
  })
})

describe('personio', () => {
  it('parses the XML feed and detects remote offices', async () => {
    const postings = await getAdapter('personio').fetchCompany!(
      fixtureClient('personio.xml'),
      'gridx',
    )
    expect(postings).toHaveLength(2)
    const [first] = postings
    expect(first!.company).toBe('gridX GmbH')
    expect(first!.workMode).toBe('remote') // office "Remote DE; Aachen; Munich"
    expect(first!.tags).toContain('golang')
  })
})

describe('smartrecruiters', () => {
  it('normalizes list items with remote and hybrid booleans', async () => {
    const postings = await getAdapter('smartrecruiters').fetchCompany!(
      fixtureClient('smartrecruiters-list.json'),
      'BoschGroup',
    )
    const [first] = postings
    expect(first!.company).toBe('Bosch Group')
    expect(first!.workMode).toBe('hybrid')
    expect(first!.descriptionHtml).toBeNull() // detail is a second request
  })

  it('flags totalFound 0 as SOURCE_EMPTY — a probe miss, a tracked-company no-op', async () => {
    const empty: HttpClient = {
      json: async () => ({ totalFound: 0, content: [] }),
      text: async () => '',
    }
    await expect(
      getAdapter('smartrecruiters').fetchCompany!(empty, 'wrong-slug'),
    ).rejects.toMatchObject({ code: 'SOURCE_EMPTY' })
  })

  it('fetches the description via the detail endpoint', async () => {
    const files: Record<string, string> = {
      postings: 'smartrecruiters-list.json',
      '744000144588559': 'smartrecruiters-detail.json',
    }
    const client: HttpClient = {
      json: async (url) => {
        const file = url.includes('/postings/') ? files[url.split('/').pop()!] : files.postings
        return JSON.parse(readFileSync(join(fixturesDir, file!), 'utf-8')) as unknown
      },
      text: async () => '',
    }
    const html = await getAdapter('smartrecruiters').fetchDetail!(client, 'BoschGroup', '744000144588559')
    expect(html).toBeTruthy()
  })
})

describe('arbeitnow', () => {
  it('normalizes board jobs including tags and epoch-second dates', async () => {
    const postings = await getAdapter('arbeitnow').fetchBoard!(
      fixtureClient('arbeitnow.json'),
    )
    expect(postings).toHaveLength(2)
    const [first] = postings
    expect(first!.company).toBe('Manzke Gruppe')
    expect(first!.publishedAt).toBe('2026-08-20')
    expect(first!.tags).toEqual([]) // board categories are not a tech stack
  })
})

describe('ashby', () => {
  it('normalizes postings with structured compensation', async () => {
    const postings = await getAdapter('ashby').fetchCompany!(
      fixtureClient('ashby.json'),
      'n8n',
    )
    expect(postings).toHaveLength(2)
    const [first, second] = postings
    expect(first!.workMode).toBe('remote')
    expect(second!.workMode).toBe('hybrid')
    expect(first!.salaryMin).toBe(89_700) // "€89.7K - €132.4K"
    expect(first!.salaryMax).toBe(132_400)
    expect(second!.salaryMin).toBe(38_400) // "€38,400 - €52,800"
    expect(first!.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('arbeitnow resilience', () => {
  it('skips malformed entries instead of failing the board', async () => {
    const fixture = JSON.parse(
      readFileSync(join(fixturesDir, 'arbeitnow.json'), 'utf-8'),
    ) as { data: unknown[] }
    // live-observed shape drift: job_types as object, plus a broken entry
    fixture.data.push(
      { ...(fixture.data[0] as object), slug: 'obj-types', job_types: { a: 'x' } },
      { slug: 'missing-everything' },
    )
    const client: HttpClient = {
      json: async () => fixture,
      text: async () => '',
    }
    const postings = await getAdapter('arbeitnow').fetchBoard!(client)
    expect(postings).toHaveLength(3) // 2 fixtures + tolerant obj-types entry
    expect(postings.find(p => p.nativeId === 'obj-types')).toBeDefined()
  })
})

describe('postingToNoteInput', () => {
  it('bridges a posting into a valid note input', async () => {
    const [posting] = await getAdapter('arbeitnow').fetchBoard!(
      fixtureClient('arbeitnow.json'),
    )
    const input = postingToNoteInput(posting!, '2026-08-20')
    expect(input.slug).toMatch(/^manzke-gruppe-/)
    expect(input.nativeId).toBe(posting!.nativeId)
    expect(input.discoveredAt).toBe('2026-08-20')
  })
})
