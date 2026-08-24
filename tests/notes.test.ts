import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  dedupeKey,
  findProbableDuplicates,
  listNotes,
  notesForCompany,
  readNote,
  renderIndex,
  setStatus,
  slugify,
  undescribedNotes,
  unrankedNotes,
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

describe('dedupeKey', () => {
  it('is source-independent — same company+title collapses across sources', () => {
    const li = { company: 'koppla GmbH', title: 'Product Engineer - Frontend (all genders)' }
    const manual = { company: 'koppla', title: 'Product Engineer – Frontend' }
    expect(dedupeKey(li)).toBe(dedupeKey(manual))
  })

  it('keeps genuinely different roles apart', () => {
    expect(dedupeKey({ company: 'Acme', title: 'Frontend Engineer' }))
      .not.toBe(dedupeKey({ company: 'Acme', title: 'Backend Engineer' }))
    expect(dedupeKey({ company: 'Acme', title: 'Frontend Engineer' }))
      .not.toBe(dedupeKey({ company: 'Other', title: 'Frontend Engineer' }))
  })
})

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

  it('re-opens a note for ranking when a real description arrives after scoring', () => {
    const dir = freshDir()
    // imported with no description, then scored on title/company priors
    upsertNote(dir, posting(), '')
    updateNote(dir, 'acme-gmbh-senior-frontend', { score: 70 })
    expect(undescribedNotes(dir)).toContain('acme-gmbh-senior-frontend')

    // the description arrives on a refresh → score is cleared
    upsertNote(dir, posting(), 'We use Vue 3 and TypeScript daily.')
    expect(readNote(dir, 'acme-gmbh-senior-frontend').note.score).toBeNull()
    expect(undescribedNotes(dir)).toHaveLength(0)
    expect(unrankedNotes(dir)).toContain('acme-gmbh-senior-frontend')
  })

  it('stamps appliedAt when a note becomes applied, and offer is a valid status', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'a')
    const applied = setStatus(dir, 'acme-gmbh-senior-frontend', 'applied', { at: '2026-08-24' })
    expect(applied.application?.appliedAt).toBe('2026-08-24')
    // re-stamping keeps the first date
    const again = setStatus(dir, 'acme-gmbh-senior-frontend', 'applied', { at: '2026-09-01' })
    expect(again.application?.appliedAt).toBe('2026-08-24')
    // offer is a real terminal status
    expect(setStatus(dir, 'acme-gmbh-senior-frontend', 'offer').status).toBe('offer')
  })

  it('filters by status', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'a')
    upsertNote(dir, posting({ nativeId: '2', slug: 'other', title: 'Backend Engineer' }), 'b')
    setStatus(dir, 'other', 'applied')
    expect(listNotes(dir, { status: ['applied'] })).toHaveLength(1)
  })
})

