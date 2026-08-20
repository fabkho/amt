import { defineCommand } from 'citty'
import { writeResult } from '../utils/stdout-guard.js'

// Placeholder for the real environment check (Chromium present, profile
// valid, notes dir reachable). Grows with each phase.
export default defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check that the job-kit environment is ready to use',
  },
  run() {
    const checks = {
      node: process.version,
      ok: true,
    }
    writeResult(`${JSON.stringify(checks, null, 2)}\n`)
  },
})
