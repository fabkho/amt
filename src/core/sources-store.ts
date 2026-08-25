import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { AmtError } from './errors.js'
import { getAdapter } from './sources/index.js'
import { slugify } from './notes.js'
import type { HttpClient, JobPosting } from './sources/types.js'

// The source list is tool-managed state (hydrated by init, grown organically
// by shortlist/apply/import), so it lives in sources.yaml — never in the
// hand-edited profile.yaml.
//
// ONE list. An entry's shape says how the tool fetches it:
//   - a bare name           → a built-in board adapter (arbeitnow, …)
//   - { ats, slug }         → an ATS career page (recruitee, greenhouse, …)
//   - { crawl }             → a machine-crawl recipe the tool runs itself
//   - { recipe } (no crawl) → an agent-only recipe the tool stores but never runs
// `execute` ('tool' | 'agent') is DERIVED from that shape (agent iff recipe-only)
// and stamped into the file for visibility; the fetch path reads the shape, not
// the flag, so a hand-edited execute can never disagree with what actually runs.

/** How a field is pulled from a crawled item — a bare selector/path, or a spec. */
const channelField = z.union([
  z.string(),
  z.looseObject({
    selector: z.string().optional(),
    attr: z.string().optional(),
    path: z.string().optional(),
    regex: z.string().optional(),
  }),
])

/**
 * The machine-usable crawl spec. A channel WITH this is fetched by the tool
 * like any board; a channel WITHOUT it stays an agent-only recipe.
 */
const channelCrawl = z.looseObject({
  urlTemplate: z.string(),
  /** 'stacks' = the profile's stacks; or an explicit keyword list; substitutes {keyword}. */
  keywords: z.union([z.literal('stacks'), z.array(z.string())]).optional(),
  /** Extra {name} → values expanded as a cartesian product (e.g. wt: ['2','3']). */
  variants: z.record(z.string(), z.array(z.string())).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  mode: z.enum(['selectors', 'regex', 'json']).optional(),
  /** selectors: item selector · json: dot-path to the array · regex: per-item pattern. */
  item: z.string().optional(),
  fields: z.record(z.string(), channelField).optional(),
  nativeId: z.looseObject({ regex: z.string().optional(), field: z.string().optional() }).optional(),
  detail: z.looseObject({
    urlTemplate: z.string(),
    selector: z.string().optional(),
    path: z.string().optional(),
  }).optional(),
  /** Fetch via the bundled Chromium (JS-rendered / bot-walled pages). */
  render: z.boolean().optional(),
  /**
   * Walk result pages by appending an offset query param (e.g. LinkedIn's
   * `&start=N`, 10 results/page). Stops early on a page that yields no NEW
   * postings, else after `maxPages`.
   */
  paginate: z.looseObject({
    param: z.string(),
    step: z.number().int().positive(),
    start: z.number().int().nonnegative().optional(), // defaults to 0 in the engine
    maxPages: z.number().int().positive().default(3),
  }).optional(),
})

const source = z.looseObject({
  name: z.string(),
  /** Derived from the entry shape; stamped on save. See file header. */
  execute: z.enum(['tool', 'agent']).optional(),
  description: z.string().optional(),
  /** ATS career page. */
  ats: z.string().optional(),
  slug: z.string().optional(),
  addedBy: z.enum(['init', 'manual', 'auto']).optional(),
  /** Free-form recipe data (agent-executed sources): URL templates, parse hints, … */
  recipe: z.unknown().optional(),
  /** Machine-usable spec — present ⇒ the tool crawls this source itself. */
  crawl: channelCrawl.optional(),
})

export type SourceEntry = z.output<typeof source>
export type ChannelCrawl = z.output<typeof channelCrawl>
/** @deprecated use SourceEntry — kept for one release. */
export type ChannelSource = SourceEntry
/** @deprecated use SourceEntry — kept for one release. */
export type CompanySource = SourceEntry

export const sourcesSchema = z.object({
  sources: z.array(source).default([]),
})

export type Sources = z.output<typeof sourcesSchema>