describe('robustness (code-review regressions)', () => {
  it('rejects an invalid cutReason before writing anything', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'a')
    expect(() =>
      setStatus(dir, 'acme-gmbh-senior-frontend', 'cut', {
        cutReason: 'not-a-reason' as never,
      }),
    ).toThrowError(/CUT_REASON_INVALID|Unknown cutReason/)
    // note untouched and still readable
    expect(readNote(dir, 'acme-gmbh-senior-frontend').note.status).toBe('new')
  })

  it('clears cut metadata when a note leaves cut', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'a')
    setStatus(dir, 'acme-gmbh-senior-frontend', 'cut', { cutReason: 'ethics', cutNote: 'nope' })
    const note = setStatus(dir, 'acme-gmbh-senior-frontend', 'shortlist')
    expect(note.cutReason).toBeNull()
    expect(note.cutNote).toBeNull()
  })

  it('one malformed note file never takes down listNotes', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'a')
    writeFileSync(join(dir, 'broken.md'), '---\nstatus: cut\ncutReason: garbage\n---\nbody\n')
    const notes = listNotes(dir)
    expect(notes).toHaveLength(1) // the bad file is skipped, not fatal
    expect(() => readNote(dir, 'broken')).toThrowError() // direct access stays strict
  })

  it('never destroys human text around a dangling assessment marker', () => {
    const dir = freshDir()
    upsertNote(dir, posting(), 'desc')
    updateNote(dir, 'acme-gmbh-senior-frontend', { assessment: 'First.' })
    // user deletes the END marker while editing, writes precious notes below
    const { note, body } = readNote(dir, 'acme-gmbh-senior-frontend')
    const broken = body.replace('<!-- /job-kit:assessment -->', '') + '\n\nMY PRECIOUS HUMAN NOTES'
    writeNote(dir, note, broken)
    updateNote(dir, 'acme-gmbh-senior-frontend', { assessment: 'Second.' })
    updateNote(dir, 'acme-gmbh-senior-frontend', { assessment: 'Third.' })
    const after = readNote(dir, 'acme-gmbh-senior-frontend').body
    expect(after).toContain('MY PRECIOUS HUMAN NOTES')
    expect(after).toContain('Third.')
    expect(after).not.toContain('Second.')
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

describe('findProbableDuplicates', () => {
  it('fuzzy-matches titles across gender suffixes and separators', () => {
    const dir = freshDir()
    upsertNote(dir, posting({ title: 'Senior Frontend Engineer (m/w/d)' }), 'a')
    upsertNote(
      dir,
      posting({ nativeId: '2', slug: 'octopus-li', source: 'manual', title: 'Senior  Frontend Engineer' }),
      'b',
    )
    const dupes = findProbableDuplicates(dir, 'Acme GmbH', 'Senior Frontend Engineer!', 'octopus-li')
    expect(dupes).toHaveLength(1)
    expect(dupes[0]!.slug).toBe('acme-gmbh-senior-frontend')
    // different role at the same company is NOT a duplicate
    expect(findProbableDuplicates(dir, 'Acme GmbH', 'Backend Engineer')).toHaveLength(0)
  })
})

describe('index view', () => {
  it('groups by status and skips the index file on re-listing', () => {
    const dir = freshDir()
    upsertNote(dir, posting({ salaryMin: 68_000, salaryMax: 75_000 }), 'a')
    upsertNote(dir, posting({ nativeId: '2', slug: 'cut-one', title: 'Platform Engineer' }), 'b')
    setStatus(dir, 'cut-one', 'cut', { cutReason: 'ethics' })

    const content = renderIndex(dir)
    expect(content).toContain('## new (1)')
    expect(content).toContain('## cut (1)')
    expect(content).toContain('| ⭐ | Company | Role | Mode | Salary | Note | |')
    expect(content).toContain('✂️ ethics')
    expect(content).toContain('68000–75000')
    expect(readFileSync(join(dir, '_index.md'), 'utf-8')).toBe(content)
    // _index.md must not be picked up as a note
    expect(listNotes(dir)).toHaveLength(2)
  })

  it('renders a resolved logo inline in the company cell', () => {
    const dir = freshDir()
    upsertNote(
      dir,
      posting({ slug: 'logo-one', logo: 'https://icons.duckduckgo.com/ip3/acme.com.ico' }),
      '',
    )
    expect(renderIndex(dir)).toContain(
      '<img src="https://icons.duckduckgo.com/ip3/acme.com.ico" width="16"> Acme GmbH',
    )
  })

  it('writes daily inbox files and links unranked days from the index', () => {
    const dir = freshDir()
    upsertNote(dir, posting({ slug: 'today-one', title: 'Role One', discoveredAt: '2026-08-24' }), '')
    upsertNote(
      dir,
      posting({ nativeId: '2', slug: 'today-two', title: 'Role Two', discoveredAt: '2026-08-24' }),
      '',
    )
    upsertNote(
      dir,
      posting({ nativeId: '3', slug: 'older', title: 'Role Three', discoveredAt: '2026-08-20' }),
      '',
    )
    updateNote(dir, 'today-two', { score: 77 })

    const content = renderIndex(dir)
    expect(content).toContain('📥 **2 unranked** → [[inbox/2026-08-24]] [[inbox/2026-08-20]]')

    const today = readFileSync(join(dir, 'inbox', '2026-08-24.md'), 'utf-8')
    expect(today).toContain('# 📥 Inbox 2026-08-24')
    expect(today).toContain('2 arrived — **1 still unranked**')
    // ranked first
    expect(today.indexOf('today-two')).toBeLessThan(today.indexOf('today-one'))
    expect(readFileSync(join(dir, 'inbox', '2026-08-20.md'), 'utf-8')).toContain('older')

    // scoring processes the inbox: header disappears once everything is ranked
    updateNote(dir, 'today-one', { score: 40 })
    updateNote(dir, 'older', { score: 10 })
    expect(renderIndex(dir)).not.toContain('📥')
    expect(readFileSync(join(dir, 'inbox', '2026-08-24.md'), 'utf-8')).toContain('all judged')
  })

  it('buckets new/shortlist by placement and ranks by score', () => {
    const dir = freshDir()
    upsertNote(dir, posting({ slug: 'remote-a', nativeId: 'r1', title: 'Remote Role', workMode: 'remote' }), '')
    upsertNote(
      dir,
      posting({ slug: 'koeln-a', nativeId: 'k1', title: 'Koeln Role A', workMode: 'hybrid', location: 'Cologne, Germany' }),
      '',
    )
    upsertNote(
      dir,
      posting({ slug: 'koeln-b', nativeId: 'k2', title: 'Koeln Role B', workMode: null, location: 'Köln' }),
      '',
    )
    upsertNote(
      dir,
      posting({ slug: 'elsewhere', nativeId: 'e1', title: 'Hamburg Role', workMode: 'onsite', location: 'Hamburg' }),
      '',
    )
    updateNote(dir, 'koeln-b', { score: 90 })
    updateNote(dir, 'koeln-a', { score: 40 })

    const content = renderIndex(dir, ['Köln'])
    const remote = content.indexOf('### Remote (1)')
    const koeln = content.indexOf('### Köln (2)')
    const other = content.indexOf('### Other (1)')
    expect(remote).toBeGreaterThan(-1)
    expect(koeln).toBeGreaterThan(remote)
    expect(other).toBeGreaterThan(koeln)
    // score-ranked inside the bucket: 90 before 40
    expect(content.indexOf('koeln-b')).toBeLessThan(content.indexOf('koeln-a'))
    expect(content).toContain('⭐ 90')
    // without cities the section stays flat
    expect(renderIndex(dir)).not.toContain('### ')
  })
})
