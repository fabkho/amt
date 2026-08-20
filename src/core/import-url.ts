import { JobKitError } from './errors.js'
import { getAdapter } from './sources/index.js'
import type { HttpClient, JobPosting } from './sources/types.js'

export interface ParsedPostingUrl {
  ats: string
  company: string
  /** Native id or offer slug identifying the posting within the company. */
  postingRef: string
}

const URL_PATTERNS: { ats: string; pattern: RegExp }[] = [
  { ats: 'recruitee', pattern: /^https?:\/\/([\w-]+)\.recruitee\.com\/o\/([\w-]+)/ },
  { ats: 'greenhouse', pattern: /^https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/ },
  { ats: 'lever', pattern: /^https?:\/\/jobs\.(?:eu\.)?lever\.co\/([\w-]+)\/([\w-]+)/ },
  { ats: 'personio', pattern: /^https?:\/\/([\w-]+)\.jobs\.personio\.de\/job\/(\d+)/ },
  { ats: 'smartrecruiters', pattern: /^https?:\/\/jobs\.smartrecruiters\.com\/([\w-]+)\/(\d+)/ },
]

export function parsePostingUrl(url: string): ParsedPostingUrl | null {
  for (const { ats, pattern } of URL_PATTERNS) {
    const match = url.match(pattern)
    if (match) return { ats, company: match[1]!, postingRef: match[2]! }
  }
  return null
}

/**
 * Resolves a pasted ATS posting URL to its normalized posting by fetching the
 * company's board and matching the reference. Non-ATS URLs (LinkedIn,
 * StepStone …) cannot be resolved deterministically — the agent supplies the
 * fields for those and writes a manual note instead.
 */
export async function importPostingFromUrl(
  client: HttpClient,
  url: string,
): Promise<{ parsed: ParsedPostingUrl; posting: JobPosting }> {
  const parsed = parsePostingUrl(url)
  if (!parsed) {
    throw new JobKitError(
      'URL_NOT_RECOGNIZED',
      `Not a recognized ATS posting URL: ${url}. For other sources, create a manual note with explicit fields.`,
    )
  }
  const postings = await getAdapter(parsed.ats).fetchCompany!(client, parsed.company)
  const posting = postings.find(
    p =>
      p.nativeId === parsed.postingRef
      || p.url.includes(`/${parsed.postingRef}`),
  )
  if (!posting) {
    throw new JobKitError(
      'POSTING_NOT_FOUND',
      `Posting ${parsed.postingRef} not found on ${parsed.ats}:${parsed.company} — it may be closed.`,
    )
  }
  return { parsed, posting }
}
