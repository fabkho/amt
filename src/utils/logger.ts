import { createConsola } from 'consola'

// All diagnostics go to stderr — stdout is reserved for command results so
// that `job-kit … | jq` and CI `$(…)` captures always receive pure JSON.
export const log = createConsola({
  stdout: process.stderr,
  stderr: process.stderr,
}).withTag('job-kit')
