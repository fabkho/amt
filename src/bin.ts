#!/usr/bin/env node
// Install the stdout guard before anything else loads, so third-party logs
// can never pollute the machine-readable output on stdout. Help/version
// invocations skip the guard: they never load third-party code and their
// output belongs on stdout.
import { guardStdout } from './utils/stdout-guard.js'

const args = process.argv.slice(2)
const isHelpOrVersion = args.includes('--help') || args.includes('-h')
  || args.includes('--version') || args.includes('-v')
if (!isHelpOrVersion) {
  guardStdout()
}
const { runCli } = await import('./cli.js')
await runCli()
