import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { AmtError } from './errors.js'
import { getAdapter } from './sources/index.js'
import { slugify } from './notes.js'
import type { HttpClient, JobPosting } from './sources/types.js'

// The crawl list is tool-managed state (hydrated by init, grown organically
// by shortlist/apply/import), so it lives in sources.yaml — never in the
// hand-edited profile.yaml.
//
// Three sections:
//   boards    — clean zero-config APIs, crawled by the tool
//   companies — ATS career pages, crawled by the tool
//   channels  — agent-executed recipes (LinkedIn guest, StepStone …); the
//               tool only stores and serves them, it never runs them.

const company = z.object({
  name: z.string(),
  ats: z.string(),
  slug: z.string(),
  addedBy: z.enum(['init', 'manual', 'auto']).default('manual'),
})

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
})

const channel = z.looseObject({
  name: z.string(),
  description: z.string().optional(),
  /** Free-form recipe data (agent-executed channels): URL templates, parse hints, … */
  recipe: z.unknown().optional(),
  /** Machine-usable spec — present ⇒ the tool crawls this channel itself. */
  crawl: channelCrawl.optional(),
})

export type ChannelSource = z.output<typeof channel>
export type ChannelCrawl = z.output<typeof channelCrawl>

export const sourcesSchema = z.object({
  boards: z.array(z.string()).default([]),
  companies: z.array(company).default([]),
  channels: z.array(channel).default([]),
})

export type Sources = z.output<typeof sourcesSchema>
export type CompanySource = z.output<typeof company>

function sourcesPath(home: string): string {
  return join(home, 'sources.yaml')
}

export function loadSources(home: string): Sources {
  const path = sourcesPath(home)
  if (!existsSync(path)) return sourcesSchema.parse({})
  const result = sourcesSchema.safeParse(parse(readFileSync(path, 'utf-8')))
  if (!result.success) {
    throw new AmtError('SOURCES_INVALID', `${path}:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}

export function saveSources(home: string, sources: Sources): void {
  mkdirSync(dirname(sourcesPath(home)), { recursive: true })
  writeFileSync(sourcesPath(home), stringify(sources))
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
  const existing = sources.companies.find(
    c => c.ats === found.ats && c.slug === found.slug,
  )
  if (existing) {
    return { ...found, name: existing.name, alreadyTracked: true, verified }
  }
  sources.companies.push({ name, ats: found.ats, slug: found.slug, addedBy })
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

/** Same-name channels are replaced — updating a recipe is the common case. */
export function upsertChannel(
  home: string,
  entry: ChannelSource,
): { updated: boolean } {
  const sources = loadSources(home)
  const needle = entry.name.toLowerCase()
  const index = sources.channels.findIndex(c => c.name.toLowerCase() === needle)
  if (index >= 0) sources.channels[index] = entry
  else sources.channels.push(entry)
  saveSources(home, sources)
  return { updated: index >= 0 }
}

export function removeChannel(home: string, name: string): boolean {
  const sources = loadSources(home)
  const needle = name.toLowerCase()
  const before = sources.channels.length
  sources.channels = sources.channels.filter(c => c.name.toLowerCase() !== needle)
  if (sources.channels.length === before) return false
  saveSources(home, sources)
  return true
}

export function removeCompany(home: string, nameOrSlug: string): boolean {
  const sources = loadSources(home)
  const needle = nameOrSlug.toLowerCase()
  const before = sources.companies.length
  sources.companies = sources.companies.filter(
    c => c.name.toLowerCase() !== needle && c.slug.toLowerCase() !== needle,
  )
  if (sources.companies.length === before) return false
  saveSources(home, sources)
  return true
}
