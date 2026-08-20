import { applyHardFilters, isFresh } from './match.js'
import { renderIndex, upsertNote } from './notes.js'
import { postingToNoteInput } from './sources/normalize.js'
import { getAdapter } from './sources/index.js'
import type { Profile } from './profile.js'
import type { Sources } from './sources-store.js'
import type { HttpClient, JobPosting } from './sources/types.js'

export interface CrawlSummary {
  fetched: number
  created: number
  updated: number
  cut: number
  stale: number
  errors: { source: string; message: string }[]
}

interface FetchedBatch {
  postings: JobPosting[]
  /** Board finds outside the freshness window are skipped, company ones not. */
  applyFreshness: boolean
}

async function fetchAll(
  client: HttpClient,
  sources: Sources,
  errors: CrawlSummary['errors'],
): Promise<FetchedBatch[]> {
  const batches: FetchedBatch[] = []
  for (const board of sources.boards) {
    try {
      const adapter = getAdapter(board)
      batches.push({
        postings: await adapter.fetchBoard!(client),
        applyFreshness: true,
      })
    } catch (error) {
      errors.push({ source: board, message: String(error instanceof Error ? error.message : error) })
    }
  }
  for (const company of sources.companies) {
    try {
      const adapter = getAdapter(company.ats)
      batches.push({
        postings: await adapter.fetchCompany!(client, company.slug),
        applyFreshness: false,
      })
    } catch (error) {
      errors.push({
        source: `${company.ats}:${company.slug}`,
        message: String(error instanceof Error ? error.message : error),
      })
    }
  }
  return batches
}

/**
 * Fetches every configured source, hard-filters, and upserts job notes.
 * Agent channels in sources.channels are intentionally not touched — the
 * agent runs those itself and feeds findings through the import path.
 */
export async function crawl(
  client: HttpClient,
  profile: Profile,
  sources: Sources,
  options: { today?: string } = {},
): Promise<CrawlSummary> {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const summary: CrawlSummary = {
    fetched: 0,
    created: 0,
    updated: 0,
    cut: 0,
    stale: 0,
    errors: [],
  }

  const batches = await fetchAll(client, sources, summary.errors)
  for (const batch of batches) {
    for (const posting of batch.postings) {
      summary.fetched++
      if (batch.applyFreshness && !isFresh(posting, profile.search.maxAgeDays, today)) {
        summary.stale++
        continue
      }
      ingest(posting, profile, today, summary)
    }
  }

  renderIndex(profile.paths.notesDir)
  return summary
}

function ingest(
  posting: JobPosting,
  profile: Profile,
  today: string,
  summary: CrawlSummary,
): void {
  const verdict = applyHardFilters(posting, profile)
  const input = postingToNoteInput(posting, today)
  if (!verdict.passed) {
    input.status = 'cut'
    input.cutReason = verdict.cutReason
    input.cutNote = verdict.cutNote
  }
  const result = upsertNote(
    profile.paths.notesDir,
    input,
    posting.descriptionHtml ?? '',
  )
  if (!result.created) summary.updated++
  else if (verdict.passed) summary.created++
  else summary.cut++
}
