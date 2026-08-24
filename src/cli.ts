import { createRequire } from 'node:module'
import { defineCommand, runMain } from 'citty'

const require = createRequire(import.meta.url)
const { version, description } = require('../package.json') as {
  version: string
  description: string
}

const main = defineCommand({
  meta: {
    name: 'amt',
    version,
    description,
  },
  subCommands: {
    init: () => import('./commands/init.js').then(m => m.default),
    doctor: () => import('./commands/doctor.js').then(m => m.default),
    crawl: () => import('./commands/crawl.js').then(m => m.default),
    sources: () => import('./commands/sources.js').then(m => m.default),
    import: () => import('./commands/import.js').then(m => m.default),
    list: () => import('./commands/list.js').then(m => m.default),
    inbox: () => import('./commands/inbox.js').then(m => m.default),
    reconsider: () => import('./commands/reconsider.js').then(m => m.default),
    serve: () => import('./commands/serve.js').then(m => m.default),
    status: () => import('./commands/status.js').then(m => m.default),
    show: () => import('./commands/show.js').then(m => m.default),
    prepare: () => import('./commands/prepare.js').then(m => m.default),
  },
})

export async function runCli(): Promise<void> {
  await runMain(main)
}
