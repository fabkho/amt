import { defineCommand } from 'citty'
import { JobKitError } from '../core/errors.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import { chromiumInstalled, installChromium } from '../core/render/pdf.js'
import { log } from '../utils/logger.js'
import { writeResult } from '../utils/stdout-guard.js'

export default defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check that the job-kit environment is ready to use',
  },
  args: {
    'no-install': {
      type: 'boolean',
      description: 'Only report missing pieces, never install them',
      default: false,
    },
  },
  async run({ args }) {
    let chromium = await chromiumInstalled()
    if (!chromium && !args['no-install']) {
      log.info('Chromium for PDF rendering is missing — installing (~300 MB)…')
      installChromium()
      chromium = await chromiumInstalled()
    }

    // Missing profile is expected before `job-kit init`; an invalid one is a
    // real defect and fails the check.
    const home = resolveHome()
    let profile: string
    let profileBroken = false
    try {
      await loadProfile(home)
      profile = 'ok'
    } catch (error) {
      if (error instanceof JobKitError && error.code === 'PROFILE_NOT_FOUND') {
        profile = `missing — create ${home}/profile.config.ts`
      } else {
        profile = error instanceof Error ? error.message : String(error)
        profileBroken = true
      }
    }

    const checks = {
      node: process.version,
      home,
      chromium,
      profile,
      ok: chromium && !profileBroken,
    }
    writeResult(`${JSON.stringify(checks, null, 2)}\n`)
    if (!checks.ok) process.exitCode = 1
  },
})
