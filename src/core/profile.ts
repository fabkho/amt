import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { AmtError } from './errors.js'

// The user profile (profile.yaml) is only ever edited by humans — schema-
// validated on load, with editor autocomplete via the generated
// profile.schema.json. Anything the tool itself writes over time lives
// elsewhere: statuses/scores in job notes, the crawl list in sources.yaml,
// judgments in seen.json — never here.

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
    /** Title seniority terms above the target band — cut with reason 'level'. */
    levelBlocklist: z
      .array(z.string())
      .default(['lead', 'staff', 'principal', 'head of', 'director', 'vp', 'chief']),
    /** Location substrings that hard-cut a posting (e.g. 'london', 'united states'). */
    locationBlocklist: z.array(z.string()).default([]),
    maxAgeDays: z.number().int().positive().default(7),
    /** Inbox notes scored below this are hidden by default and auto-pruned on
     *  the daily update (cutReason 'below_threshold'). */
    scoreThreshold: z.number().int().min(0).max(100).default(50),
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

const PROFILE_FILE = 'profile.yaml'

export async function loadProfile(home?: string): Promise<Profile> {
  const dir = resolveHome(home)
  const file = join(dir, PROFILE_FILE)
  if (!existsSync(file)) {
    const legacy = join(dir, 'profile.config.ts')
    throw new AmtError(
      'PROFILE_NOT_FOUND',
      existsSync(legacy)
        ? `Found legacy ${legacy} — amt now reads profile.yaml. Convert it (same keys, YAML syntax) and rename the old file.`
        : `No profile.yaml in ${dir}. Set AMT_HOME or create one (run \`amt init\`, or copy the template and edit).`,
    )
  }

  let raw: unknown
  try {
    raw = parse(readFileSync(file, 'utf-8'))
  } catch (error) {
    throw new AmtError(
      'PROFILE_INVALID',
      `${file} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const result = profileSchema.safeParse(raw)
  if (!result.success) {
    throw new AmtError('PROFILE_INVALID', `${file}:\n${z.prettifyError(result.error)}`)
  }

  const profile = result.data
  profile.paths.notesDir = expandPath(profile.paths.notesDir)
  profile.paths.outputBase = expandPath(profile.paths.outputBase)
  profile.paths.cvDataDir = expandPath(profile.paths.cvDataDir ?? dir)
  return profile
}
