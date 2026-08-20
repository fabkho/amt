import { applyHardFilters, isFresh, isRelevant } from './match.js'
import { dedupeKey, listNotes, renderIndex, upsertNote } from './notes.js'
import { loadSeen, markSeen, saveSeen, type SeenLedger } from './seen.js'
import { postingToNoteInput } from './sources/normalize.js'
import { getAdapter } from './sources/index.js'
import type { Profile } from './profile.js'
import type { Sources } from './sources-store.js'
import type { HttpClient, JobPosting } from './sources/types.js'

export interface CrawlSummary {
  fetched: number
  /** New notes — postings actually worth a human look. */
  created: number
  /** Existing notes refreshed with current posting facts. */
  refreshed: number
  /** Mechanically filtered out by the hard rules — ledger only, no file. */
  filtered: number
  /** No stack keyword matched — ledger only, no file. */
  offStack: number
  /** Already judged in an earlier crawl. */
  known: number
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

interface IngestContext {
  profile: Profile
  ledger: SeenLedger
  /** dedupe key → note slug, for postings that already have a note. */
  noted: Map<string, string>
  today: string
  summary: CrawlSummary
}

/**
 * Notes are created only for postings that are stack-relevant AND pass the
 * hard filters. Everything else goes into the seen ledger so it never
 * surfaces again — without leaving a file behind.
 */
function ingest(posting: JobPosting, ctx: IngestContext): void {
  const key = `${posting.source}:${posting.nativeId}`

  // An existing note always wins over the ledger — the user may have
  // imported something the crawler once dismissed.
  if (ctx.noted.has(key)) {
    upsertNote(
      ctx.profile.paths.notesDir,
      postingToNoteInput(posting, ctx.today),
      posting.descriptionHtml ?? '',
    )
    ctx.summary.refreshed++
    return
  }
  if (ctx.ledger[key]) {
    ctx.summary.known++
    return
  }

  if (!isRelevant(posting, ctx.profile.search)) {
    markSeen(ctx.ledger, key, 'off-stack', null, ctx.today)
    ctx.summary.offStack++
    return
  }
  const verdict = applyHardFilters(posting, ctx.profile)
  if (!verdict.passed) {
    markSeen(ctx.ledger, key, 'filtered', verdict.cutReason, ctx.today)
    ctx.summary.filtered++
    return
  }

  const result = upsertNote(
    ctx.profile.paths.notesDir,
    postingToNoteInput(posting, ctx.today),
    posting.descriptionHtml ?? '',
  )
  ctx.noted.set(key, result.slug)
  ctx.summary.created++
}

export async function crawl(
  client: HttpClient,
  home: string,
  profile: Profile,
  sources: Sources,
  options: { today?: string } = {},
): Promise<CrawlSummary> {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const summary: CrawlSummary = {
    fetched: 0,
    created: 0,
    refreshed: 0,
    filtered: 0,
    offStack: 0,
    known: 0,
    stale: 0,
    errors: [],
  }

  const ctx: IngestContext = {
    profile,
    ledger: loadSeen(home),
    noted: new Map(
      listNotes(profile.paths.notesDir).map(s => [dedupeKey(s.note), s.note.slug]),
    ),
    today,
    summary,
  }

  const batches = await fetchAll(client, sources, summary.errors)
  for (const batch of batches) {
    for (const posting of batch.postings) {
      summary.fetched++
      if (batch.applyFreshness && !isFresh(posting, profile.search.maxAgeDays, today)) {
        summary.stale++
        continue
      }
      ingest(posting, ctx)
    }
  }

  saveSeen(home, ctx.ledger)
  renderIndex(profile.paths.notesDir)
  return summary
}
