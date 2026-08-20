import { createCommand } from './_shared.js'
import { importPostingFromUrl, manualPosting } from '../core/import-url.js'
import { notesForCompany, renderIndex, upsertNote } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { htmlToMarkdown, postingToNoteInput } from '../core/sources/normalize.js'
import { tryAutoTrack } from '../core/sources-store.js'
import type { JobPosting } from '../core/sources/types.js'

interface ImportArgs {
  url: string
  company?: string
  title?: string
  location?: string
  'work-mode'?: string
  description?: string
}

async function resolvePosting(args: ImportArgs): Promise<{ posting: JobPosting; source: string }> {
  if (args.company && args.title) {
    // Manual path for non-ATS sources (LinkedIn, StepStone, agent channels).
    return {
      source: 'manual',
      posting: manualPosting(args.url, {
        company: args.company,
        title: args.title,
        descriptionHtml: args.description,
        location: args.location,
        workMode: args['work-mode'] as 'remote' | 'hybrid' | 'onsite' | undefined,
      }),
    }
  }
  const imported = await importPostingFromUrl(defaultHttpClient, args.url)
  return { posting: imported.posting, source: imported.parsed.ats }
}

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
    const { posting, source } = await resolvePosting(args as unknown as ImportArgs)
    const result = upsertNote(
      profile.paths.notesDir,
      postingToNoteInput(posting, new Date().toISOString().slice(0, 10)),
      posting.descriptionHtml ? htmlToMarkdown(posting.descriptionHtml) : '',
    )

    // Same company elsewhere? Warn, never block — a different role or a
    // changed offer is a legitimate second application.
    const companyHistory = notesForCompany(profile.paths.notesDir, posting.company, result.slug)
    // Interest shown → keep watching this company (organic source growth).
    const tracked = await tryAutoTrack(
      defaultHttpClient,
      home,
      profile.search.autoTrackCompanies,
      posting.company,
    )
    renderIndex(profile.paths.notesDir)

    return {
      result: { slug: result.slug, created: result.created, source, tracked, companyHistory },
      human: [
        `${result.created ? 'Imported' : 'Refreshed'} ${posting.company} — ${posting.title} → ${result.slug}`,
        ...(companyHistory.length > 0
          ? [`⚠ ${companyHistory.length} other note(s) at ${posting.company}: ${companyHistory.map(h => `${h.slug} (${h.status})`).join(', ')} — a different role is fine, just make sure this isn't the same one.`]
          : []),
        ...(tracked
          ? [`Now tracking ${posting.company} (${tracked}) — future crawls include this company; \`amt sources remove\` to undo.`]
          : []),
      ],
    }
  },
})