/** What the fetcher does with an entry — inferred from its shape, not `execute`. */
export function sourceKind(entry: SourceEntry): 'board' | 'company' | 'crawl' | 'agent' {
  if (entry.ats) return 'company'
  if (entry.crawl) return 'crawl'
  if (entry.recipe !== undefined) return 'agent'
  return 'board'
}

/** Tool-fetched (board/company/crawl) vs agent-only (recipe). */
export function isToolSource(entry: SourceEntry): boolean {
  return sourceKind(entry) !== 'agent'
}

/** Agent-only sources the tool cannot fetch — the agent must run these. */
export function pendingSources(sources: Sources): SourceEntry[] {
  return sources.sources.filter(s => sourceKind(s) === 'agent')
}

function executeOf(entry: SourceEntry): 'tool' | 'agent' {
  return isToolSource(entry) ? 'tool' : 'agent'
}

function sourcesPath(home: string): string {
  return join(home, 'sources.yaml')
}

interface LegacySources {
  boards?: unknown[]
  companies?: unknown[]
  channels?: unknown[]
}

/** The pre-unification shape: separate boards/companies/channels, no `sources`. */
function isLegacy(raw: unknown): raw is LegacySources {
  if (typeof raw !== 'object' || raw === null) return false
  const r = raw as Record<string, unknown>
  return r.sources === undefined && ('boards' in r || 'companies' in r || 'channels' in r)
}

/** Fold the three legacy lists into one `sources` list, stamping `execute`. */
function migrateLegacy(raw: LegacySources): { sources: SourceEntry[] } {
  const boards = (raw.boards ?? []).map(name => ({ name: String(name), execute: 'tool' }))
  const companies = (raw.companies ?? []).map(c => ({ ...(c as object), execute: 'tool' }))
  const channels = (raw.channels ?? []).map((c) => {
    const entry = c as Record<string, unknown>
    return { ...entry, execute: entry.crawl ? 'tool' : 'agent' }
  })
  return { sources: [...boards, ...companies, ...channels] as SourceEntry[] }
}

export function loadSources(home: string): Sources {
  const path = sourcesPath(home)
  if (!existsSync(path)) return sourcesSchema.parse({})
  const rawText = readFileSync(path, 'utf-8')
  const raw = parse(rawText) as unknown
  const parsed = sourcesSchema.safeParse(isLegacy(raw) ? migrateLegacy(raw) : raw)
  if (!parsed.success) {
    throw new AmtError('SOURCES_INVALID', `${path}:\n${z.prettifyError(parsed.error)}`)
  }
  // One-time migration: preserve the old file as .bak, rewrite in the new shape.
  if (isLegacy(raw)) {
    writeFileSync(`${path}.bak`, rawText)
    saveSources(home, parsed.data)
  }
  return parsed.data
}

export function saveSources(home: string, sources: Sources): void {
  mkdirSync(dirname(sourcesPath(home)), { recursive: true })
  // Stamp the derived execute so the file always reflects what actually runs.
  const stamped = { sources: sources.sources.map(e => ({ ...e, execute: executeOf(e) })) }
  writeFileSync(sourcesPath(home), stringify(stamped))
}

const ATS_ORDER = ['recruitee', 'ashby', 'greenhouse', 'lever', 'personio', 'smartrecruiters']

/** Slug variants worth probing: "shopware AG" → shopware, shopwareag, shopware-ag. */
export function slugCandidates(name: string): string[] {
  const base = slugify(name)
  const bare = base.replace(/-(?:gmbh|ag|se|inc|co)$/, '')
  const variants = new Set([
    bare,
    bare.replaceAll('-', ''),
    base,
    base.replaceAll('-', ''),
    `${bare}ag`,
    `${bare}-ag`,
  ])
  return [...variants].filter(Boolean)
}

export interface DiscoveryResult {
  ats: string
  slug: string
  postings: JobPosting[]
}

/** Probes the ATS API patterns until one answers for the company. */
export async function discoverCompany(
  client: HttpClient,
  name: string,
): Promise<DiscoveryResult | null> {
  for (const ats of ATS_ORDER) {
    const adapter = getAdapter(ats)
    for (const slug of slugCandidates(name)) {
      try {
        const postings = await adapter.fetchCompany!(client, slug)
        return { ats, slug, postings }
      } catch {
        // wrong slug or wrong ATS — keep probing
      }
    }
  }
  return null
}

