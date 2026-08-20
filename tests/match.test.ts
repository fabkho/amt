import { describe, expect, it } from 'vite-plus/test'
import {
  applyHardFilters,
  extractYearsRequired,
  isFresh,
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

  it('cuts salary bands starting below the floor', () => {
    const result = applyHardFilters(posting({ salaryMin: 55_000 }), profile)
    expect(result.cutReason).toBe('salary_below_floor')
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
})
