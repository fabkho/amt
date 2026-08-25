import {
  assessmentText,
  CUT_REASONS,
  descriptionText,
  JOB_STATUSES,
  readNote,
  setStatus,
  staleApplications,
  updateNote,
  type CutReason,
  type JobStatus,
} from '../core/notes.js'
import { trackAndReindex } from '../core/tracking.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { htmlToMarkdown } from '../core/sources/normalize.js'
import { jobRows, safeUrl, stats, type Filters } from './data.js'
import { render } from './render.js'
import type { Profile } from '../core/profile.js'

export interface Reply {
  status: number
  body: string
  contentType?: string
}

const html = (body: string): Reply => ({ status: 200, body, contentType: 'text/html; charset=utf-8' })

function parseFilters(query: URLSearchParams): Filters {
  const num = Number(query.get('minScore'))
  return {
    status: query.get('status') || undefined,
    workMode: query.get('workMode') || undefined,
    bucket: query.get('bucket') || undefined,
    q: query.get('q') || undefined,
    favorite: query.get('favorite') === '1',
    minScore: Number.isFinite(num) && num > 0 ? num : undefined,
  }
}

export function dashboard(profile: Profile): Reply {
  const today = new Date().toISOString().slice(0, 10)
  return html(render('dashboard', {
    page: 'dashboard',
    stats: stats(profile),
    followups: staleApplications(profile.paths.notesDir, today),
    inbox: jobRows(profile, { status: 'new' }),
    shortlist: jobRows(profile, { status: 'shortlist' }),
  }))
}

export function jobs(profile: Profile, query: URLSearchParams): Reply {
  const cities = profile.search.locations.cities.map(c => c.name)
  return html(render('jobs', {
    page: 'jobs',
    rows: jobRows(profile, parseFilters(query)),
    filters: parseFilters(query),
    buckets: ['Remote', ...cities, 'Other'],
  }))
}

export function rejectDialog(profile: Profile, slug: string, fromDetail = false): Reply {
  const { note } = readNote(profile.paths.notesDir, slug)
  return html(render('_reject_dialog', { note, cutReasons: CUT_REASONS, fromDetail }))
}

export function detail(profile: Profile, slug: string): Reply {
  const { note, body } = readNote(profile.paths.notesDir, slug)
  const region = descriptionText(body)
  return html(render('detail', {
    page: 'jobs',
    note,
    url: safeUrl(note.url),
    logo: safeUrl(note.logo),
    description: region ? htmlToMarkdown(region) : '',
    assessment: assessmentText(body) ?? '',
  }))
}

const statsOob = (profile: Profile): string => render('_stats_oob', { stats: stats(profile) })

/** The updated row (+ live stats). Used when the row stays in its list. */
function rowReply(profile: Profile, slug: string): Reply {
  const row = jobRows(profile).find(r => r.slug === slug)
  if (!row) return { status: 404, body: statsOob(profile) }
  return html(render('_row', { row }) + statsOob(profile))
}

/** Empty body removes the row from its list; OOB stats keep the header live. */
function removeRowReply(profile: Profile): Reply {
  return html(statsOob(profile))
}

export async function changeStatus(
  profile: Profile,
  home: string,
  slug: string,
  status: string,
  reason?: string,
  fromUrl = '',
): Promise<Reply> {
  if (!JOB_STATUSES.includes(status as JobStatus)) {
    return { status: 400, body: `invalid status: ${status}` }
  }
  const opts = status === 'cut'
    ? { cutReason: (CUT_REASONS.includes(reason as CutReason) ? reason : 'personal_fit') as CutReason }
    : {}
  const note = setStatus(profile.paths.notesDir, slug, status as JobStatus, opts)
  await trackAndReindex(defaultHttpClient, home, profile, note)
  // The dashboard's inbox/shortlist are status-scoped, so a changed row leaves
  // them — remove it. The /jobs board shows a mixed list, so keep the row and
  // just refresh its badge.
  // HX-Current-URL is absolute in practice; parse with a base so a relative
  // value (or empty) never throws.
  const onBoard = new URL(fromUrl || '/', 'http://x').pathname.startsWith('/jobs')
  return onBoard ? rowReply(profile, slug) : removeRowReply(profile)
}

export function toggleFavorite(profile: Profile, slug: string): Reply {
  const { note } = readNote(profile.paths.notesDir, slug)
  updateNote(profile.paths.notesDir, slug, { favorite: !note.favorite })
  return rowReply(profile, slug)
}

