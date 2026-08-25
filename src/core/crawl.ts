import { AmtError } from './errors.js'
import { applyHardFilters, isFresh, isRelevant } from './match.js'
import { dedupeKey, descriptionText, findProbableDuplicates, listNotes, readNote, renderIndex, slugify, upsertNote } from './notes.js'
import { loadSeen, markSeen, saveSeen, type SeenLedger } from './seen.js'
import { htmlToMarkdown, postingToNoteInput } from './sources/normalize.js'
import { resolveCompanyLogo } from './sources/logo.js'
import { channelDetailFetcher, fetchChannel, isCrawlableChannel } from './sources/channel.js'
import { getAdapter } from './sources/index.js'
import type { Profile } from './profile.js'
import type { Sources } from './sources-store.js'
import type { HttpClient, JobPosting, SourceAdapter } from './sources/types.js'

export interface CrawlSummary {
  fetched: number
  /** New notes — postings actually worth a human look. */
  created: number
  createdSlugs: string[]
  /** Existing notes refreshed with current posting facts. */
  refreshed: number
  /** Mechanically filtered out by the hard rules — ledger only, no file. */
  filtered: number
  /** No stack keyword matched — ledger only, no file. */
  offStack: number
  /** Already judged in an earlier crawl. */
  known: number
  stale: number
  /** New notes that fuzzy-match an existing note at the same company. */
  probableDuplicates: { slug: string; of: string }[]
  errors: { source: string; message: string }[]
  /** What to do now — surfaced verbatim by the CLI and MCP layers. */
  next: string
}

interface FetchedBatch {
  adapter: SourceAdapter
  companySlug: string | null
  postings: JobPosting[]
  /** Board finds outside the freshness window are skipped, company ones not. */
  applyFreshness: boolean
}

// Boards rotate fast — one page misses postings that scrolled past between
// crawls. Three pages plus the freshness window keeps coverage and cost sane.
const BOARD_PAGES = 3

async function fetchBoardBatch(
  client: HttpClient,
  board: string,
  search: Profile['search'],
): Promise<FetchedBatch> {
  const adapter = getAdapter(board)
  return {
    adapter,
    companySlug: null,
    postings: await adapter.fetchBoard!(client, {
      pages: BOARD_PAGES,
      // Search-API boards (Arbeitsagentur) query by these; list boards ignore them.
      keywords: [...search.stacksPrimary, ...search.stacksSecondary],
      cities: search.locations.cities.map(c => c.name),
      remote: search.locations.remote,
    }),
    applyFreshness: true,
  }
}

async function fetchChannelBatch(
  client: HttpClient,
  channel: Sources['channels'][number],
  search: Profile['search'],
): Promise<FetchedBatch> {
  const postings = await fetchChannel(client, channel, {
    stacks: [...search.stacksPrimary, ...search.stacksSecondary],
    cities: search.locations.cities.map(c => c.name),
  })
  // A synthetic board adapter: the detail fetcher pulls each posting's
  // description on demand, exactly like the SmartRecruiters N+1 path.
  const adapter: SourceAdapter = {
    name: channel.name,
    kind: 'board',
    fetchDetail: channelDetailFetcher(channel),
  }
  return { adapter, companySlug: null, postings, applyFreshness: true }
}

async function fetchCompanyBatch(
  client: HttpClient,
  company: Sources['companies'][number],
): Promise<FetchedBatch> {
  const adapter = getAdapter(company.ats)
  const postings = (await adapter.fetchCompany!(client, company.slug))
    // Some ATS payloads carry no display name — fall back to the name the
    // user gave the company when tracking it.
    .map(p => (p.company === company.slug ? { ...p, company: company.name } : p))
  return { adapter, companySlug: company.slug, postings, applyFreshness: false }
}

