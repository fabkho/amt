import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { loadProfile, profileSchema, readNote, upsertNote, type Profile } from '../src/index.js'
import { dashboard, detail, jobs, toggleFavorite } from '../src/web/handlers.js'
import { jobRows, stats } from '../src/web/data.js'

async function env(): Promise<Profile> {
  const home = mkdtempSync(join(tmpdir(), 'amt-web-'))
  const notesDir = join(home, 'notes')
  const base = await loadProfile(join(import.meta.dirname, 'fixtures/profile-home'))
  const profile = profileSchema.parse({
    ...base,
    search: { ...base.search, locations: { remote: true, cities: [{ name: 'Köln', minHomeOfficeDays: 3 }] } },
    paths: { ...base.paths, notesDir, outputBase: notesDir },
  })
  const posting = (over: Record<string, unknown>) => ({
    company: 'Acme GmbH', slug: 'x', title: 'Role', url: 'https://e.com',
    source: 'manual', nativeId: '1', discoveredAt: '2026-08-24', ...over,
  })
  upsertNote(notesDir, posting({ slug: 'remote-role', title: 'Vue Dev', nativeId: 'a', workMode: 'remote' }), 'We use Vue.')
  upsertNote(notesDir, posting({ slug: 'koeln-role', title: 'PHP Dev', nativeId: 'b', workMode: 'hybrid', location: 'Cologne' }), '')
  return profile
}

describe('web data', () => {
  it('filters rows by status, work mode, and search', async () => {
    const profile = await env()
    expect(jobRows(profile)).toHaveLength(2)
    expect(jobRows(profile, { workMode: 'remote' })).toHaveLength(1)
    expect(jobRows(profile, { q: 'php' })[0]!.slug).toBe('koeln-role')
    expect(stats(profile).unranked).toBe(2)
  })
})

describe('web handlers', () => {
  it('renders the dashboard with the paper masthead and inbox', async () => {
    const profile = await env()
    const reply = dashboard(profile)
    expect(reply.status).toBe(200)
    expect(reply.body).toContain('das Amt')
    expect(reply.body).toContain('📥 Inbox')
    expect(reply.body).toContain('remote-role')
  })

  it('renders a filtered board', async () => {
    const profile = await env()
    const reply = jobs(profile, new URLSearchParams({ workMode: 'remote' }))
    expect(reply.body).toContain('remote-role')
    expect(reply.body).not.toContain('koeln-role')
  })

  it('renders a detail page with actions', async () => {
    const profile = await env()
    const reply = detail(profile, 'remote-role')
    expect(reply.body).toContain('Original posting')
    expect(reply.body).toContain('build application')
  })

  it('toggles favorite and returns the updated row', async () => {
    const profile = await env()
    const reply = toggleFavorite(profile, 'remote-role')
    expect(reply.status).toBe(200)
    expect(readNote(profile.paths.notesDir, 'remote-role').note.favorite).toBe(true)
    expect(reply.body).toContain('★')
  })
})
