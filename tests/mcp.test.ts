import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { Client } from '@modelcontextprotocol/client'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import { upsertNote } from '../src/index.js'

/**
 * In-process transport tests: linked client/server pair over the SDK's
 * in-memory transport against a real temp AMT_HOME.
 */

let home: string
let client: Client

function makeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'amt-mcp-'))
  const notesDir = join(dir, 'notes')
  mkdirSync(notesDir, { recursive: true })
  mkdirSync(join(dir, 'out'), { recursive: true })
  cpSync(
    join(import.meta.dirname, 'fixtures/cv-data.en.yaml'),
    join(dir, 'cv-data.en.yaml'),
  )
  let profile = readFileSync(
    join(import.meta.dirname, 'fixtures/profile-home/profile.yaml'),
    'utf-8',
  )
  profile = profile
    // keep MCP tests network-free: no ATS probing on import/shortlist
    .replace('maxYearsRequired: 4', 'maxYearsRequired: 4\n  autoTrackCompanies: false')
    .replace('notesDir: ~/notes/jobs', `notesDir: ${notesDir}`)
    .replace('outputBase: ~/applications', `outputBase: ${join(dir, 'out')}`)
  writeFileSync(join(dir, 'profile.yaml'), profile)
  writeFileSync(
    join(dir, 'sources.yaml'),
    'boards: []\ncompanies: []\nchannels:\n  - name: linkedin-guest\n    description: guest search\n',
  )
  upsertNote(
    notesDir,
    {
      company: 'Acme GmbH',
      slug: 'acme-frontend',
      title: 'Senior Frontend Engineer',
      url: 'https://example.com/1',
      source: 'manual',
      nativeId: '1',
      discoveredAt: '2026-08-20',
    },
    'Great job.',
  )
  return dir
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? ''
  return {
    isError: Boolean(result.isError),
    json: result.isError ? undefined : (JSON.parse(text) as Record<string, unknown>),
    text,
  }
}

beforeAll(async () => {
  home = makeHome()
  process.env.AMT_HOME = home
  const { createServer } = await import('../src/mcp/server.js')
  const server = createServer()
  client = new Client({ name: 'test-client', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
})

afterAll(() => {
  delete process.env.AMT_HOME
})

describe('amt mcp server', () => {
  it('exposes the full tool surface', async () => {
    const { tools } = await client.listTools()
    const names = tools.map(t => t.name).sort()
    expect(names).toEqual([
      'add_source',
      'crawl_jobs',
      'discover',
      'get_job',
      'import_job',
      'list_jobs',
      'prepare_application',
      'remove_source',
      'set_job_status',
    ])
  })

  it('discover reports home, profile, sources, and note counts', async () => {
    const { json } = await call('discover')
    expect(json!.home).toBe(home)
    expect((json!.profile as { name: string }).name).toBe('Jane Doe')
    expect((json!.sources as { channels: unknown[] }).channels).toHaveLength(1)
    expect((json!.noteCounts as Record<string, number>).new).toBe(1)
  })

  it('lists and reads job notes', async () => {
    const { json } = await call('list_jobs', { status: ['new'] })
    expect((json as unknown as { slug: string }[])[0]!.slug).toBe('acme-frontend')
    const note = await call('get_job', { slug: 'acme-frontend' })
    expect((note.json!.body as string)).toContain('Great job.')
  })

  it('persists score, flags, and assessment via set_job_status', async () => {
    // status 'new' avoids the shortlist auto-track (real network probing)
    const { json } = await call('set_job_status', {
      slug: 'acme-frontend',
      status: 'new',
      score: 85,
      flags: ['top_pick'],
      assessment: 'Strong stack fit.',
    })
    expect(json!.score).toBe(85)
    const note = await call('get_job', { slug: 'acme-frontend' })
    expect((note.json!.note as { score: number }).score).toBe(85)
    expect(note.json!.body as string).toContain('## Assessment')
    expect(note.json!.body as string).toContain('Strong stack fit.')
  })

  it('rejects a cut without reason as a tool error', async () => {
    const result = await call('set_job_status', { slug: 'acme-frontend', status: 'cut' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('CUT_REASON_REQUIRED')
  })

  it('generates an application folder without pdf', async () => {
    const { json } = await call('prepare_application', {
      slug: 'acme-frontend',
      lang: 'en',
      pdf: false,
    })
    expect(json!.letterScaffolded).toBe(true)
    expect((json!.files as string[]).some(f => f.endsWith('cv.en.html'))).toBe(true)
  })

  it('imports manual postings and surfaces the existing status on dedupe', async () => {
    const first = await call('import_job', {
      url: 'https://www.linkedin.com/jobs/view/999',
      manual: { company: 'Dotbase', title: 'Senior Frontend Engineer', workMode: 'remote' },
    })
    expect(first.json!.created).toBe(true)
    const slug = first.json!.slug as string

    await call('set_job_status', { slug, status: 'cut', cutReason: 'personal_fit' })

    // Re-running the channel must reveal the existing judgment, not hide it.
    const again = await call('import_job', {
      url: 'https://www.linkedin.com/jobs/view/999',
      manual: { company: 'Dotbase', title: 'Senior Frontend Engineer' },
    })
    expect(again.json!.created).toBe(false)
    expect(again.json!.status).toBe('cut')
  })

  it('serves job notes as resources', async () => {
    const { resources } = await client.listResources()
    expect(resources.map(r => r.uri)).toContain('job://acme-frontend')
    const read = await client.readResource({ uri: 'job://acme-frontend' })
    expect((read.contents[0] as { text: string }).text).toContain('Acme GmbH')
  })

  it('ships both workflow prompts with profile context', async () => {
    const { prompts } = await client.listPrompts()
    expect(prompts.map(p => p.name).sort()).toEqual(['find-new-jobs', 'write-application'])

    const search = await client.getPrompt({ name: 'find-new-jobs', arguments: {} })
    const text = (search.messages[0]!.content as { text: string }).text
    expect(text).toContain('crawl_jobs')
    expect(text).toContain('linkedin-guest') // configured channel surfaces
    expect(text).toContain('CANDIDATE PROFILE')

    const write = await client.getPrompt({
      name: 'write-application',
      arguments: { slug: 'acme-frontend' },
    })
    const writeText = (write.messages[0]!.content as { text: string }).text
    expect(writeText).toContain('TONE RULES')
    expect(writeText).toContain('prepare_application')
  })
})
