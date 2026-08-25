import { createCommand } from './_shared.js'
import { crawl, type CrawlSummary } from '../core/crawl.js'
import { rankingDebt } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { loadSources } from '../core/sources-store.js'

interface Debt { unranked: string[]; undescribed: string[] }

/** True when an agent pass is still owed: notes to rank, guessed descriptions
 *  to backfill, or agent-only channels to fetch — the exit-2 / "not finished"
 *  signal an unattended runner (cron) waits on. One definition. */
function unfinished(debt: Debt, pending: string[]): boolean {
  return debt.unranked.length > 0 || debt.undescribed.length > 0 || pending.length > 0
}

function resultPayload(summary: CrawlSummary, debt: Debt, pending: string[]): Record<string, unknown> {
  const { unranked, undescribed } = debt
  return {
    ...summary,
    ...(pending.length ? { pendingChannels: pending } : {}),
    ...(unranked.length || undescribed.length
      ? { rankingDebt: { unranked: unranked.length, undescribed: undescribed.length, slugs: unranked } }
      : {}),
  }
}

function humanReport(summary: CrawlSummary, debt: Debt, pending: string[]): string[] {
  const { unranked, undescribed } = debt
  const lines = [
    `Fetched ${summary.fetched} postings — ${summary.created} new notes, ${summary.refreshed} refreshed; `
    + `ledger-only: ${summary.filtered} filtered, ${summary.offStack} off-stack, ${summary.known} known, ${summary.stale} stale.`,
    ...summary.probableDuplicates.map(d => `⚠ probable duplicate: ${d.slug} ≈ ${d.of}`),
    ...summary.errors.map(e => `⚠ ${e.source}: ${e.message}`),
  ]
  if (pending.length) {
    lines.push(
      `⚠ ${pending.length} agent-only channel(s) not crawled (${pending.join(', ')}) `
      + '— these have no machine-crawl spec; run them via your agent.',
    )
  }
  if (unranked.length || undescribed.length) {
    lines.push(
      `📥 ${unranked.length} note(s) unranked`
      + (undescribed.length ? `, ${undescribed.length} scored from title only` : '')
      + ' — have your agent finish the round (exit code 2).',
    )
  }
  lines.push(`→ ${summary.next}`)
  return lines
}

export default createCommand({
  name: 'crawl',
  description: 'Fetch all configured sources and update the job notes',
  async run() {
    const home = resolveHome()
    const profile = await loadProfile(home)
    const sources = loadSources(home)
    const summary = await crawl(defaultHttpClient, home, profile, sources)
    // Channels with a crawl spec were fetched above; only agent-only recipes stay pending.
    const pending = sources.channels.filter(c => c.crawl === undefined).map(c => c.name)
    const debt = rankingDebt(profile.paths.notesDir)
    if (unfinished(debt, pending)) process.exitCode = 2
    return {
      result: resultPayload(summary, debt, pending),
      human: humanReport(summary, debt, pending),
    }
  },
})
