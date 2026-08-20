import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { JobKitError } from './errors.js'

// The user profile is authored as TypeScript (profile.config.ts with
// defineProfile) and only ever edited by humans. Anything the tool itself
// writes over time — statuses, cut lists — lives in job notes, never here.

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
    companyTypesBlocked: z
      .array(z.string())
      .default(['agency', 'consulting', 'staffing', 'gambling']),
    companyBlocklist: z.array(z.string()).default([]),
    titleBlocklist: z.array(z.string()).default([]),
    maxAgeDays: z.number().int().positive().default(7),
  }),

  sources: z
    .object({
      /** Company slugs per ATS, e.g. { recruitee: ["shopwareag"] }. */
      ats: z.record(z.string(), z.array(z.string())).default({}),
      boards: z.array(z.string()).default(['arbeitnow']),
    })
    .default({ ats: {}, boards: ['arbeitnow'] }),

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
    /** Where cv-data.<lang>.yaml live. Defaults to JOB_KIT_HOME. */
    cvDataDir: z.string().optional(),
  }),
})

export type Profile = z.output<typeof profileSchema>
export type ProfileInput = z.input<typeof profileSchema>

export function resolveHome(explicit?: string): string {
  return (
    explicit
    ?? process.env.JOB_KIT_HOME
    ?? join(homedir(), '.config', 'job-kit')
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
    throw new JobKitError(
      'PROFILE_NOT_FOUND',
      `No profile.config.ts in ${dir}. Set JOB_KIT_HOME or create one with defineProfile from 'job-kit/config'.`,
    )
  }

  const { createJiti } = await import('jiti')
  // A profile lives outside any node_modules tree, so its
  // `import { defineProfile } from 'job-kit/config'` cannot resolve on its
  // own — alias it onto this package's own module (bundled and source path).
  const here = dirname(fileURLToPath(import.meta.url))
  const defineProfileModule = [
    join(here, 'define-profile.mjs'),
    join(here, '../define-profile.ts'),
  ].find(existsSync)
  const jiti = createJiti(import.meta.url, {
    alias: defineProfileModule
      ? { 'job-kit/config': defineProfileModule, 'job-kit': defineProfileModule }
      : {},
  })
  let raw: unknown
  try {
    raw = await jiti.import(file, { default: true })
  } catch (error) {
    throw new JobKitError(
      'PROFILE_INVALID',
      `Failed to load ${file}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const result = profileSchema.safeParse(raw)
  if (!result.success) {
    throw new JobKitError(
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
