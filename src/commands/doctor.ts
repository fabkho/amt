import { defineCommand } from 'citty'
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

    const checks = {
      node: process.version,
      chromium,
      ok: chromium,
    }
    writeResult(`${JSON.stringify(checks, null, 2)}\n`)
    if (!checks.ok) process.exitCode = 1
  },
})