async function fetchAll(
  client: HttpClient,
  sources: Sources,
  search: Profile['search'],
  errors: CrawlSummary['errors'],
): Promise<FetchedBatch[]> {
  const batches: FetchedBatch[] = []
  const jobs: { source: string; run: () => Promise<FetchedBatch> }[] = [
    ...sources.boards.map(board => ({ source: board, run: () => fetchBoardBatch(client, board, search) })),
    ...sources.companies.map(company => ({
      source: `${company.ats}:${company.slug}`,
      run: () => fetchCompanyBatch(client, company),
    })),
    ...sources.channels.filter(isCrawlableChannel).map(channel => ({
      source: `channel:${channel.name}`,
      run: () => fetchChannelBatch(client, channel, search),
    })),
  ]
  for (const job of jobs) {
    try {
      batches.push(await job.run())
    } catch (error) {
      // An empty-or-unknown board is legitimate for a tracked company
      // (all roles filled) — only slug *probing* treats it as a miss.
      if (error instanceof AmtError && error.code === 'SOURCE_EMPTY') continue
      errors.push({
        source: job.source,
        message: String(error instanceof Error ? error.message : error),
      })
    }
  }
  return batches
}

interface IngestContext {
  client: HttpClient
  profile: Profile
  ledger: SeenLedger
  /** dedupe key → note slug, for postings that already have a note. */
  noted: Map<string, string>
  today: string
  summary: CrawlSummary
}

function noteBody(posting: JobPosting): string {
  return posting.descriptionHtml ? htmlToMarkdown(posting.descriptionHtml) : ''
}

/** True when an existing note has no real (non-migration) description region. */
function descriptionMissing(ctx: IngestContext, slug: string): boolean {
  try {
    const text = descriptionText(readNote(ctx.profile.paths.notesDir, slug).body)
    return !text || text.startsWith('Migriert aus')
  } catch {
    return false
  }
}

/** Slug collisions (same company+title twice) get a nativeId suffix. */
async function upsertWithDecollide(ctx: IngestContext, posting: JobPosting): Promise<{ slug: string; created: boolean }> {
  const input = postingToNoteInput(posting, ctx.today)
  input.logo = await resolveCompanyLogo(ctx.client, posting.company)
  try {
    return upsertNote(ctx.profile.paths.notesDir, input, noteBody(posting))
  } catch (error) {
    if (!(error instanceof AmtError) || error.code !== 'NOTE_SLUG_TAKEN') throw error
    // The END of the nativeId discriminates — arbeitnow ids share their
    // title-derived prefix ("…-mainz-375160" vs "…-koln-454616").
    input.slug = `${input.slug}-${slugify(posting.nativeId).slice(-8).replace(/^-+/, '')}`
    return upsertNote(ctx.profile.paths.notesDir, input, noteBody(posting))
  }
}

/**
 * Notes are created only for postings that are stack-relevant AND pass the
 * hard filters. Everything else goes into the seen ledger so it never
 * surfaces again — without leaving a file behind.
 */
