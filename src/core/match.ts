import type { CutReason } from './notes.js'
import type { Profile } from './profile.js'
import type { JobPosting } from './sources/types.js'

// Only the deterministic part of screening lives here — the hard cuts that
// need no judgment. Scoring and everything debatable stays with the agent.

export interface MatchResult {
  passed: boolean
  cutReason: CutReason | null
  cutNote: string | null
}

const PASS: MatchResult = { passed: true, cutReason: null, cutNote: null }

function cut(reason: CutReason, note: string): MatchResult {
  return { passed: false, cutReason: reason, cutNote: note }
}

// "5+ years", "5+ Jahre", "mindestens 5 Jahre", "at least 5 years",
// "ab 5 Jahren", "minimum of 5 years" — the patterns from the ads that
// triggered manual cuts before.
const YEARS_PATTERNS = [
  /(\d{1,2})\s*\+\s*(?:years?|yrs?|jahren?)/gi,
  /(?:mindestens|at least|minimum(?: of)?|min\.|ab)\s+(\d{1,2})\s+(?:years?|yrs?|jahren?)/gi,
]

export function extractYearsRequired(text: string): number | null {
  let max: number | null = null
  for (const pattern of YEARS_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const years = Number(match[1])
      if (!Number.isNaN(years) && (max === null || years > max)) max = years
    }
  }
  return max
}

/**
 * A posting is only worth a note when it touches the user's stacks at all —
 * tracked companies and boards both ship sales/ops postings. Empty stacks
 * mean "everything is relevant".
 */
export function isRelevant(
  posting: Pick<JobPosting, 'title' | 'tags' | 'descriptionHtml'>,
  search: Pick<Profile['search'], 'stacksPrimary' | 'stacksSecondary'>,
): boolean {
  const keywords = [...search.stacksPrimary, ...search.stacksSecondary]
  if (keywords.length === 0) return true
  // Match against visible text only — raw HTML is full of attribute noise
  // ("data-is-last-node" must not count as "node"), and URLs are full of
  // technology noise ("applicationForm.php?sid=…" must not count as "php").
  const description = (posting.descriptionHtml ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
  const haystack = `${posting.title}\n${posting.tags.join('\n')}\n${description}`
  // Word boundaries, not substrings — "vue" must not match "Fanvue", nor
  // "node" match inside longer words. \b fails at non-word edges ("c++",
  // ".net", "c#"), so the boundary is chosen per edge character.
  return keywords.some(keyword => keywordPattern(keyword).test(haystack))
}

function keywordPattern(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  // Word-initial keywords must not match inside words ("vue" in "Fanvue");
  // symbol-initial ones ('.net') legitimately attach to words ("ASP.NET").
  const prefix = /^\w/.test(keyword) ? String.raw`\b` : String.raw`(?<![.+#])`
  const suffix = /\w$/.test(keyword) ? String.raw`\b` : String.raw`(?![\w.+#])`
  return new RegExp(`${prefix}${escaped}${suffix}`, 'i')
}

export function isFresh(
  posting: Pick<JobPosting, 'publishedAt'>,
  maxAgeDays: number,
  today: string,
): boolean {
  if (!posting.publishedAt) return true // unknown age never disqualifies
  const age
    = (Date.parse(today) - Date.parse(posting.publishedAt)) / 86_400_000
  return age <= maxAgeDays
}

type Search = Profile['search']
type Check = (posting: JobPosting, search: Search) => MatchResult | null

const checkTitleBlocklist: Check = (posting, search) => {
  const title = posting.title.toLowerCase()
  const hit = search.titleBlocklist.find(p => title.includes(p.toLowerCase()))
  return hit ? cut('buzzword', `title contains "${hit}"`) : null
}

const checkCompanyBlocklist: Check = (posting, search) => {
  const company = posting.company.toLowerCase()
  const hit = search.companyBlocklist.find(c => company.includes(c.toLowerCase()))
  return hit ? cut('personal_fit', `company blocklist: ${hit}`) : null
}

/**
 * Cuts only when the ENTIRE band sits below the floor (max < floor). A wide
 * band like 65-90k stays in: a senior realistically lands in its upper half.
 * Min-only postings pass (open upward); absent salary data never cuts.
 */
const checkSalaryFloor: Check = (posting, search) => {
  if (posting.salaryMax === null || posting.salaryMax >= search.salaryFloor) return null
  return cut(
    'salary_below_floor',
    `band tops out at ${posting.salaryMax} < floor ${search.salaryFloor}`,
  )
}

const checkYearsRequired: Check = (posting, search) => {
  if (search.maxYearsRequired === undefined) return null
  const years = extractYearsRequired(
    `${posting.title}\n${posting.descriptionHtml ?? ''}`,
  )
  if (years === null || years <= search.maxYearsRequired) return null
  return cut('years_required', `${years}+ years required`)
}

/**
 * Only cuts when the posting is explicit about being on-site or hybrid
 * somewhere that matches none of the profile cities. Unknown work mode stays
 * with the agent.
 */
const checkLocation: Check = (posting, search) => {
  const explicit = posting.workMode === 'onsite' || posting.workMode === 'hybrid'
  if (!explicit || !posting.location) return null
  const location = posting.location.toLowerCase()
  const matchesCity = search.locations.cities.some(city =>
    location.includes(city.name.toLowerCase()),
  )
  return matchesCity
    ? null
    : cut('location', `${posting.workMode} in ${posting.location}`)
}

const checkLocationBlocklist: Check = (posting, search) => {
  if (!posting.location) return null
  const location = posting.location.toLowerCase()
  const hit = search.locationBlocklist.find(entry => location.includes(entry.toLowerCase()))
  return hit ? cut('location', `location blocklist: ${hit} (${posting.location})`) : null
}

const CHECKS: readonly Check[] = [
  checkTitleBlocklist,
  checkLocationBlocklist,
  checkCompanyBlocklist,
  checkSalaryFloor,
  checkYearsRequired,
  checkLocation,
]

export function applyHardFilters(
  posting: JobPosting,
  profile: Profile,
): MatchResult {
  for (const check of CHECKS) {
    const result = check(posting, profile.search)
    if (result) return result
  }
  return PASS
}
