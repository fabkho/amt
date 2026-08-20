import { createCommand } from './_shared.js'
import { crawl } from '../core/crawl.js'
import { JobKitError } from '../core/errors.js'
import { loadProfile } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { loadSources } from '../core/sources-store.js'
import { resolveHome } from '../core/profile.js'

export default createCommand({
  name: 'crawl',
  description: 'Fetch all configured sources and update the job notes',
  async run() {
    const home = resolveHome()
    const profile = await loadProfile(home)
    const sources = loadSources(home)

    // Never interactive — agents and scheduled runs call this. Hydration
    // happens in `init` or via `sources add`.
    if (sources.boards.length === 0 && sources.companies.length === 0) {
      throw new JobKitError(
        'NO_SOURCES',
        'No sources configured. Run `job-kit init` or add some with `job-kit sources add <company>`.',
      )
    }

    const summary = await crawl(defaultHttpClient, profile, sources)
    return {
      result: summary,
      human: [
        `Fetched ${summary.fetched} postings — ${summary.created} new, ${summary.cut} auto-cut, ${summary.updated} refreshed, ${summary.stale} stale.`,
        ...(summary.errors.length
          ? summary.errors.map(e => `⚠ ${e.source}: ${e.message}`)
          : []),
        ...(sources.channels.length
          ? [`${sources.channels.length} agent channel(s) configured — run them via your agent.`]
          : []),
      ],
    }
  },
})
