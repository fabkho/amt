import { createCommand } from './_shared.js'
import { importPostingFromUrl } from '../core/import-url.js'
import { upsertNote } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { htmlToMarkdown, postingToNoteInput } from '../core/sources/normalize.js'
import { tryAutoTrack } from '../core/sources-store.js'

export default createCommand({
  name: 'import',
  description: 'Import a posting from an ATS URL into the job notes',
  args: {
    url: { type: 'positional', description: 'Posting URL', required: true },
    company: { type: 'string', description: 'Manual import (non-ATS URLs): company name' },
    title: { type: 'string', description: 'Manual import: posting title' },
    location: { type: 'string', description: 'Manual import: location' },
    'work-mode': { type: 'string', description: 'Manual import: remote|hybrid|onsite' },
    description: { type: 'string', description: 'Manual import: description text/HTML' },
  },
  async run(args) {
    const home = resolveHome()
    const profile = await loadProfile(home)
    const today = new Date().toISOString().slice(0, 10)
    const url = args.url as string

    let posting
    let source: string
    if (args.company && args.title) {
      // Manual path for non-ATS sources (LinkedIn, StepStone, agent channels).
      source = 'manual'
      posting = {
        source,
        nativeId: url,
        company: args.company as string,
        title: args.title as string,
        url,
        descriptionHtml: (args.description as string | undefined) ?? null,
        location: (args.location as string | undefined) ?? null,
        workMode: (args['work-mode'] as 'remote' | 'hybrid' | 'onsite' | undefined) ?? null,
        salaryMin: null,
        salaryMax: null,
        publishedAt: null,
        tags: [],
      }
    } else {
      const imported = await importPostingFromUrl(defaultHttpClient, url)
      posting = imported.posting
      source = imported.parsed.ats
    }
    const result = upsertNote(
      profile.paths.notesDir,
      postingToNoteInput(posting, today),
      posting.descriptionHtml ? htmlToMarkdown(posting.descriptionHtml) : '',
    )

    // Interest shown → keep watching this company (organic source growth).
    const tracked = await tryAutoTrack(
      defaultHttpClient,
      home,
      profile.search.autoTrackCompanies,
      posting.company,
    )

    return {
      result: { slug: result.slug, created: result.created, source, tracked },
      human: [
        `${result.created ? 'Imported' : 'Refreshed'} ${posting.company} — ${posting.title} → ${result.slug}`,
        ...(tracked
          ? [`Now tracking ${posting.company} (${tracked}) — future crawls include this company; \`amt sources remove\` to undo.`]
          : []),
      ],
    }
  },
})
