import { defineCommand } from 'citty'
import { consola } from 'consola'
import { AmtError, toErrorMessage } from '../core/errors.js'
import { startServer } from '../web/server.js'
import { log } from '../utils/logger.js'

// The one long-running command: a local dashboard over the notes. Not the
// non-interactive JSON shape of the other commands — it blocks and serves.
export default defineCommand({
  meta: { name: 'serve', description: 'Local web dashboard for your job notes (Ctrl-C to stop)' },
  args: {
    port: { type: 'string', description: 'Port (default 4400)' },
  },
  async run({ args }) {
    try {
      const port = args.port ? Number(args.port) : 4400
      const { close } = await startServer(port)
      const url = `http://localhost:${port}`
      log.success(`amt dashboard on ${url} — Ctrl-C to stop.`)
      consola.info('Open it in your browser; changes write straight to your notes.')
      process.on('SIGINT', () => {
        close()
        process.exit(0)
      })
      await new Promise(() => {}) // block until killed
    } catch (error) {
      const code = error instanceof AmtError ? error.code : 'UNEXPECTED'
      log.error(`[${code}] ${toErrorMessage(error)}`)
      process.exitCode = 1
    }
  },
})
