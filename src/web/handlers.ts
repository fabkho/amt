import { CUT_REASONS, readNote, setStatus, updateNote, type CutReason } from '../core/notes.js'
import { trackAndReindex } from '../core/tracking.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { prepareApplication } from '../core/prepare.js'
import { htmlToMarkdown } from '../core/sources/normalize.js'
import { jobRows, stats, type Filters } from './data.js'
import { render } from './render.js'
import type { Profile } from '../core/profile.js'

export interface Reply {
  status: number
  body: string
  contentType?: string
}

const html = (body: string): Reply => ({ status: 200, body, contentType: 'text/html; charset=utf-8' })

function parseFilters(query: URLSearchParams): Filters {
  const num = query.get('minScore')
  return {
    status: query.get('status') || undefined,
    workMode: query.get('workMode') || undefined,
    bucket: query.get('bucket') || undefined,
    q: query.get('q') || undefined,
    favorite: query.get('favorite') === '1',
    minScore: num ? Number(num) : undefined,
  }
}

export function dashboard(profile: Profile): Reply {
  const cities = profile.search.locations.cities.map(c => c.name)
  const inbox = jobRows(profile, { status: 'new' })
  return html(render('dashboard', {
    page: 'dashboard',
    stats: stats(profile),
    inbox,
    shortlist: jobRows(profile, { status: 'shortlist' }),
    buckets: ['Remote', ...cities, 'Other'],
    cutReasons: CUT_REASONS,
  }))
}

export function jobs(profile: Profile, query: URLSearchParams): Reply {
  const filters = parseFilters(query)
  const cities = profile.search.locations.cities.map(c => c.name)
  const rows = jobRows(profile, filters)
  return html(render('jobs', {
    page: 'jobs',
    rows,
    filters,
    buckets: ['Remote', ...cities, 'Other'],
    cutReasons: CUT_REASONS,
  }))
}

export function detail(profile: Profile, slug: string): Reply {
  const { note, body } = readNote(profile.paths.notesDir, slug)
  const description = extractDescription(body)
  const assessment = extractAssessment(body)
  return html(render('detail', {
    page: 'jobs',
    note,
    description,
    assessment,
    cutReasons: CUT_REASONS,
  }))
}

// Body regions are HTML-comment-delimited; show them as readable text/markdown.
function extractDescription(body: string): string {
  const m = /<!-- job-kit:description -->([\s\S]*?)<!-- \/job-kit:description -->/.exec(body)
  return m ? htmlToMarkdown(m[1]!.trim()) : ''
}
function extractAssessment(body: string): string {
  const m = /<!-- job-kit:assessment -->([\s\S]*?)<!-- \/job-kit:assessment -->/.exec(body)
  return m ? m[1]!.replace(/^##.*$/m, '').trim() : ''
}

/** After any mutation: the updated row (for the hx-target) plus an
 *  out-of-band refresh of the header stat counts, so the strip stays live. */
function mutationReply(profile: Profile, slug: string): Reply {
  const row = jobRows(profile).find(r => r.slug === slug)
  if (!row) return { status: 404, body: '' }
  const rowHtml = render('_row', { row, cutReasons: CUT_REASONS, oob: false })
  const statsHtml = render('_stats_oob', { stats: stats(profile) })
  return html(rowHtml + statsHtml)
}

export async function changeStatus(
  profile: Profile,
  home: string,
  slug: string,
  status: string,
  reason?: string,
): Promise<Reply> {
  const opts = status === 'cut'
    ? { cutReason: (CUT_REASONS.includes(reason as CutReason) ? reason : 'personal_fit') as CutReason }
    : {}
  const note = setStatus(profile.paths.notesDir, slug, status as never, opts)
  await trackAndReindex(defaultHttpClient, home, profile, note)
  return mutationReply(profile, slug)
}

export function toggleFavorite(profile: Profile, slug: string): Reply {
  const { note } = readNote(profile.paths.notesDir, slug)
  updateNote(profile.paths.notesDir, slug, { favorite: !note.favorite })
  return mutationReply(profile, slug)
}

export async function buildApplication(profile: Profile, slug: string): Promise<Reply> {
  const result = await prepareApplication(profile, slug, { pdf: false })
  return html(render('_prepared', { result, slug }))
}
