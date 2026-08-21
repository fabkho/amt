#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { toErrorMessage } from './index.js'
import { createServer } from './mcp/server.js'

// stderr is the only log channel; stdout belongs to the JSON-RPC wire.
try {
  serveStdio(() => createServer(), {
    onerror: (error) => {
      process.stderr.write(`[amt-mcp] ${toErrorMessage(error)}\n`)
    },
  })
} catch (error) {
  process.stderr.write(`[amt-mcp] Fatal error: ${toErrorMessage(error)}\n`)
  process.exit(1)
}
