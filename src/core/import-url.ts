import { AmtError } from './errors.js'
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
  { ats: 'ashby', pattern: /^https?:\/\/jobs\.ashbyhq\.com\/([\w-]+)\/([\w-]+)/ },
  { ats: 'greenhouse', pattern: /^https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/ },
  { ats: 'lever', pattern: /^https?:\/\/jobs\.(?:eu\.)?lever\.co\/([\w-]+)\/([\w-]+)/ },
  { ats: 'personio', pattern: /^https?:\/\/([\w-]+)\.jobs\.personio\.de\/job\/(\d+)/ },
  { ats: 'smartrecruiters', pattern: /^https?:\/\/jobs\.smartrecruiters\.com\/([\w-]+)\/(\d+)/ },
]

export interface ManualFields {
  company: string
  title: string
  descriptionHtml?: string | null
  location?: string | null
  workMode?: 'remote' | 'hybrid' | 'onsite' | null
  salaryMin?: number | null
  salaryMax?: number | null
  publishedAt?: string | null
}

/** Posting shape for non-ATS sources (LinkedIn, StepStone, agent channels). */
export function manualPosting(url: string, fields: ManualFields): JobPosting {
  return {
    source: 'manual',
    nativeId: url,
    company: fields.company,
    title: fields.title,
    url,
    descriptionHtml: fields.descriptionHtml ?? null,
    location: fields.location ?? null,
    workMode: fields.workMode ?? null,
    salaryMin: fields.salaryMin ?? null,
    salaryMax: fields.salaryMax ?? null,
    salaryCurrency: null,
    publishedAt: fields.publishedAt ?? null,
    tags: [],
  }
}

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
    throw new AmtError(
      'URL_NOT_RECOGNIZED',
      `Not a recognized ATS posting URL: ${url}. For other sources, pass explicit fields: amt import <url> --company <name> --title <title> (or the MCP import_job manual fields).`,
    )
  }
  const postings = await getAdapter(parsed.ats).fetchCompany!(client, parsed.company)
  const posting = postings.find(
    p =>
      p.nativeId === parsed.postingRef
      || p.url.includes(`/${parsed.postingRef}`),
  )
  if (!posting) {
    throw new AmtError(
      'POSTING_NOT_FOUND',
      `Posting ${parsed.postingRef} not found on ${parsed.ats}:${parsed.company} — it may be closed.`,
    )
  }
  return { parsed, posting }
}
