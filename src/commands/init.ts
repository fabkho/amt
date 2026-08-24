import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { AmtError, toErrorMessage } from '../core/errors.js'
import { profileSchema, resolveHome } from '../core/profile.js'
import { z } from 'zod'
import { loadSources, saveSources, upsertChannel, type ChannelSource } from '../core/sources-store.js'
import { slugify } from '../core/notes.js'
import { log } from '../utils/logger.js'

function profileTemplate(answers: {
  name: string
  email: string
  phone: string
  location: string
  salaryFloor: number
  stacks: string[]
  cities: string[]
  notesDir: string
  outputBase: string
}): string {
  const cities = answers.cities
    .map(c => `    - name: ${c}\n      minHomeOfficeDays: 3`)
    .join('\n')
  return `# yaml-language-server: $schema=./profile.schema.json
# amt profile — hand-edited only; tool-managed state lives in sources.yaml/seen.json
identity:
  name: "${answers.name}"
  role:
    de: Software Engineer
    en: Software Engineer
  email: "${answers.email}"
  phone: "${answers.phone}"
  location:
    de: "${answers.location}"
    en: "${answers.location}"
  links: []
search:
  stacksPrimary: [${answers.stacks.join(", ") || "typescript"}]
  salaryFloor: ${answers.salaryFloor}
  locations:
    remote: true
    cities:
${cities || '      []'}
tone:
  salutation:
    de: "Hallo,"
    en: "Hi,"
  closing:
    de: Viele Grüße
    en: Best regards
  rules: []
paths:
  notesDir: "${answers.notesDir}"
  outputBase: "${answers.outputBase}"
`
}

// init is the one deliberately interactive command — the onboarding moment
// where profile and board seeding questions belong. Everything else stays
// non-interactive so agents and scheduled runs never block.
export default defineCommand({
  meta: { name: 'init', description: 'Interactive onboarding: profile and sources' },
  args: {
    force: { type: 'boolean', description: 'Overwrite an existing profile', default: false },
  },
  async run({ args }) {
    try {
      const home = resolveHome()
      const profilePath = join(home, 'profile.yaml')
      assertInitPreconditions(profilePath, args.force)
      const { answers, boardsAnswer, channelsAnswer } = await askOnboarding()
      mkdirSync(home, { recursive: true })
      writeFileSync(profilePath, profileTemplate(answers))

      // Editor autocomplete for the YAML: generated JSON schema next to it.
      writeFileSync(
        join(home, 'profile.schema.json'),
        `${JSON.stringify(z.toJSONSchema(profileSchema, { io: 'input' }), null, 2)}\n`,
      )

      const sources = loadSources(home)
      for (const board of ['arbeitnow', 'arbeitsagentur']) {
        if (boardsAnswer && !sources.boards.includes(board)) {
          sources.boards.push(board)
        }
      }
      saveSources(home, sources)
      if (channelsAnswer) {
        for (const entry of defaultChannels(answers.stacks, answers.cities)) {
          upsertChannel(home, entry)
        }
        log.info('Channel recipes seeded — your agent executes them in search rounds.')
      }

      // A colleague's first prepare needs CV data — scaffold a commented
      // template so the requirement is visible from day one.
      for (const lang of ['en', 'de']) {
        const cvDataPath = join(home, `cv-data.${lang}.yaml`)
        if (!existsSync(cvDataPath)) writeFileSync(cvDataPath, CV_DATA_TEMPLATE)
      }

      log.success(`Profile written to ${profilePath} — refine role, stacks, and tone rules there.`)
      log.info(`CV data templates (cv-data.en.yaml, cv-data.de.yaml) in ${home} — fill one before your first \`prepare\`.`)
      log.info('Track companies with `amt sources add <company>`, then run `amt crawl`.')
    } catch (error) {
      const code = error instanceof AmtError ? error.code : 'UNEXPECTED'
      log.error(`[${code}] ${toErrorMessage(error)}`)
      process.exitCode = 1
    }
  },
})

function assertInitPreconditions(profilePath: string, force: boolean): void {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    throw new AmtError(
      'INIT_NEEDS_TTY',
      'init is interactive. In agent contexts, write profile.yaml directly (schema: profile.schema.json in AMT_HOME) and use `sources add`.',
    )
  }
  if (existsSync(profilePath) && !force) {
    throw new AmtError(
      'PROFILE_EXISTS',
      `${profilePath} exists — edit it directly or re-run with --force.`,
    )
  }
}

