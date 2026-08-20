import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { describe, expect, it } from 'vite-plus/test'

/**
 * Child-process integration: the compiled dist/mcp-bin.mjs served through
 * serveStdio over real stdio pipes — pins shebang, bundling, and transport
 * wiring that the in-process tests cannot reach. CI builds before testing;
 * locally the test skips when dist is missing.
 */

const distEntry = fileURLToPath(new URL('../dist/mcp-bin.mjs', import.meta.url))

describe('mcp over stdio', () => {
  it.skipIf(!existsSync(distEntry))('boots and answers discover', async () => {
    const client = new Client({ name: 'stdio-test', version: '0.0.0' })
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [distEntry],
      env: Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined),
      ) as Record<string, string>,
    })
    await client.connect(transport)
    try {
      const { tools } = await client.listTools()
      expect(tools.map(t => t.name)).toContain('discover')
      const result = await client.callTool({ name: 'discover', arguments: {} })
      const text = (result.content as { text: string }[])[0]!.text
      expect(JSON.parse(text).name).toBe('job-kit')
    } finally {
      await client.close()
    }
  }, 20_000)
})
