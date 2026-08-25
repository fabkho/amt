import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { loadProfile, profileSchema, readNote, setStatus, upsertNote, type Profile } from '../src/index.js'
import { changeStatus, dashboard, detail, jobs, revealDocs } from '../src/web/handlers.js'
import { jobRows, platformOf, safeUrl, stats } from '../src/web/data.js'

async function env(): Promise<Profile> {
  const home = mkdtempSync(join(tmpdir(), 'amt-web-'))
  const notesDir = join(home, 'notes')
  const base = await loadProfile(join(import.meta.dirname, 'fixtures/profile-home'))
  const profile = profileSchema.parse({
    ...base,
    search: {
      ...base.search,
      autoTrackCompanies: false,
      locations: { remote: true, cities: [{ name: 'Köln', minHomeOfficeDays: 3 }] },
    },
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

  it('no statuses selected hides cut/rejected; selecting one or more reveals them', async () => {
    const profile = await env()
    setStatus(profile.paths.notesDir, 'koeln-role', 'cut', { cutReason: 'personal_fit' })
    expect(jobRows(profile).map(r => r.slug)).toEqual(['remote-role']) // default active hides the cut one
    expect(jobRows(profile, { statuses: ['cut'] }).map(r => r.slug)).toEqual(['koeln-role'])
  })

  it('multiple selected statuses return the union', async () => {
    const profile = await env()
    setStatus(profile.paths.notesDir, 'koeln-role', 'cut', { cutReason: 'personal_fit' })
    // remote-role is 'new', koeln-role is now 'cut' → selecting both yields both
    expect(jobRows(profile, { statuses: ['new', 'cut'] }).map(r => r.slug).sort())
      .toEqual(['koeln-role', 'remote-role'])
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
    expect(reply.body).toContain('accept → shortlist')
    expect(reply.body).toContain('reject')
  })


  it('rejects an invalid status with 400 and does not corrupt the note', async () => {
    const profile = await env()
    const reply = await changeStatus(profile, profile.paths.notesDir, 'remote-role', 'bogus')
    expect(reply.status).toBe(400)
    expect(readNote(profile.paths.notesDir, 'remote-role').note.status).toBe('new')
  })

  it('cut with no reason defaults to personal_fit', async () => {
    const profile = await env()
    await changeStatus(profile, profile.paths.notesDir, 'remote-role', 'cut', '')
    const { note } = readNote(profile.paths.notesDir, 'remote-role')
    expect(note.status).toBe('cut')
    expect(note.cutReason).toBe('personal_fit')
  })

  it('persists a free-text cutNote from the reject dialog', async () => {
    const profile = await env()
    await changeStatus(profile, profile.paths.notesDir, 'remote-role', 'cut', 'home_office_below', '/', 'only 50% remote')
    const { note } = readNote(profile.paths.notesDir, 'remote-role')
    expect(note.cutReason).toBe('home_office_below')
    expect(note.cutNote).toBe('only 50% remote')
  })

  it('removes the row from the dashboard but keeps it (updated) on the board', async () => {
    const profile = await env()
    const fromDashboard = await changeStatus(profile, profile.paths.notesDir, 'remote-role', 'shortlist', undefined, '/')
    // removed from the inbox via an explicit OOB delete (not just an empty body)
    expect(fromDashboard.body).toContain('id="row-remote-role" hx-swap-oob="delete"')

    const fromBoard = await changeStatus(profile, profile.paths.notesDir, 'koeln-role', 'shortlist', undefined, 'http://localhost:4400/jobs')
    expect(fromBoard.body).toContain('id="row-koeln-role"') // kept, badge updated
  })

  it('applied rows show advance + rejected actions, not accept/cut', async () => {
    const profile = await env()
    setStatus(profile.paths.notesDir, 'remote-role', 'applied')
    const reply = jobs(profile, new URLSearchParams({ status: 'applied' }))
    expect(reply.body).toContain('→ interview')
    expect(reply.body).toContain('rejected')
    expect(reply.body).not.toContain('>accept</button>')
  })

  it('revealDocs 404s when the note has no documents folder', async () => {
    const profile = await env()
    expect(revealDocs(profile, 'remote-role').status).toBe(404)
  })

  it('board reject drops the row from the default active view but keeps it when cut is selected', async () => {
    const active = await env()
    const dropped = await changeStatus(active, active.paths.notesDir, 'remote-role', 'cut', 'personal_fit', 'http://x/jobs')
    expect(dropped.body).toContain('id="row-remote-role" hx-swap-oob="delete"') // cut leaves active view

    const shown = await env()
    const kept = await changeStatus(shown, shown.paths.notesDir, 'remote-role', 'cut', 'personal_fit', 'http://x/jobs?status=cut')
    expect(kept.body).toContain('id="row-remote-role"')
    expect(kept.body).not.toContain('hx-swap-oob="delete"') // still matches the 'cut' chip → kept + updated
  })
})

describe('platformOf', () => {
  it('maps a known source to a label + favicon', () => {
    const p = platformOf('linkedin-guest')
    expect(p.label).toBe('LinkedIn')
    expect(p.icon).toContain('linkedin.com')
  })
  it('falls back to the raw source with no icon', () => {
    const p = platformOf('some-unknown-board')
    expect(p.label).toBe('some-unknown-board')
    expect(p.icon).toBe('')
  })
})

describe('safeUrl', () => {
  it('passes http(s) and blocks other schemes', () => {
    expect(safeUrl('https://example.com/x')).toBe('https://example.com/x')
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl(null)).toBe('')
  })

  it('minScore=abc is ignored, not applied as NaN', async () => {
    const profile = await env()
    expect(jobRows(profile).length).toBe(jobRows(profile, {}).length)
    const both = jobs(profile, new URLSearchParams({ minScore: 'abc' }))
    expect(both.body).toContain('remote-role')
    expect(both.body).toContain('koeln-role')
  })
})