async function askOnboarding() {
  const name = String(await consola.prompt('Your full name:', { type: 'text' }))
  const email = String(await consola.prompt('Email for applications:', { type: 'text' }))
  const phone = String(await consola.prompt('Phone:', { type: 'text' }))
  const location = String(
    await consola.prompt('Location line (e.g. "Cologne, Germany / Remote"):', { type: 'text' }),
  )
  const salaryRaw = await consola.prompt('Salary floor (hard cut below, e.g. 68000):', { type: 'text' })
  // strip everything non-digit: "68.000", "68,000", "68000 EUR" → 68000
  let salaryFloor = Number.parseInt(String(salaryRaw).replace(/\D/g, ''), 10)
  if (!Number.isFinite(salaryFloor) || salaryFloor <= 0) {
    log.warn('Could not read a salary floor — using 50000 as a placeholder; edit profile.yaml.')
    salaryFloor = 50_000
  }
  const stacksRaw = String(
    await consola.prompt('Your stack keywords (comma-separated, e.g. "vue, typescript, node"):', { type: 'text' }),
  )
  const citiesRaw = String(
    await consola.prompt('Hybrid-acceptable cities (comma-separated, empty for remote-only):', { type: 'text' }),
  )
  const notesDir = String(
    await consola.prompt('Directory for job notes (markdown):', { type: 'text', default: '~/job-search/jobs' }),
  )
  const outputBase = String(
    await consola.prompt('Directory for application folders:', { type: 'text', default: '~/Applications-out' }),
  )
  const boardsAnswer = await consola.prompt(
    'Crawl the default boards (Arbeitnow + Bundesagentur für Arbeit, free APIs)?',
    { type: 'confirm' },
  )
  const channelsAnswer = await consola.prompt(
    'Seed agent channel recipes (LinkedIn/StepStone/VueJobs)? Your AGENT runs these during search rounds — the tool itself never does.',
    { type: 'confirm' },
  )
  return {
    boardsAnswer,
    channelsAnswer,
    answers: {
      name,
      email,
      phone,
      location,
      salaryFloor,
      stacks: stacksRaw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
      cities: citiesRaw.split(',').map(c => c.trim()).filter(Boolean),
      notesDir,
      outputBase,
    },
  }
}

const CV_DATA_TEMPLATE = `# CV data — the single source your CVs render from (schema: cvDataSchema).
# Bullets may contain inline HTML (<b>, <code>). One file per language.
personal:
  name: "Your Name"
  role: "Software Engineer"

profile: |
  One or two sentences about how you work.

links:
  - label: "github.com/you"
    url: "https://github.com/you"

experience:
  - company: "Company GmbH"
    location: "City / Remote"
    date: "2022 – present"
    position: "Software Engineer"
    bullets:
      - "<b>Topic:</b> what you did and why it mattered."

education:
  - school: "University"
    program: "Computer Science (B.Sc.)"
    date: "2016 – 2020"
    bullets:
      - "Focus areas."

skills:
  - key: "Frontend"
    val: "…"

projects:
  - name: "project"
    url: "https://github.com/you/project"
    desc: "One line."
`

/**
 * Hydrated channel seeds — the field-tested recipes from
 * skills/job-search/channels.md, filled with the user's answers. Consent is
 * asked in onboarding because the AGENT will execute these; the tool never does.
 */
const LINKEDIN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36'

function defaultChannels(stacks: string[], cities: string[]) {
  const keywords = stacks.length > 0 ? stacks : ['typescript']
  const channels: ChannelSource[] = [
    {
      name: 'linkedin-guest',
      description: 'LinkedIn guest search — tool-crawled (browser UA, per-posting detail)',
      crawl: {
        urlTemplate:
          'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={keyword}&location=Germany&f_WT={wt}&f_TPR=r604800',
        keywords: 'stacks',
        variants: { wt: ['2', '3'] }, // 2 remote, 3 hybrid
        headers: { 'User-Agent': LINKEDIN_UA },
        mode: 'selectors',
        item: 'li',
        fields: {
          title: 'h3.base-search-card__title',
          company: 'h4.base-search-card__subtitle a',
          location: '.job-search-card__location',
          url: { selector: 'a.base-card__full-link', attr: 'href' },
        },
        nativeId: { field: 'url', regex: '-(\\d{8,})' },
        detail: {
          urlTemplate: 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}',
          selector: '.description__text',
        },
      },
      priority: 1,
      yield: 'very high — the main discovery channel in practice',
    },
    {
      name: 'vuejobs',
      description: 'VueJobs internal API — tool-crawled (JSON)',
      crawl: {
        urlTemplate: 'https://vuejobs.com/api/posts',
        mode: 'json',
        item: 'data',
        fields: {
          title: 'title',
          company: 'organization.name',
          url: 'apply_url',
          location: 'work_place',
        },
        nativeId: { field: 'id' },
      },
      priority: 3,
      yield: 'medium — small volume, high stack precision',
    },
    {
      name: 'stepstone',
      description: 'StepStone search pages — agent-executed (detail pages bot-walled)',
      recipe: {
        urlTemplate: `https://www.stepstone.de/jobs/{slug}/in-{${cities.map(slugify).join('|') || 'deutschland'}}?radius=100`,
        slugs: keywords.map(slugify),
        params: 'append &rw=1 for remote; detail pages are flaky — retry with --http1.1',
        parse:
          'search results: "title":"…", "url":"/stellenangebote--…"; details: prefer the application/ld+json JobPosting block; skip dead postings ("Oh nein, der Job ist nicht mehr verfügbar")',
      },
      priority: 2,
      yield: 'high — good discovery via slugs, flaky detail pages',
    },
  ]
  return channels
}
