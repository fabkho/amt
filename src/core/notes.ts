import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'
import { AmtError } from './errors.js'

// One markdown note per job posting. The frontmatter is the single source of
// truth for tracking state — "never surface again" is a status query here,
// not a hand-maintained blocklist. Keys are camelCase; Obsidian renders them
// as properties, plain editors as YAML.

export const JOB_STATUSES = [
  'new',
  'shortlist',
  'applied',
  'interview',
  'rejected',
  'cut',
] as const

export const CUT_REASONS = [
  'years_required',
  'salary_below_floor',
  'location',
  'stack',
  'company_type',
  'ethics',
  'buzzword',
  'level',
  'unclear',
  'personal_fit',
] as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'expected an ISO date')

export const jobNoteSchema = z.object({
  company: z.string(),
  slug: z.string(),
  title: z.string(),
  url: z.string(),
  source: z.string(),
  /** Source-native posting id — `${source}:${nativeId}` is the dedupe key. */
  nativeId: z.string(),
  stack: z.array(z.string()).default([]),
  location: z.string().nullable().default(null),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).nullable().default(null),
  hoDays: z.number().int().nullable().default(null),
  salaryMin: z.number().int().nullable().default(null),
  salaryMax: z.number().int().nullable().default(null),
  yearsRequired: z.number().int().nullable().default(null),
  publishedAt: isoDate.nullable().default(null),
  discoveredAt: isoDate,
  status: z.enum(JOB_STATUSES).default('new'),
  score: z.number().int().min(0).max(100).nullable().default(null),
  flags: z.array(z.string()).default([]),
  cutReason: z.enum(CUT_REASONS).nullable().default(null),
  cutNote: z.string().nullable().default(null),
  application: z
    .object({
      folder: z.string(),
      lang: z.string(),
      appliedAt: isoDate.nullable().default(null),
    })
    .nullable()
    .default(null),
})

export type JobNote = z.output<typeof jobNoteSchema>
export type JobNoteInput = z.input<typeof jobNoteSchema>
export type JobStatus = (typeof JOB_STATUSES)[number]
export type CutReason = (typeof CUT_REASONS)[number]

/** Human state survives crawler updates; posting facts get refreshed. */
const HUMAN_FIELDS = [
  'status',
  'score',
  'flags',
  'cutReason',
  'cutNote',
  'application',
  'discoveredAt',
] as const

