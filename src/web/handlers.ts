import {
  assessmentText,
  CUT_REASONS,
  descriptionText,
  JOB_STATUSES,
  readNote,
  setStatus,
  staleApplications,
  type CutReason,
  type JobStatus,
} from '../core/notes.js'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { trackAndReindex } from '../core/tracking.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { htmlToMarkdown } from '../core/sources/normalize.js'
import { jobRows, platformOf, safeUrl, stats, type Filters } from './data.js'
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
  const statuses = query.getAll('status').filter(Boolean)
  return {
    statuses: statuses.length > 0 ? statuses : undefined,
    workMode: query.get('workMode') || undefined,
    bucket: query.get('bucket') || undefined,
    q: query.get('q') || undefined,
    minScore: Number.isFinite(num) && num > 0 ? num : undefined,
  }
}

export function dashboard(profile: Profile): Reply {
  const today = new Date().toISOString().slice(0, 10)
  const threshold = profile.search.scoreThreshold
  // Unranked (score null) always show — they still need judging. Below-threshold
  // scored ones are tucked behind "show more".
  const inboxAll = jobRows(profile, { statuses: ['new'] })
  return html(render('dashboard', {
    page: 'dashboard',
    stats: stats(profile),
    threshold,
    followups: staleApplications(profile.paths.notesDir, today),
    inbox: inboxAll.filter(r => r.score === null || r.score >= threshold),
    inboxBelow: inboxAll.filter(r => r.score !== null && r.score < threshold),
    shortlist: jobRows(profile, { statuses: ['shortlist'] }),
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
    platform: platformOf(note.source),
    appliedDaysAgo: note.application?.appliedAt
      ? Math.floor((Date.now() - Date.parse(note.application.appliedAt)) / 86_400_000)
      : null,
    description: region ? htmlToMarkdown(region) : '',
    assessment: assessmentText(body) ?? '',
  }))
}

const statsOob = (profile: Profile): string => render('_stats_oob', { stats: stats(profile) })

/** The updated row (+ live stats), scoped to the board's current filters —
 *  if the changed note no longer matches the view, it's removed instead. */
function boardReply(profile: Profile, slug: string, filters: Filters): Reply {
  const row = jobRows(profile, filters).find(r => r.slug === slug)
  return row
    ? html(render('_row', { row }) + statsOob(profile))
    : removeRowReply(profile, slug)
}

/** Removes the row from its list via an explicit OOB delete (an OOB-only body
 *  has no main content for htmx to swap into the target, so the row would
 *  otherwise linger); OOB stats keep the header live. */
function removeRowReply(profile: Profile, slug: string): Reply {
  return html(`<div id="row-${slug}" hx-swap-oob="delete"></div>${statsOob(profile)}`)
}

export async function changeStatus(
  profile: Profile,
  home: string,
  slug: string,
  status: string,
  reason?: string,
  fromUrl = '',
  cutNote?: string,
): Promise<Reply> {
  if (!JOB_STATUSES.includes(status as JobStatus)) {
    return { status: 400, body: `invalid status: ${status}` }
  }
  const note0 = cutNote?.trim()
  const opts = status === 'cut'
    ? {
        cutReason: (CUT_REASONS.includes(reason as CutReason) ? reason : 'personal_fit') as CutReason,
        ...(note0 ? { cutNote: note0 } : {}),
      }
    : {}
  const note = setStatus(profile.paths.notesDir, slug, status as JobStatus, opts)
  // ATS auto-track + reindex is network-heavy (seconds); don't make the click
  // wait on it — fire and forget so the row updates instantly.
  void trackAndReindex(defaultHttpClient, home, profile, note).catch(() => undefined)
  // The dashboard's inbox/shortlist are status-scoped, so a changed row always
  // leaves them — remove it. On the /jobs board, keep the row only if the
  // updated note still matches the board's current filters (e.g. a reject/cut
  // drops out of the default "active" view); otherwise remove it.
  // HX-Current-URL is absolute in practice; parse with a base so a relative
  // value (or empty) never throws.
  const url = new URL(fromUrl || '/', 'http://x')
  if (!url.pathname.startsWith('/jobs')) return removeRowReply(profile, slug)
  return boardReply(profile, slug, parseFilters(url.searchParams))
}

/** Reveal the application's documents folder in the OS file manager (the server
 *  runs on the user's machine, so it can `open` locally). */
export function revealDocs(profile: Profile, slug: string): Reply {
  const { note } = readNote(profile.paths.notesDir, slug)
  const folder = note.application?.folder
  if (!folder || !existsSync(folder)) return { status: 404, body: 'no documents folder' }
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  spawn(opener, [folder], { detached: true, stdio: 'ignore' }).unref()
  return { status: 204, body: '' }
}

