import { renderIndex } from './notes.js'
import { tryAutoTrack } from './sources-store.js'
import type { JobNote } from './notes.js'
import type { Profile } from './profile.js'
import type { HttpClient } from './sources/types.js'

/**
 * The shared tail of every status change (CLI and MCP): shortlisting a note is
 * interest, so start watching the company's ATS, then regenerate the index.
 * Returns the newly tracked `ats:slug`, or null.
 */
export async function trackAndReindex(
  client: HttpClient,
  home: string,
  profile: Profile,
  note: JobNote,
): Promise<string | null> {
  const tracked = await tryAutoTrack(
    client,
    home,
    note.status === 'shortlist' && profile.search.autoTrackCompanies,
    note.company,
  )
  renderIndex(profile.paths.notesDir, profile.search.locations.cities.map(c => c.name))
  return tracked
}
