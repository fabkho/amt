import { describe, expect, it } from 'vite-plus/test'
import {
  applyHardFilters,
  extractYearsRequired,
  isFresh,
  isRelevant,
  loadProfile,
  type JobPosting,
} from '../src/index.js'
import { join } from 'node:path'

const fixtureHome = join(import.meta.dirname, 'fixtures/profile-home')

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    source: 'arbeitnow',
    nativeId: 'x',
    company: 'Acme GmbH',
    title: 'Senior Frontend Engineer',
    url: 'https://example.com',
    descriptionHtml: null,
    location: null,
    workMode: 'remote',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    publishedAt: null,
    tags: [],
    ...overrides,
  }
}

describe('extractYearsRequired', () => {
  it('finds English and German patterns', () => {
    expect(extractYearsRequired('5+ years of PHP')).toBe(5)
    expect(extractYearsRequired('mindestens 6 Jahren Erfahrung')).toBe(6)
    expect(extractYearsRequired('at least 7 years experience')).toBe(7)
    expect(extractYearsRequired('3+ Jahre Vue, 8+ years backend')).toBe(8)
    expect(extractYearsRequired('a great team')).toBeNull()
  })
})

describe('isRelevant', () => {
  const search = { stacksPrimary: ['vue', 'typescript'], stacksSecondary: ['php'] }

  it('matches stack keywords in title, tags, or description', () => {
    expect(isRelevant(posting({ title: 'Vue.js Developer' }), search)).toBe(true)
    expect(isRelevant(posting({ title: 'Engineer', tags: ['PHP'] }), search)).toBe(true)
    expect(
      isRelevant(posting({ title: 'Engineer', descriptionHtml: 'We use TypeScript.' }), search),
    ).toBe(true)
    expect(isRelevant(posting({ title: 'Account Executive' }), search)).toBe(false)
  })

  it('matches whole words only — no substring false positives', () => {
    expect(isRelevant(posting({ title: 'Creator Success at Fanvue' }), search)).toBe(false)
    expect(
      isRelevant(posting({ descriptionHtml: 'network nodes and pipelines' }), {
        stacksPrimary: ['node'],
        stacksSecondary: [],
      }),
    ).toBe(false)
    expect(
      isRelevant(posting({ descriptionHtml: 'We run Node.js services.' }), {
        stacksPrimary: ['node'],
        stacksSecondary: [],
      }),
    ).toBe(true)
  })

  it('ignores HTML markup — keywords in attributes do not count', () => {
    const nodeOnly = { stacksPrimary: ['node'], stacksSecondary: [] }
    expect(
      isRelevant(
        posting({ descriptionHtml: '<ul data-is-last-node="" data-is-only-node=""><li>Marketing</li></ul>' }),
        nodeOnly,
      ),
    ).toBe(false)
    expect(
      isRelevant(posting({ descriptionHtml: '<p>We run <b>Node</b> services.</p>' }), nodeOnly),
    ).toBe(true)
    const phpOnly = { stacksPrimary: ['php'], stacksSecondary: [] }
    expect(
      isRelevant(
        posting({ descriptionHtml: 'Bewerbung: https://x.org/applicationForm.php?sid=1' }),
        phpOnly,
      ),
    ).toBe(false)
    expect(isRelevant(posting({ descriptionHtml: 'Wir suchen PHP-Entwickler.' }), phpOnly))
      .toBe(true)
  })

  it('matches keywords with non-word edges (c++, .net, c#)', () => {
    const edgy = { stacksPrimary: ['c++', '.net', 'c#'], stacksSecondary: [] }
    expect(isRelevant(posting({ descriptionHtml: 'modern C++ services' }), edgy)).toBe(true)
    expect(isRelevant(posting({ descriptionHtml: 'ASP.NET experience' }), edgy)).toBe(true)
    expect(isRelevant(posting({ descriptionHtml: 'we use C# daily' }), edgy)).toBe(true)
    expect(isRelevant(posting({ descriptionHtml: 'plain c programming' }), edgy)).toBe(false)
  })

  it('treats empty stacks as match-all', () => {
    expect(
      isRelevant(posting({ title: 'Anything' }), { stacksPrimary: [], stacksSecondary: [] }),
    ).toBe(true)
  })
})

