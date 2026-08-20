import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

// Every tool, resource, and prompt handler must default its paths to this —
// falling through to a cwd default would ignore JOB_KIT_HOME (the documented
// env contract).
export const DEFAULT_HOME = process.env.JOB_KIT_HOME ?? process.cwd()

function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'job-kit-mcp',
    version,
  })

  // ─── Tool: discover ────────────────────────────────────────────

  server.registerTool(
    'discover',
    {
      title: 'Discover job-kit Setup',
      description:
        'Discover the job-kit setup: version, home directory, and (once implemented) the active '
        + 'profile, notes inventory, and configured sources. Call this first to understand the '
        + 'environment before using other tools.',
      inputSchema: z.object({}),
    },
    async () =>
      jsonContent({
        name: 'job-kit',
        version,
        home: DEFAULT_HOME,
        status: 'scaffold — core operations land in phase 2',
      }),
  )

  return server
}