export interface AddCompanyResult extends DiscoveryResult {
  name: string
  alreadyTracked: boolean
  /** Whether the discovered board's postings actually name this company. */
  verified: boolean
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\b(gmbh|ag|se|inc|co|kg|ltd|llc)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Does the discovered board actually belong to this company? Slug-probing can
 * land on a squatter or an ATS sandbox (recruitee "personio" = "FD Sandbox").
 * If the postings carry company names and none echo the query, it is not ours.
 * When the payload has no usable company names, we cannot disprove it — allow,
 * but the caller can tell (verified:false).
 */
function verifyDiscovery(name: string, postings: JobPosting[]): boolean {
  const wanted = normalizeName(name)
  const tokens = wanted.split(' ').filter(t => t.length >= 3)
  const names = postings.map(p => normalizeName(p.company)).filter(Boolean)
  if (names.length === 0) return true
  return names.some(n => n.includes(wanted) || wanted.includes(n) || tokens.some(t => n.includes(t)))
}

export async function addCompany(
  client: HttpClient,
  home: string,
  name: string,
  addedBy: CompanySource['addedBy'] = 'manual',
): Promise<AddCompanyResult> {
  const sources = loadSources(home)
  const found = await discoverCompany(client, name)
  if (!found) {
    throw new AmtError(
      'COMPANY_NOT_DISCOVERED',
      `No ATS found for "${name}" — probed ${ATS_ORDER.join(', ')} with slug variants ${slugCandidates(name).join(', ')}.`,
    )
  }
  const verified = verifyDiscovery(name, found.postings)
  // Auto-tracking must not silently adopt a squatter/sandbox — only humans
  // (manual) may override a failed name check.
  if (!verified && addedBy === 'auto') {
    throw new AmtError(
      'COMPANY_UNVERIFIED',
      `Discovered ${found.ats}:${found.slug} for "${name}", but its postings do not name the company — not auto-tracking.`,
    )
  }
  const existing = sources.sources.find(
    c => c.ats === found.ats && c.slug === found.slug,
  )
  if (existing) {
    return { ...found, name: existing.name, alreadyTracked: true, verified }
  }
  sources.sources.push({ name, execute: 'tool', ats: found.ats, slug: found.slug, addedBy })
  saveSources(home, sources)
  return { ...found, name, alreadyTracked: false, verified }
}

/**
 * Organic source growth: shortlist/apply/import call this after the user
 * showed interest in a company. Failures are swallowed — tracking is a
 * bonus, never a reason to fail the main action.
 */
export async function tryAutoTrack(
  client: HttpClient,
  home: string,
  enabled: boolean,
  companyName: string,
): Promise<string | null> {
  if (!enabled) return null
  try {
    const added = await addCompany(client, home, companyName, 'auto')
    return added.alreadyTracked ? null : `${added.ats}:${added.slug}`
  } catch {
    return null
  }
}

/** Same-name entries are replaced — updating a recipe is the common case. */
export function upsertSource(
  home: string,
  entry: SourceEntry,
): { updated: boolean } {
  const sources = loadSources(home)
  const needle = entry.name.toLowerCase()
  const index = sources.sources.findIndex(c => c.name.toLowerCase() === needle)
  if (index >= 0) sources.sources[index] = entry
  else sources.sources.push(entry)
  saveSources(home, sources)
  return { updated: index >= 0 }
}

/** Removes any entry matching the given name or ATS slug. */
export function removeSource(home: string, nameOrSlug: string): boolean {
  const sources = loadSources(home)
  const needle = nameOrSlug.toLowerCase()
  const before = sources.sources.length
  sources.sources = sources.sources.filter(
    c => c.name.toLowerCase() !== needle && (c.slug ?? '').toLowerCase() !== needle,
  )
  if (sources.sources.length === before) return false
  saveSources(home, sources)
  return true
}

/** @deprecated use upsertSource — kept for one release. */
export const upsertChannel = upsertSource
/** @deprecated use removeSource — kept for one release. */
export const removeChannel = removeSource
/** @deprecated use removeSource — kept for one release. */
export const removeCompany = removeSource