describe('isFresh', () => {
  it('compares against maxAgeDays and tolerates unknown dates', () => {
    expect(isFresh({ publishedAt: '2026-08-15' }, 7, '2026-08-20')).toBe(true)
    expect(isFresh({ publishedAt: '2026-08-01' }, 7, '2026-08-20')).toBe(false)
    expect(isFresh({ publishedAt: null }, 7, '2026-08-20')).toBe(true)
  })
})

describe('applyHardFilters', async () => {
  const profile = await loadProfile(fixtureHome)

  it('passes a matching remote posting', () => {
    expect(applyHardFilters(posting(), profile).passed).toBe(true)
  })

  it('cuts blocklisted title phrases', () => {
    const result = applyHardFilters(
      posting({ title: 'Vibe Coding Engineer' }),
      profile,
    )
    expect(result.cutReason).toBe('buzzword')
  })

  it('cuts only bands that top out below the floor', () => {
    // whole band below floor → cut
    expect(
      applyHardFilters(posting({ salaryMin: 40_000, salaryMax: 55_000 }), profile).cutReason,
    ).toBe('salary_below_floor')
    // band crossing the floor → keep: upper half is reachable
    expect(
      applyHardFilters(posting({ salaryMin: 58_000, salaryMax: 90_000 }), profile).passed,
    ).toBe(true)
    // min-only is open upward → keep
    expect(applyHardFilters(posting({ salaryMin: 55_000 }), profile).passed).toBe(true)
    // no salary data → no cut
    expect(applyHardFilters(posting(), profile).passed).toBe(true)
  })

  it('cuts postings requiring more years than the profile allows', () => {
    const result = applyHardFilters(
      posting({ descriptionHtml: 'You bring 5+ years of experience.' }),
      profile,
    )
    expect(result.cutReason).toBe('years_required')
    expect(
      applyHardFilters(
        posting({ descriptionHtml: '3+ years of Vue' }),
        profile,
      ).passed,
    ).toBe(true)
  })

  it('cuts locations on the blocklist regardless of work mode', async () => {
    const base = await loadProfile(fixtureHome)
    const blocked = {
      ...base,
      search: { ...base.search, locationBlocklist: ['london', 'united states'] },
    }
    expect(
      applyHardFilters(posting({ workMode: 'remote', location: 'London, UK' }), blocked).cutReason,
    ).toBe('location')
    expect(
      applyHardFilters(posting({ workMode: 'remote', location: 'Berlin' }), blocked).passed,
    ).toBe(true)
  })

  it('cuts explicit onsite/hybrid outside the profile cities', () => {
    const result = applyHardFilters(
      posting({ workMode: 'hybrid', location: 'Hamburg, Germany' }),
      profile,
    )
    expect(result.cutReason).toBe('location')
    // fixture profile allows Berlin
    expect(
      applyHardFilters(
        posting({ workMode: 'hybrid', location: 'Berlin, Germany' }),
        profile,
      ).passed,
    ).toBe(true)
    // unknown work mode stays with the agent
    expect(
      applyHardFilters(
        posting({ workMode: null, location: 'Hamburg' }),
        profile,
      ).passed,
    ).toBe(true)
  })

  it('does not cut a profile city under its English exonym', async () => {
    const base = await loadProfile(fixtureHome)
    const koeln = {
      ...base,
      search: {
        ...base.search,
        locations: { remote: false, cities: [{ name: 'Köln', minHomeOfficeDays: 3 }] },
      },
    }
    // "Cologne" / "München"→"Munich" must be recognized as the profile cities
    expect(
      applyHardFilters(posting({ workMode: 'hybrid', location: 'Cologne, Germany' }), koeln).passed,
    ).toBe(true)
    // a genuinely different city still cuts
    expect(
      applyHardFilters(posting({ workMode: 'onsite', location: 'Munich, Germany' }), koeln).cutReason,
    ).toBe('location')
  })
})
