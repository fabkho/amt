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
  favorite: boolean
  workMode: string
  location: string
  logo: string | null
  bucket: string
}

export interface Filters {
  status?: string
  workMode?: string
  bucket?: string
  minScore?: number
  q?: string
  favorite?: boolean
}

function toRow(note: JobNote, cities: string[]): RowView {
  return {
    slug: note.slug,
    company: note.company,
    title: note.title,
    url: note.url,
    status: note.status,
    score: note.score,
    favorite: note.favorite,
    workMode: note.workMode ?? '',
    location: note.location ?? '',
    logo: note.logo,
    bucket: placement(note, cities),
  }
}

/** Best-first, favorites floated up within equal scores. */
function byRank(a: RowView, b: RowView): number {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
  return (b.score ?? -1) - (a.score ?? -1)
}

function matches(row: RowView, f: Filters): boolean {
  if (f.status && row.status !== f.status) return false
  if (f.workMode && row.workMode !== f.workMode) return false
  if (f.bucket && row.bucket !== f.bucket) return false
  if (f.favorite && !row.favorite) return false
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
  favorites: number
}

export function stats(profile: Profile): Stats {
  const notes = listNotes(profile.paths.notesDir)
  const counts: Record<string, number> = {}
  let unranked = 0
  let favorites = 0
  for (const { note } of notes) {
    counts[note.status] = (counts[note.status] ?? 0) + 1
    if (note.status === 'new' && note.score === null) unranked++
    if (note.favorite) favorites++
  }
  return { counts, unranked, favorites }
}
