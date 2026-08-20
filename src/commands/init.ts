import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { JobKitError, toErrorMessage } from '../core/errors.js'
import { resolveHome } from '../core/profile.js'
import { loadSources, saveSources } from '../core/sources-store.js'
import { log } from '../utils/logger.js'

function profileTemplate(answers: {
  name: string
  email: string
  phone: string
  location: string
  salaryFloor: number
  cities: string[]
  notesDir: string
  outputBase: string
}): string {
  const cities = answers.cities
    .map(c => `{ name: '${c}', minHomeOfficeDays: 3 }`)
    .join(', ')
  return `import { defineProfile } from 'job-kit/config'

export default defineProfile({
  identity: {
    name: '${answers.name}',
    role: { de: 'Software Engineer', en: 'Software Engineer' },
    email: '${answers.email}',
    phone: '${answers.phone}',
    location: { de: '${answers.location}', en: '${answers.location}' },
    links: [],
  },
  search: {
    stacksPrimary: ['typescript'],
    salaryFloor: ${answers.salaryFloor},
    locations: {
      remote: true,
      cities: [${cities}],
    },
  },
  tone: {
    salutation: { de: 'Hallo,', en: 'Hi,' },
    closing: { de: 'Viele Grüße', en: 'Best regards' },
    rules: [],
  },
  paths: {
    notesDir: '${answers.notesDir}',
    outputBase: '${answers.outputBase}',
  },
})
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
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      throw new JobKitError(
        'INIT_NEEDS_TTY',
        'init is interactive. In agent contexts, write profile.config.ts directly and use `sources add`.',
      )
    }
    const home = resolveHome()
    const profilePath = join(home, 'profile.config.ts')
    if (existsSync(profilePath) && !args.force) {
      throw new JobKitError(
        'PROFILE_EXISTS',
        `${profilePath} exists — edit it directly or re-run with --force.`,
      )
    }

    try {
      const name = await consola.prompt('Your full name:', { type: 'text' })
      const email = await consola.prompt('Email for applications:', { type: 'text' })
      const phone = await consola.prompt('Phone:', { type: 'text' })
      const location = await consola.prompt('Location line (e.g. "Cologne, Germany / Remote"):', { type: 'text' })
      const salaryFloor = Number(
        await consola.prompt('Salary floor (hard cut below, e.g. 68000):', { type: 'text' }),
      )
      const citiesRaw = await consola.prompt('Hybrid-acceptable cities (comma-separated, empty for remote-only):', { type: 'text' })
      const notesDir = await consola.prompt('Directory for job notes (markdown):', {
        type: 'text',
        default: '~/job-search/jobs',
      })
      const outputBase = await consola.prompt('Directory for application folders:', {
        type: 'text',
        default: '~/Applications-out',
      })
      const boardsAnswer = await consola.prompt('Crawl the Arbeitnow board (German market, free API)?', {
        type: 'confirm',
      })

      mkdirSync(home, { recursive: true })
      writeFileSync(
        profilePath,
        profileTemplate({
          name: String(name),
          email: String(email),
          phone: String(phone),
          location: String(location),
          salaryFloor: Number.isFinite(salaryFloor) ? salaryFloor : 0,
          cities: String(citiesRaw)
            .split(',')
            .map(c => c.trim())
            .filter(Boolean),
          notesDir: String(notesDir),
          outputBase: String(outputBase),
        }),
      )

      const sources = loadSources(home)
      if (boardsAnswer && !sources.boards.includes('arbeitnow')) {
        sources.boards.push('arbeitnow')
      }
      saveSources(home, sources)

      log.success(`Profile written to ${profilePath} — refine role, stacks, and tone rules there.`)
      log.info('Track companies with `job-kit sources add <company>`, then run `job-kit crawl`.')
    } catch (error) {
      log.error(toErrorMessage(error))
      process.exitCode = 1
    }
  },
})
