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

const channel = z.looseObject({
  name: z.string(),
  description: z.string().optional(),
  /** Free-form recipe data for the agent: URL templates, parse hints, … */
  recipe: z.unknown().optional(),
})

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
  const existing = sources.companies.find(
    c => c.ats === found.ats && c.slug === found.slug,
  )
  if (existing) {
    return { ...found, name: existing.name, alreadyTracked: true }
  }
  sources.companies.push({ name, ats: found.ats, slug: found.slug, addedBy })
  saveSources(home, sources)
  return { ...found, name, alreadyTracked: false }
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