export function dedupeKey(note: Pick<JobNote, 'source' | 'nativeId'>): string {
  return `${note.source}:${note.nativeId}`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function notePath(notesDir: string, slug: string): string {
  return join(notesDir, `${slug}.md`)
}

export interface StoredNote {
  note: JobNote
  body: string
}

export function readNote(notesDir: string, slug: string): StoredNote {
  const path = notePath(notesDir, slug)
  if (!existsSync(path)) {
    throw new AmtError('NOTE_NOT_FOUND', `No job note at ${path} — run \`amt list\` or call list_jobs to see available slugs.`)
  }
  const parsed = matter(readFileSync(path, 'utf-8'))
  const result = jobNoteSchema.safeParse(parsed.data)
  if (!result.success) {
    throw new AmtError(
      'NOTE_INVALID',
      `${path}:\n${z.prettifyError(result.error)}`,
    )
  }
  return { note: result.data, body: parsed.content.trim() }
}

export function writeNote(notesDir: string, note: JobNote, body: string): string {
  mkdirSync(notesDir, { recursive: true })
  const path = notePath(notesDir, note.slug)
  writeFileSync(path, matter.stringify(`\n${body.trim()}\n`, note))
  return path
}

/**
 * Other notes at the same company — context for imports, never a blocker:
 * applying to a different role (or again, if the offer changed) is fine.
 */
export function notesForCompany(
  notesDir: string,
  company: string,
  excludeSlug?: string,
): { slug: string; title: string; status: JobStatus }[] {
  const needle = company.toLowerCase()
  return listNotes(notesDir)
    .filter(s => s.note.company.toLowerCase() === needle && s.note.slug !== excludeSlug)
    .map(s => ({ slug: s.note.slug, title: s.note.title, status: s.note.status }))
}

export function listNotes(
  notesDir: string,
  filter: { status?: JobStatus[] } = {},
): StoredNote[] {
  if (!existsSync(notesDir)) return []
  const notes: StoredNote[] = []
  for (const file of readdirSync(notesDir)) {
    if (!file.endsWith('.md') || file.startsWith('_')) continue
    const stored = readNote(notesDir, file.slice(0, -3))
    if (filter.status && !filter.status.includes(stored.note.status)) continue
    notes.push(stored)
  }
  return notes.sort((a, b) => a.note.slug.localeCompare(b.note.slug))
}

export interface UpsertResult {
  slug: string
  created: boolean
}

// The description is the machine-owned region of a note body; everything a
// human writes outside these markers survives every crawler refresh.
const DESC_START = '<!-- job-kit:description -->'
const DESC_END = '<!-- /job-kit:description -->'

function wrapDescription(description: string): string {
  return `${DESC_START}\n${description.trim()}\n${DESC_END}`
}

function refreshDescription(existingBody: string, description: string): string {
  const start = existingBody.indexOf(DESC_START)
  const end = existingBody.indexOf(DESC_END)
  if (start === -1 || end === -1 || end < start) {
    // No machine-owned region (legacy or hand-written note) — never clobber.
    return existingBody
  }
  return (
    existingBody.slice(0, start)
    + wrapDescription(description)
    + existingBody.slice(end + DESC_END.length)
  )
}

/**
 * Insert or refresh a crawled posting. Dedupe runs on `source:nativeId`;
 * on refresh, posting facts and the marked description region are updated
 * while human state (status, score, cut info, application) and any body
 * text outside the description markers are preserved.
 */
export function upsertNote(
  notesDir: string,
  incoming: JobNoteInput,
  description: string,
): UpsertResult {
  const note = jobNoteSchema.parse(incoming)
  const key = dedupeKey(note)
  const existing = listNotes(notesDir).find(s => dedupeKey(s.note) === key)

  if (!existing) {
    if (existsSync(notePath(notesDir, note.slug))) {
      throw new AmtError(
        'NOTE_SLUG_TAKEN',
        `Slug "${note.slug}" exists but belongs to a different posting (${key}).`,
      )
    }
    writeNote(notesDir, note, wrapDescription(description))
    return { slug: note.slug, created: true }
  }

  const merged = { ...note, slug: existing.note.slug }
  for (const field of HUMAN_FIELDS) {
    // @ts-expect-error — same schema on both sides, field-wise copy
    merged[field] = existing.note[field]
  }
  const body = description
    ? refreshDescription(existing.body, description)
    : existing.body
  writeNote(notesDir, merged, body)
  return { slug: existing.note.slug, created: false }
}

const ASSESS_START = '<!-- job-kit:assessment -->'
const ASSESS_END = '<!-- /job-kit:assessment -->'

function setAssessment(body: string, assessment: string): string {
  const block = `${ASSESS_START}\n## Assessment\n\n${assessment.trim()}\n${ASSESS_END}`
  const start = body.indexOf(ASSESS_START)
  const end = body.indexOf(ASSESS_END)
  if (start !== -1 && end !== -1 && end > start) {
    return body.slice(0, start) + block + body.slice(end + ASSESS_END.length)
  }
  return `${body.trimEnd()}\n\n${block}`
}

export interface NoteUpdate {
  score?: number | null
  flags?: string[]
  /** Agent reasoning — stored under an "## Assessment" heading in the body. */
  assessment?: string
}

/** Persist the judgment a search round produces: score, flags, reasoning. */
export function updateNote(
  notesDir: string,
  slug: string,
  update: NoteUpdate,
): JobNote {
  const { note, body } = readNote(notesDir, slug)
  if (update.score !== undefined) {
    note.score = update.score === null ? null : jobNoteSchema.shape.score.parse(update.score)
  }
  if (update.flags !== undefined) note.flags = update.flags
  const newBody
    = update.assessment !== undefined ? setAssessment(body, update.assessment) : body
  writeNote(notesDir, note, newBody)
  return note
}

export function setStatus(
  notesDir: string,
  slug: string,
  status: JobStatus,
  options: { cutReason?: CutReason; cutNote?: string } = {},
): JobNote {
  const { note, body } = readNote(notesDir, slug)
  if (status === 'cut' && !options.cutReason && !note.cutReason) {
    throw new AmtError(
      'CUT_REASON_REQUIRED',
      `Cutting a job requires a cutReason so it can be queried later — valid: ${CUT_REASONS.join(', ')}.`,
    )
  }
  note.status = status
  if (options.cutReason) note.cutReason = options.cutReason
  if (options.cutNote) note.cutNote = options.cutNote
  writeNote(notesDir, note, body)
  return note
}

/** Regenerates the `_index.md` overview — a view, never a source of truth. */
export function renderIndex(notesDir: string): string {
  const notes = listNotes(notesDir)
  const lines = ['# Job Search Index', '']
  for (const status of JOB_STATUSES) {
    const group = notes.filter(s => s.note.status === status)
    if (group.length === 0) continue
    lines.push(`## ${status} (${group.length})`, '')
    for (const { note } of group) {
      const salary
        = note.salaryMin || note.salaryMax
          ? ` · ${[note.salaryMin, note.salaryMax].filter(Boolean).join('–')}`
          : ''
      const cut = note.cutReason ? ` · ✂️ ${note.cutReason}` : ''
      lines.push(
        `- [[${note.slug}]] — **${note.company}**, ${note.title}`
        + ` (${note.workMode ?? '?'}${salary}${cut}) [↗](${note.url})`,
      )
    }
    lines.push('')
  }
  const content = lines.join('\n')
  mkdirSync(notesDir, { recursive: true })
  writeFileSync(join(notesDir, '_index.md'), content)
  return content
}
