import { createCommand } from './_shared.js'
import { crawl } from '../core/crawl.js'
import { unrankedNotes } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { loadSources } from '../core/sources-store.js'

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
    const unranked = unrankedNotes(profile.paths.notesDir)
    // Exit 2 = crawled but the round is not finished (ranking still owed) — the
    // signal an unattended runner (cron) needs to know an agent pass is due.
    if (unranked.length > 0) process.exitCode = 2
    return {
      result: {
        ...summary,
        ...(pending.length ? { pendingChannels: pending } : {}),
        ...(unranked.length ? { unranked: { count: unranked.length, slugs: unranked } } : {}),
      },
      human: [
        `Fetched ${summary.fetched} postings — ${summary.created} new notes, ${summary.refreshed} refreshed; `
        + `ledger-only: ${summary.filtered} filtered, ${summary.offStack} off-stack, ${summary.known} known, ${summary.stale} stale.`,
        ...(summary.probableDuplicates.length
          ? summary.probableDuplicates.map(d => `⚠ probable duplicate: ${d.slug} ≈ ${d.of}`)
          : []),
        ...(summary.errors.length
          ? summary.errors.map(e => `⚠ ${e.source}: ${e.message}`)
          : []),
        ...(pending.length
          ? [
              `⚠ ${pending.length} agent-only channel(s) not crawled (${pending.join(', ')}) `
              + '— these have no machine-crawl spec; run them via your agent.',
            ]
          : []),
        ...(unranked.length
          ? [`📥 ${unranked.length} note(s) unranked — have your agent rank them (exit code 2).`]
          : []),
        `→ ${summary.next}`,
      ],
    }
  },
})
