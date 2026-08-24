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
  'offer',
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
  salaryCurrency: z.string().nullable().default(null),
  /** Favicon URL, resolved best-effort from the company name. */
  logo: z.string().nullable().default(null),
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

/**
 * Source-independent identity: the same opening seen via any source (a channel
 * crawl, a manual import, an ATS) collapses to one key. Company legal suffixes
 * and title decoration are stripped so "koppla" == "koppla GmbH" and
 * "Frontend Engineer (m/w/d)" == "Frontend Engineer".
 *
 * The trade-off (accepted): two genuinely different openings with the same
 * title at the same company — e.g. the same role in two cities — merge into one
 * note. findProbableDuplicates stays as a secondary net for near-title cases.
 */
export function dedupeKey(note: Pick<JobNote, 'company' | 'title'>): string {
  return `${normalizeCompany(note.company)}::${normalizeTitle(note.title)}`
}

function normalizeCompany(company: string): string {
  return company
    .toLowerCase()
    .replace(/\b(gmbh|ag|se|inc|co|kg|kgaa|ltd|llc|e\.?\s?v)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
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
    .replace(/-+$/, '')
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

/** "Senior Frontend Engineer (m/w/d)" ≈ "Senior Frontend Engineer" */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Same company + fuzzy-equal title across sources (manual import vs ATS
 * crawl of the same role). Surfaced as a warning — never auto-merged: a
 * reposted or changed offer is a legitimate second note.
 */
export function findProbableDuplicates(
  notesDir: string,
  company: string,
  title: string,
  excludeSlug?: string,
): { slug: string; title: string; status: JobStatus }[] {
  const wanted = normalizeTitle(title)
  return notesForCompany(notesDir, company, excludeSlug).filter(
    h => normalizeTitle(h.title) === wanted,
  )
}

export function listNotes(
  notesDir: string,
  filter: { status?: JobStatus[] } = {},
): StoredNote[] {
  if (!existsSync(notesDir)) return []
  const notes: StoredNote[] = []
  for (const file of readdirSync(notesDir)) {
    if (!file.endsWith('.md') || file.startsWith('_')) continue
    let stored: StoredNote
    try {
      stored = readNote(notesDir, file.slice(0, -3))
    } catch (error) {
      // One drifted note (hand-edit, sync conflict) must never take the
      // whole directory — and with it crawl/list/index — down. Direct slug
      // access via readNote stays strict.
      process.stderr.write(
        `[amt] skipping invalid note ${file}: ${error instanceof Error ? error.message : String(error)}\n`,
      )
      continue
    }
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
  // A resolved logo is sticky — refreshes without one must not clear it.
  if (merged.logo === null) merged.logo = existing.note.logo
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
  if (start !== -1 && end > start) {
    return body.slice(0, start) + block + body.slice(end + ASSESS_END.length)
  }
  // Broken region (user deleted a marker while editing): neutralize the
  // dangling markers so a later update can never treat human text between
  // them as replaceable, then append a fresh block.
  const base = body.replaceAll(ASSESS_START, '').replaceAll(ASSESS_END, '')
  return `${base.trimEnd()}\n\n${block}`
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
  options: { cutReason?: CutReason; cutNote?: string; at?: string } = {},
): JobNote {
  const { note, body } = readNote(notesDir, slug)
  if (options.cutReason && !CUT_REASONS.includes(options.cutReason)) {
    throw new AmtError(
      'CUT_REASON_INVALID',
      `Unknown cutReason "${options.cutReason}" — valid: ${CUT_REASONS.join(', ')}.`,
    )
  }
  if (status === 'cut' && !options.cutReason && !note.cutReason) {
    throw new AmtError(
      'CUT_REASON_REQUIRED',
      `Cutting a job requires a cutReason so it can be queried later — valid: ${CUT_REASONS.join(', ')}.`,
    )
  }
  note.status = status
  if (options.cutReason) note.cutReason = options.cutReason
  if (options.cutNote) note.cutNote = options.cutNote
  if (status !== 'cut') {
    // Leaving (or never entering) cut: stale cut metadata would otherwise
    // haunt the index ("shortlisted, ✂️ ethics").
    if (!options.cutReason) note.cutReason = null
    if (!options.cutNote) note.cutNote = null
  }
  // Stamp the application date so "applied 3 weeks ago, no reply" is answerable.
  if (status === 'applied') {
    const at = options.at ?? new Date().toISOString().slice(0, 10)
    note.application = note.application
      ? { ...note.application, appliedAt: note.application.appliedAt ?? at }
      : { folder: '', lang: '', appliedAt: at }
  }
  writeNote(notesDir, note, body)
  return note
}

/** New notes that still lack a score — the ranking debt, one list, one source. */
export function unrankedNotes(notesDir: string): string[] {
  return listNotes(notesDir, { status: ['new'] })
    .filter(s => s.note.score === null)
    .map(s => s.note.slug)
}

/** Regenerates the `_index.md` overview — a view, never a source of truth. */
// German cities appear under their English names in ATS data —
// "Cologne, Germany" must land in the Köln bucket.
const CITY_EXONYMS: Record<string, string[]> = {
  koln: ['cologne'],
  munchen: ['munich', 'muenchen'],
  nurnberg: ['nuremberg'],
  wien: ['vienna'],
  zurich: ['zuerich'],
}

function normalizePlace(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * Does a posting `location` sit in a profile `city`? Diacritic- and
 * exonym-aware, so "Cologne, Germany" matches "Köln". Shared by the index
 * buckets and the location hard-filter so both agree on what a city is.
 */
export function placeMatches(location: string | null, city: string): boolean {
  if (!location) return false
  const haystack = normalizePlace(location)
  const normalized = normalizePlace(city)
  const names = [normalized, ...(CITY_EXONYMS[normalized] ?? [])]
  return names.some(name => haystack.includes(name))
}

/**
 * Deterministic bucket for the index: remote work first, then the profile
 * city the posting sits in, everything else under "Other".
 */
export function placement(
  note: Pick<JobNote, 'workMode' | 'location'>,
  cities: string[],
): string {
  if (note.workMode === 'remote') return 'Remote'
  for (const city of cities) {
    if (placeMatches(note.location, city)) return city
  }
  return 'Other'
}

/** Score-ranked: judged notes first (best on top), unjudged after, then newest. */
function byRank(a: { note: JobNote }, b: { note: JobNote }): number {
  const score = (b.note.score ?? -1) - (a.note.score ?? -1)
  if (score !== 0) return score
  return (b.note.discoveredAt ?? '').localeCompare(a.note.discoveredAt ?? '')
}

const TABLE_HEADER = [
  '| ⭐ | Company | Role | Mode | Salary | Note | |',
  '| --- | --- | --- | --- | --- | --- | --- |',
]

function cell(value: string): string {
  return value.replaceAll('|', String.raw`\|`)
}

function tableRow(note: JobNote): string {
  const salary
    = note.salaryMin || note.salaryMax
      ? [note.salaryMin, note.salaryMax].filter(Boolean).join('–')
      : ''
  const score = note.score !== null ? `⭐ ${note.score}` : ''
  const cut = note.cutReason ? `✂️ ${note.cutReason}` : ''
  const logo = note.logo ? `<img src="${note.logo}" width="16"> ` : ''
  return `| ${score} | ${logo}${cell(note.company)} | [[${note.slug}]] ${cell(note.title)} `
    + `| ${note.workMode ?? '?'} | ${salary} | ${cut} | [↗](${note.url}) |`
}

function pushTable(lines: string[], notes: { note: JobNote }[]): void {
  lines.push(...TABLE_HEADER)
  for (const { note } of notes) lines.push(tableRow(note))
  lines.push('')
}

// Statuses where the stack is big enough that placement buckets pay off —
// judged sections (applied, cut, …) stay flat.
const BUCKETED_STATUSES = new Set<JobStatus>(['new', 'shortlist'])

/** Notes that arrived on `date`, ranked — the day's mail, whatever became of it. */
export function inboxNotes(notesDir: string, date: string): StoredNote[] {
  return listNotes(notesDir)
    .filter(s => s.note.discoveredAt === date)
    .sort(byRank)
}

function renderInbox(notesDir: string, notes: StoredNote[]): void {
  const byDate = new Map<string, StoredNote[]>()
  for (const stored of notes) {
    const date = stored.note.discoveredAt
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push(stored)
  }
  if (byDate.size === 0) return
  mkdirSync(join(notesDir, 'inbox'), { recursive: true })
  for (const [date, arrived] of byDate) {
    const unranked = arrived.filter(
      s => s.note.status === 'new' && s.note.score === null,
    ).length
    const lines = [
      `# 📥 Inbox ${date}`,
      '',
      unranked > 0
        ? `${arrived.length} arrived — **${unranked} still unranked** (a scoring round files them).`
        : `${arrived.length} arrived — all judged. Der Stapel ist abgearbeitet.`,
      '',
    ]
    pushTable(lines, [...arrived].sort(byRank))
    writeFileSync(join(notesDir, 'inbox', `${date}.md`), lines.join('\n'))
  }
}

export function renderIndex(notesDir: string, cities: string[] = []): string {
  const notes = listNotes(notesDir)
  renderInbox(notesDir, notes)
  const lines = ['# Job Search Index', '']
  const unranked = notes.filter(s => s.note.status === 'new' && s.note.score === null)
  if (unranked.length > 0) {
    const days = [...new Set(unranked.map(s => s.note.discoveredAt))].sort().reverse()
    lines.push(
      `📥 **${unranked.length} unranked** → ${days.map(d => `[[inbox/${d}]]`).join(' ')}`,
      '',
    )
  }
  for (const status of JOB_STATUSES) {
    const group = notes.filter(s => s.note.status === status).sort(byRank)
    if (group.length === 0) continue
    lines.push(`## ${status} (${group.length})`, '')
    if (BUCKETED_STATUSES.has(status) && cities.length > 0) {
      const buckets = ['Remote', ...cities, 'Other']
      for (const bucket of buckets) {
        const inBucket = group.filter(s => placement(s.note, cities) === bucket)
        if (inBucket.length === 0) continue
        lines.push(`### ${bucket} (${inBucket.length})`, '')
        pushTable(lines, inBucket)
      }
    } else {
      pushTable(lines, group)
    }
  }
  const content = lines.join('\n')
  mkdirSync(notesDir, { recursive: true })
  writeFileSync(join(notesDir, '_index.md'), content)
  return content
}
