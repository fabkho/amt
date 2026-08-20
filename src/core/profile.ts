import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { AmtError } from './errors.js'

// The user profile is authored as TypeScript (profile.config.ts with
// defineProfile) and only ever edited by humans. Anything the tool itself
// writes over time lives elsewhere: statuses/scores in job notes, the crawl
// list in sources.yaml, judgments in seen.json — never here.

const bilingual = z.object({ de: z.string(), en: z.string() })

const link = z.object({ label: z.string(), url: z.string() })

export const profileSchema = z.object({
  identity: z.object({
    name: z.string(),
    role: bilingual,
    email: z.string(),
    phone: z.string(),
    location: bilingual,
    /** e.g. "German (native) · English (fluent)". Empty string hides it. */
    languagesLine: bilingual.optional(),
    links: z.array(link).default([]),
  }),

  search: z.object({
    stacksPrimary: z.array(z.string()).min(1),
    stacksSecondary: z.array(z.string()).default([]),
    salaryFloor: z.number().int().positive(),
    salaryTarget: z.number().int().positive().optional(),
    seniority: z.array(z.string()).default(['senior']),
    /** Ads requiring more years than this are cut (the "5+ years" filter). */
    maxYearsRequired: z.number().int().positive().optional(),
    locations: z.object({
      remote: z.boolean().default(true),
      cities: z
        .array(z.object({ name: z.string(), minHomeOfficeDays: z.number().int() }))
        .default([]),
    }),
    /** Agent-judged during scoring — no deterministic detector exists. */
    companyTypesBlocked: z
      .array(z.string())
      .default(['agency', 'consulting', 'staffing', 'gambling']),
    companyBlocklist: z.array(z.string()).default([]),
    titleBlocklist: z.array(z.string()).default([]),
    maxAgeDays: z.number().int().positive().default(7),
    /** shortlist/apply/import auto-add the company's ATS to sources.yaml. */
    autoTrackCompanies: z.boolean().default(true),
  }),

  tone: z.object({
    salutation: bilingual,
    closing: bilingual,
    /** Free-form rules the agent applies when drafting letters. */
    rules: z.array(z.string()).default([]),
    /** Prose rule deciding de vs en per application. */
    languageRule: z.string().optional(),
  }),

  paths: z.object({
    notesDir: z.string(),
    outputBase: z.string(),
    /** Where cv-data.<lang>.yaml live. Defaults to AMT_HOME. */
    cvDataDir: z.string().optional(),
  }),
})

export type Profile = z.output<typeof profileSchema>
export type ProfileInput = z.input<typeof profileSchema>

export function resolveHome(explicit?: string): string {
  // || on purpose: an empty AMT_HOME means "unset", not "cwd".
  // JOB_KIT_HOME is the pre-rename legacy variable.
  return (
    explicit
    || process.env.AMT_HOME
    || process.env.JOB_KIT_HOME
    || join(homedir(), '.config', 'amt')
  )
}

export function expandPath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return isAbsolute(path) ? path : resolve(path)
}

const CONFIG_CANDIDATES = [
  'profile.config.ts',
  'profile.config.mts',
  'profile.config.js',
  'profile.config.mjs',
]

export async function loadProfile(home?: string): Promise<Profile> {
  const dir = resolveHome(home)
  const file = CONFIG_CANDIDATES.map(name => join(dir, name)).find(existsSync)
  if (!file) {
    throw new AmtError(
      'PROFILE_NOT_FOUND',
      `No profile.config.ts in ${dir}. Set AMT_HOME or create one with defineProfile from 'amt/config'.`,
    )
  }

  const { createJiti } = await import('jiti')
  // A profile lives outside any node_modules tree, so its
  // `import { defineProfile } from 'amt/config'` cannot resolve on its
  // own — alias it onto this package's own module (bundled and source path).
  const here = dirname(fileURLToPath(import.meta.url))
  const defineProfileModule = [
    join(here, 'define-profile.mjs'),
    join(here, '../define-profile.ts'),
  ].find(existsSync)
  const jiti = createJiti(import.meta.url, {
    alias: defineProfileModule
      ? { 'amt/config': defineProfileModule, 'job-kit/config': defineProfileModule }
      : {},
  })
  let raw: unknown
  try {
    raw = await jiti.import(file, { default: true })
  } catch (error) {
    throw new AmtError(
      'PROFILE_INVALID',
      `Failed to load ${file}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const result = profileSchema.safeParse(raw)
  if (!result.success) {
    throw new AmtError(
      'PROFILE_INVALID',
      `${file}:\n${z.prettifyError(result.error)}`,
    )
  }

  const profile = result.data
  profile.paths.notesDir = expandPath(profile.paths.notesDir)
  profile.paths.outputBase = expandPath(profile.paths.outputBase)
  profile.paths.cvDataDir = expandPath(profile.paths.cvDataDir ?? dir)
  return profile
}
