import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  listNotes,
  notesForCompany,
  readNote,
  renderIndex,
  setStatus,
  slugify,
  updateNote,
  upsertNote,
  type JobNoteInput,
} from '../src/index.js'
import { writeNote } from '../src/core/notes.js'

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'amt-notes-'))
}

function posting(overrides: Partial<JobNoteInput> = {}): JobNoteInput {
  return {
    company: 'Acme GmbH',
    slug: slugify('Acme GmbH Senior Frontend'),
    title: 'Senior Frontend Engineer',
    url: 'https://example.com/jobs/1',
    source: 'recruitee',
    nativeId: '1',
    discoveredAt: '2026-08-20',
    ...overrides,
  }
}

describe('slugify', () => {
  it('handles umlauts and noise', () => {
    expect(slugify('Müller & Söhne AG — Web (m/w/d)!'))
      .toBe('mueller-soehne-ag-web-m-w-d')
  })
})

describe('notes CRUD', () => {
  it('writes and reads a note with defaults applied', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'Job description here.')
    const { note, body } = readNote(dir, 'acme-gmbh-senior-frontend')
    expect(note.status).toBe('new')
    expect(note.workMode).toBeNull()
    expect(body).toContain('Job description here.')
  })

  it('dedupes on source:nativeId and preserves human state', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'v1')
    setStatus(dir, 'acme-gmbh-senior-frontend', 'shortlist')

    const result = upsertNote(
      dir,
      posting({ title: 'Senior Frontend Engineer (all genders)', salaryMin: 70_000 }),
      'v2 with salary',
    )
    expect(result.created).toBe(false)

    const { note, body } = readNote(dir, result.slug)
    expect(note.status).toBe('shortlist') // human state survived
    expect(note.salaryMin).toBe(70_000) // posting facts refreshed
    expect(body).toContain('v2 with salary')
  })

  it('preserves human text outside the description markers on refresh', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'original description')
    const { note, body } = readNote(dir, 'acme-gmbh-senior-frontend')
    writeNote(dir, note, `${body}\n\nMy own interview notes.`)

    upsertNote(dir, posting(), 'refreshed description')
    const after = readNote(dir, 'acme-gmbh-senior-frontend')
    expect(after.body).toContain('refreshed description')
    expect(after.body).not.toContain('original description')
    expect(after.body).toContain('My own interview notes.') // human text survived
  })

  it('persists score, flags, and assessment via updateNote', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'desc')
    updateNote(dir, 'acme-gmbh-senior-frontend', {
      score: 72,
      flags: ['uncertain'],
      assessment: 'Solid but salary unclear.',
    })
    const { note, body } = readNote(dir, 'acme-gmbh-senior-frontend')
    expect(note.score).toBe(72)
    expect(note.flags).toEqual(['uncertain'])
    expect(body).toContain('## Assessment')
    // updating replaces the assessment block instead of appending
    updateNote(dir, 'acme-gmbh-senior-frontend', { assessment: 'Revised.' })
    const again = readNote(dir, 'acme-gmbh-senior-frontend')
    expect(again.body).toContain('Revised.')
    expect(again.body).not.toContain('Solid but salary unclear.')
  })

  it('creates distinct notes for distinct postings', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'a')
    upsertNote(
      dir,
      posting({ nativeId: '2', slug: 'acme-gmbh-backend', title: 'Backend' }),
      'b',
    )
    expect(listNotes(dir)).toHaveLength(2)
  })

  it('rejects a cut without a reason', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'x')
    expect(() => setStatus(dir, 'acme-gmbh-senior-frontend', 'cut'))
      .toThrowError(/cutReason/)
    const note = setStatus(dir, 'acme-gmbh-senior-frontend', 'cut', {
      cutReason: 'company_type',
      cutNote: 'agency',
    })
    expect(note.cutReason).toBe('company_type')
  })

  it('filters by status', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'a')
    upsertNote(dir, posting({ nativeId: '2', slug: 'other' }), 'b')
    setStatus(dir, 'other', 'applied')
    expect(listNotes(dir, { status: ['applied'] })).toHaveLength(1)
  })
})

describe('notesForCompany', () => {
  it('lists other notes at the company, excluding the given slug', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'a')
    upsertNote(dir, posting({ nativeId: '2', slug: 'acme-backend', title: 'Backend' }), 'b')
    upsertNote(dir, posting({ nativeId: '3', slug: 'other-co', company: 'Other Co' }), 'c')
    const history = notesForCompany(dir, 'Acme GmbH', 'acme-backend')
    expect(history).toHaveLength(1)
    expect(history[0]!.slug).toBe('acme-gmbh-senior-frontend')
  })
})

describe('index view', () => {
  it('groups by status and skips the index file on re-listing', () => {
    const dir = freshDir()
    upsertNote(dir, posting({ salaryMin: 68_000, salaryMax: 75_000 }), 'a')
    upsertNote(dir, posting({ nativeId: '2', slug: 'cut-one' }), 'b')
    setStatus(dir, 'cut-one', 'cut', { cutReason: 'ethics' })

    const content = renderIndex(dir)
    expect(content).toContain('## new (1)')
    expect(content).toContain('## cut (1)')
    expect(content).toContain('✂️ ethics')
    expect(content).toContain('68000–75000')
    expect(readFileSync(join(dir, '_index.md'), 'utf-8')).toBe(content)
    // _index.md must not be picked up as a note
    expect(listNotes(dir)).toHaveLength(2)
  })
})
