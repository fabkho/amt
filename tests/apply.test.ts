import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  applyToJob,
  loadProfile,
  profileSchema,
  upsertNote,
  type Profile,
} from '../src/index.js'

async function setup(): Promise<{ profile: Profile; slug: string }> {
  const root = mkdtempSync(join(tmpdir(), 'job-kit-apply-'))
  const notesDir = join(root, 'notes')
  const outputBase = join(root, 'out')
  const cvDataDir = join(root, 'cv')
  cpSync(
    join(import.meta.dirname, 'fixtures/cv-data.en.yaml'),
    join(cvDataDir, 'cv-data.en.yaml'),
    { recursive: true },
  )

  const base = await loadProfile(join(import.meta.dirname, 'fixtures/profile-home'))
  const profile = profileSchema.parse({
    ...base,
    paths: { notesDir, outputBase, cvDataDir },
  })

  upsertNote(
    notesDir,
    {
      company: 'Acme GmbH',
      slug: 'acme-senior-frontend',
      title: 'Senior Frontend Engineer',
      url: 'https://example.com/jobs/1',
      source: 'manual',
      nativeId: '1',
      discoveredAt: '2026-08-20',
    },
    'A great job.',
  )
  return { profile, slug: 'acme-senior-frontend' }
}

describe('applyToJob', () => {
  it('materializes snapshot, cv html, and a scaffolded letter', async () => {
    const { profile, slug } = await setup()
    const result = await applyToJob(profile, slug, { pdf: false, lang: 'en' })

    expect(result.letterScaffolded).toBe(true)
    expect(existsSync(join(result.folder, 'job.yaml'))).toBe(true)
    expect(existsSync(join(result.folder, 'cv.en.html'))).toBe(true)
    const letterMd = readFileSync(join(result.folder, 'cover-letter.en.md'), 'utf-8')
    expect(letterMd).toContain('Subject: Senior Frontend Engineer')
    expect(letterMd).toContain('Hi,')

    // the language choice is remembered on the note
    const second = await applyToJob(profile, slug, { pdf: false })
    expect(second.lang).toBe('en')
    expect(second.letterScaffolded).toBe(false)
  })

  it('renders the edited letter into txt and html', async () => {
    const { profile, slug } = await setup()
    const first = await applyToJob(profile, slug, { pdf: false, lang: 'en' })
    writeFileSync(
      join(first.folder, 'cover-letter.en.md'),
      'Subject: Senior Frontend Engineer\n\nHi,\n\nI would love to join.\n\nBest regards\nJane Doe\n',
    )
    const second = await applyToJob(profile, slug, { pdf: false })
    const txt = readFileSync(join(second.folder, 'cover-letter.en.txt'), 'utf-8')
    const html = readFileSync(join(second.folder, 'cover-letter.en.html'), 'utf-8')
    expect(txt).toContain('I would love to join.')
    expect(html).toContain('<p>I would love to join.</p>')
    expect(html).toContain('<h1>Jane Doe</h1>')
  })
})
