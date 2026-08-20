import { createCommand } from './_shared.js'
import { importPostingFromUrl } from '../core/import-url.js'
import { upsertNote } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { postingToNoteInput } from '../core/sources/normalize.js'
import { tryAutoTrack } from '../core/sources-store.js'

export default createCommand({
  name: 'import',
  description: 'Import a posting from an ATS URL into the job notes',
  args: {
    url: { type: 'positional', description: 'Posting URL', required: true },
  },
  async run(args) {
    const home = resolveHome()
    const profile = await loadProfile(home)
    const { parsed, posting } = await importPostingFromUrl(
      defaultHttpClient,
      args.url as string,
    )
    const today = new Date().toISOString().slice(0, 10)
    const result = upsertNote(
      profile.paths.notesDir,
      postingToNoteInput(posting, today),
      posting.descriptionHtml ?? '',
    )

    // Interest shown → keep watching this company (organic source growth).
    const tracked = await tryAutoTrack(
      defaultHttpClient,
      home,
      profile.search.autoTrackCompanies,
      posting.company,
    )

    return {
      result: { slug: result.slug, created: result.created, source: parsed.ats, tracked },
      human: [
        `${result.created ? 'Imported' : 'Refreshed'} ${posting.company} — ${posting.title} → ${result.slug}`,
        ...(tracked ? [`Now tracking ${posting.company} (${tracked}).`] : []),
      ],
    }
  },
})
