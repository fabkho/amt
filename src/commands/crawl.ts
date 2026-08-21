import { createCommand } from './_shared.js'
import { crawl } from '../core/crawl.js'
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
    return {
      result: summary,
      human: [
        `Fetched ${summary.fetched} postings — ${summary.created} new notes, ${summary.refreshed} refreshed; `
        + `ledger-only: ${summary.filtered} filtered, ${summary.offStack} off-stack, ${summary.known} known, ${summary.stale} stale.`,
        ...(summary.probableDuplicates.length
          ? summary.probableDuplicates.map(d => `⚠ probable duplicate: ${d.slug} ≈ ${d.of}`)
          : []),
        ...(summary.errors.length
          ? summary.errors.map(e => `⚠ ${e.source}: ${e.message}`)
          : []),
        ...(sources.channels.length
          ? [`${sources.channels.length} agent channel(s) configured — run them via your agent.`]
          : []),
        `→ ${summary.next}`,
      ],
    }
  },
})
