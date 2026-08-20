import { createRequire } from 'node:module'
import { defineCommand, runMain } from 'citty'

const require = createRequire(import.meta.url)
const { version, description } = require('../package.json') as {
  version: string
  description: string
}

const main = defineCommand({
  meta: {
    name: 'job-kit',
    version,
    description,
  },
  subCommands: {
    doctor: () => import('./commands/doctor.js').then(m => m.default),
  },
})

export async function runCli(): Promise<void> {
  await runMain(main)
}
