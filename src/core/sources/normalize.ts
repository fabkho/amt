import type { JobPosting } from './types.js'
import { slugify, type JobNoteInput } from '../notes.js'

export function workModeFromFlags(
  remote: boolean | null | undefined,
  hybrid: boolean | null | undefined,
  onsite?: boolean | null,
): JobPosting['workMode'] {
  if (remote) return 'remote'
  if (hybrid) return 'hybrid'
  if (onsite) return 'onsite'
  return null
}

/** Accepts ISO strings, "YYYY-MM-DD hh:mm:ss UTC", and epoch seconds/millis. */
export function toIsoDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  let date: Date
  if (typeof value === 'number') {
    // Epoch seconds vs milliseconds: anything below 10^12 is seconds.
    date = new Date(value < 1e12 ? value * 1000 : value)
  } else {
    date = new Date(value.replace(' UTC', 'Z').replace(' ', 'T'))
  }
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&amp;': '&',
}

/** Greenhouse ships descriptions HTML-escaped; undo exactly that layer. */
export function unescapeHtml(text: string): string {
  return text.replace(/&(?:lt|gt|quot|#39|amp);/g, match => ENTITIES[match] ?? match)
}

/** Converts a normalized posting into a note input for upsertNote. */
export function postingToNoteInput(
  posting: JobPosting,
  discoveredAt: string,
): JobNoteInput {
  return {
    company: posting.company,
    slug: slugify(`${posting.company} ${posting.title}`),
    title: posting.title,
    url: posting.url,
    source: posting.source,
    nativeId: posting.nativeId,
    stack: posting.tags,
    location: posting.location,
    workMode: posting.workMode,
    salaryMin: posting.salaryMin,
    salaryMax: posting.salaryMax,
    publishedAt: posting.publishedAt,
    discoveredAt,
  }
}