async function ingest(posting: JobPosting, batch: FetchedBatch, ctx: IngestContext): Promise<void> {
  // NOTES collapse across sources by identity (company+title) — the same job
  // via a channel, an ATS, or a manual import is one note.
  const identityKey = dedupeKey(posting)
  // The LEDGER is per-posting (source:nativeId). Keying it by identity would
  // let a genuinely different role that shares a title at the same company be
  // silently suppressed, and would orphan every pre-identity ledger entry.
  const ledgerKey = `${posting.source}:${posting.nativeId}`

  // An existing note always wins over the ledger — the user may have
  // imported something the crawler once dismissed.
  if (ctx.noted.has(identityKey)) {
    const slug = ctx.noted.get(identityKey)!
    // Self-heal a description-less note (e.g. a LinkedIn detail that 429'd on
    // creation) — but only when it's actually missing, never re-fetching every
    // crawl for every note.
    if (posting.descriptionHtml === null && batch.adapter.fetchDetail && descriptionMissing(ctx, slug)) {
      posting = { ...posting, descriptionHtml: await batch.adapter.fetchDetail(ctx.client, batch.companySlug ?? posting.company, posting.nativeId) }
    }
    const input = postingToNoteInput(posting, ctx.today)
    // Backfill for notes created before logos existed — cached per company.
    input.logo = await resolveCompanyLogo(ctx.client, posting.company)
    upsertNote(ctx.profile.paths.notesDir, input, noteBody(posting))
    ctx.summary.refreshed++
    return
  }
  if (ctx.ledger[ledgerKey]) {
    ctx.summary.known++
    return
  }

  // Some ATS (SmartRecruiters) need a second request per posting for the
  // description — fetch it once per new posting so relevance and the note
  // body work with the full text.
  if (posting.descriptionHtml === null && batch.adapter.fetchDetail) {
    posting = {
      ...posting,
      descriptionHtml: await batch.adapter.fetchDetail(
        ctx.client,
        batch.companySlug ?? posting.company,
        posting.nativeId,
      ),
    }
  }

  if (!isRelevant(posting, ctx.profile.search)) {
    markSeen(ctx.ledger, ledgerKey, 'off-stack', null, ctx.today)
    ctx.summary.offStack++
    return
  }
  const verdict = applyHardFilters(posting, ctx.profile)
  if (!verdict.passed) {
    markSeen(ctx.ledger, ledgerKey, 'filtered', verdict.cutReason, ctx.today)
    ctx.summary.filtered++
    return
  }

  const result = await upsertWithDecollide(ctx, posting)
  ctx.noted.set(identityKey, result.slug)
  ctx.summary.created++
  ctx.summary.createdSlugs.push(result.slug)
  for (const dupe of findProbableDuplicates(
    ctx.profile.paths.notesDir,
    posting.company,
    posting.title,
    result.slug,
  )) {
    ctx.summary.probableDuplicates.push({ slug: result.slug, of: dupe.slug })
  }
}

function assertCrawlableSources(sources: Sources): void {
  const crawlableChannels = sources.channels.filter(isCrawlableChannel).length
  if (sources.boards.length > 0 || sources.companies.length > 0 || crawlableChannels > 0) return
  throw new AmtError(
    'NO_SOURCES',
    sources.channels.length > 0
      ? 'Only agent-only channels are configured (no machine-crawl spec) — run those via your agent and feed findings through import. For tool crawling, add boards, companies, or channels with a `crawl` spec.'
      : 'No sources configured. Run `amt init` or add some with `amt sources add <company>`.',
  )
}

function nextHint(summary: CrawlSummary): string {
  return summary.created > 0
    ? `Review the new candidates: \`amt list --status new\` / call list_jobs with status ["new"] (new slugs: ${summary.createdSlugs.join(', ')})`
    : 'Nothing new — all fetched postings were already judged or off-stack.'
}

export async function crawl(
  client: HttpClient,
  home: string,
  profile: Profile,
  sources: Sources,
  options: { today?: string } = {},
): Promise<CrawlSummary> {
  assertCrawlableSources(sources)

  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const summary: CrawlSummary = {
    fetched: 0,
    created: 0,
    createdSlugs: [],
    refreshed: 0,
    filtered: 0,
    offStack: 0,
    known: 0,
    stale: 0,
    probableDuplicates: [],
    errors: [],
    next: '',
  }

  const ctx: IngestContext = {
    client,
    profile,
    ledger: loadSeen(home),
    noted: new Map(
      listNotes(profile.paths.notesDir).map(s => [dedupeKey(s.note), s.note.slug]),
    ),
    today,
    summary,
  }

  const batches = await fetchAll(client, sources, profile.search, summary.errors)
  for (const batch of batches) {
    for (const posting of batch.postings) {
      summary.fetched++
      if (batch.applyFreshness && !isFresh(posting, profile.search.maxAgeDays, today)) {
        summary.stale++
        continue
      }
      try {
        await ingest(posting, batch, ctx)
      } catch (error) {
        // One broken posting must never abort the run or lose the ledger.
        summary.errors.push({
          source: `${posting.source}:${posting.nativeId}`,
          message: String(error instanceof Error ? error.message : error),
        })
      }
    }
  }

  saveSeen(home, ctx.ledger)
  renderIndex(profile.paths.notesDir, profile.search.locations.cities.map(c => c.name))
  summary.next = nextHint(summary)
  return summary
}