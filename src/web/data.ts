import { listNotes, placement, type JobNote, type JobStatus } from '../core/notes.js'
import type { Profile } from '../core/profile.js'

// Read-only view models assembled from core note helpers — the web layer is a
// surface over the same markdown, never a second source of truth.

export interface RowView {
  slug: string
  company: string
  title: string
  url: string
  status: JobStatus
  score: number | null
  workMode: string
  location: string
  logo: string | null
  bucket: string
  platform: { label: string; icon: string }
}

// Where a posting came from → a human label + a platform favicon, so the
// "open" link shows where it goes. Favicons come from the same DuckDuckGo
// service already used for company logos (no bundled brand assets).
const PLATFORMS: Record<string, { label: string; domain: string }> = {
  'linkedin-guest': { label: 'LinkedIn', domain: 'linkedin.com' },
  stepstone: { label: 'StepStone', domain: 'stepstone.de' },
  vuejobs: { label: 'VueJobs', domain: 'vuejobs.com' },
  arbeitnow: { label: 'Arbeitnow', domain: 'arbeitnow.com' },
  arbeitsagentur: { label: 'Bundesagentur für Arbeit', domain: 'arbeitsagentur.de' },
  recruitee: { label: 'Recruitee', domain: 'recruitee.com' },
  greenhouse: { label: 'Greenhouse', domain: 'greenhouse.io' },
  lever: { label: 'Lever', domain: 'lever.co' },
  ashby: { label: 'Ashby', domain: 'ashbyhq.com' },
  personio: { label: 'Personio', domain: 'personio.com' },
  smartrecruiters: { label: 'SmartRecruiters', domain: 'smartrecruiters.com' },
}

export function platformOf(source: string): { label: string; icon: string } {
  const p = PLATFORMS[source]
  if (!p) return { label: source || 'source', icon: '' }
  return { label: p.label, icon: `https://icons.duckduckgo.com/ip3/${p.domain}.ico` }
}

export interface Filters {
  status?: string
  workMode?: string
  bucket?: string
  minScore?: number
  q?: string
}

/** Only http(s) survives into href/src — external postings could carry a
 *  javascript: URL that autoescaping wouldn't stop. */
export function safeUrl(url: string | null): string {
  if (!url) return ''
  return /^https?:\/\//i.test(url.trim()) ? url : ''
}

function toRow(note: JobNote, cities: string[]): RowView {
  return {
    slug: note.slug,
    company: note.company,
    title: note.title,
    url: safeUrl(note.url),
    status: note.status,
    score: note.score,
    workMode: note.workMode ?? '',
    location: note.location ?? '',
    logo: safeUrl(note.logo),
    bucket: placement(note, cities),
    platform: platformOf(note.source),
  }
}

/** Best-first by score. */
function byRank(a: RowView, b: RowView): number {
  return (b.score ?? -1) - (a.score ?? -1)
}

function matches(row: RowView, f: Filters): boolean {
  if (f.status && row.status !== f.status) return false
  if (f.workMode && row.workMode !== f.workMode) return false
  if (f.bucket && row.bucket !== f.bucket) return false
  if (f.minScore !== undefined && (row.score ?? -1) < f.minScore) return false
  if (f.q) {
    const hay = `${row.company} ${row.title}`.toLowerCase()
    if (!hay.includes(f.q.toLowerCase())) return false
  }
  return true
}

export function jobRows(profile: Profile, filters: Filters = {}): RowView[] {
  const cities = profile.search.locations.cities.map(c => c.name)
  return listNotes(profile.paths.notesDir)
    .map(s => toRow(s.note, cities))
    .filter(row => matches(row, filters))
    .sort(byRank)
}

export interface Stats {
  counts: Record<string, number>
  unranked: number
}

export function stats(profile: Profile): Stats {
  const notes = listNotes(profile.paths.notesDir)
  const counts: Record<string, number> = {}
  let unranked = 0
  for (const { note } of notes) {
    counts[note.status] = (counts[note.status] ?? 0) + 1
    if (note.status === 'new' && note.score === null) unranked++
  }
  return { counts, unranked }
}
