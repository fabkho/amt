import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCommand } from './_shared.js'
import { AmtError } from '../core/errors.js'
import { loadProfile, resolveHome, type Profile } from '../core/profile.js'
import { chromiumInstalled, installChromium } from '../core/render/pdf.js'
import { loadSources } from '../core/sources-store.js'
import { log } from '../utils/logger.js'

interface Checks {
  node: string
  home: string
  chromium: boolean
  profile: string
  cvData: string[]
  sources: string
  ok: boolean
  next: string | null
}

function cvDataLangs(profile: Profile): string[] {
  return (['de', 'en'] as const).filter(lang =>
    existsSync(join(profile.paths.cvDataDir ?? '', `cv-data.${lang}.yaml`)),
  )
}

interface HomeChecks {
  profile: string
  cvData: string[]
  sources: string
  next: string | null
}

async function checkHome(home: string): Promise<HomeChecks> {
  const profile = await loadProfile(home)
  const cvData = cvDataLangs(profile)
  const sources = loadSources(home)
  let next: string | null = null
  if (cvData.length === 0) {
    next = `Create cv-data.en.yaml (and/or .de) in ${profile.paths.cvDataDir} — prepare needs it.`
  } else if (sources.boards.length === 0 && sources.companies.length === 0) {
    next = 'Add crawl sources: amt sources add <company>'
  }
  return {
    profile: 'ok',
    cvData,
    sources: `${sources.boards.length} board(s), ${sources.companies.length} companies, ${sources.channels.length} agent channel(s)`,
    next,
  }
}

function profileFailure(home: string, error: unknown): HomeChecks {
  const missing = error instanceof AmtError && error.code === 'PROFILE_NOT_FOUND'
  return {
    profile: missing
      ? 'missing'
      : `invalid: ${error instanceof Error ? error.message : String(error)}`,
    cvData: [],
    sources: '(profile missing)',
    next: missing ? 'Run amt init to create your profile.' : `Fix ${home}/profile.yaml.`,
  }
}

/** First `amt` on PATH, when it is not a Node shim (i.e. /usr/sbin/amt). */
function findPathShadow(): string | null {
  for (const dir of (process.env.PATH ?? '').split(':')) {
    const candidate = join(dir, 'amt')
    if (!existsSync(candidate)) continue
    try {
      // Our shims are scripts; the macOS binary is Mach-O (starts with 0xCF/0xCA).
      const fd = readFileSync(candidate)
      const isMachO = fd[0] === 0xCF || fd[0] === 0xCA
      return isMachO ? candidate : null
    } catch {
      return null
    }
  }
  return null
}

async function collectChecks(chromium: boolean): Promise<Checks> {
  const home = resolveHome()
  const state = await checkHome(home).catch(error => profileFailure(home, error))
  const next
    = state.next ?? (chromium ? null : 'Install Chromium for PDF rendering: re-run amt doctor without --no-install.')
  return {
    node: process.version,
    home,
    chromium,
    ...state,
    next,
    ok: chromium && state.profile === 'ok' && state.cvData.length > 0,
  }
}

export default createCommand({
  name: 'doctor',
  description: 'Check that the amt environment is ready to use',
  args: {
    'no-install': {
      type: 'boolean',
      description: 'Only report missing pieces, never install them',
      default: false,
    },
  },
  async run(args) {
    let chromium = await chromiumInstalled()
    if (!chromium && !args['no-install']) {
      log.info('Chromium for PDF rendering is missing — installing (~300 MB)…')
      installChromium()
      chromium = await chromiumInstalled()
    }
    // macOS ships a deprecated /usr/sbin/amt — warn when it shadows ours.
    const shadow = findPathShadow()
    if (shadow) {
      log.warn(
        `\`amt\` on your PATH resolves to ${shadow} (a deprecated macOS system binary), not this tool. `
        + `Prepend your package manager's bin dir, e.g. add to the END of ~/.zshrc: export PATH="$PNPM_HOME:$PATH"`,
      )
    }
    const checks = await collectChecks(chromium)
    // Findings exist but the check itself ran fine — gate semantics, exit 2.
    if (!checks.ok) process.exitCode = 2
    return {
      result: checks,
      human: [
        `node ${checks.node} · home ${checks.home}`,
        `chromium: ${checks.chromium ? 'ok' : 'missing'} · profile: ${checks.profile} · cv-data: ${checks.cvData.join(', ') || 'none'}`,
        `sources: ${checks.sources}`,
        checks.ok ? 'Ready.' : `→ ${checks.next}`,
      ],
    }
  },
})
