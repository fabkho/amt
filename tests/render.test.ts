import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import {
  chromiumInstalled,
  htmlToPdf,
  letterToText,
  loadCvData,
  parseLetterMarkdown,
  renderCvHtml,
  renderLetterHtml,
  type LetterIdentity,
} from '../src/index.js'

const cvYaml = readFileSync(join(import.meta.dirname, 'fixtures/cv-data.en.yaml'), 'utf-8')
const letterMd = readFileSync(join(import.meta.dirname, 'fixtures/letter.en.md'), 'utf-8')

const identity: LetterIdentity = {
  name: 'Jane Doe',
  role: 'Senior Software Engineer',
  email: 'jane@example.com',
  phone: '+49 000 0000000',
  location: 'Berlin, Germany',
}

const cvConfig = {
  email: 'jane@example.com',
  phone: '+49 000 0000000',
  location: 'Berlin, Germany',
  languages: 'German (native) · English (fluent)',
}

describe('cv data', () => {
  it('parses and validates the fixture', () => {
    const data = loadCvData(cvYaml)
    expect(data.personal.name).toBe('Jane Doe')
    expect(data.experience).toHaveLength(2)
  })

  it('rejects invalid data with a coded error', () => {
    expect(() => loadCvData('personal: {}')).toThrowError(/CV data|expected/i)
  })
})

describe('letter markdown', () => {
  it('parses subject, salutation, paragraphs, and sign-off', () => {
    const model = parseLetterMarkdown(letterMd)
    expect(model.subject).toBe('Subject: Senior Software Engineer')
    expect(model.salutation).toBe('Hi,')
    expect(model.paragraphs).toHaveLength(3)
    expect(model.closing).toBe('Best regards')
    expect(model.signature).toBe('Jane Doe')
  })

  it('round-trips through letterToText', () => {
    const model = parseLetterMarkdown(letterMd)
    expect(letterToText(model)).toBe(letterMd)
  })

  it('rejects letters without a subject line', () => {
    expect(() => parseLetterMarkdown('Hi,\n\nText.\n\nMore.\n\nBye\nJane'))
      .toThrowError(/Subject/)
  })
})

describe('cv html', () => {
  const data = loadCvData(cvYaml)

  it('renders English labels and the page-counter footer', () => {
    const html = renderCvHtml(data, cvConfig, 'en')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<h2>Experience</h2>')
    expect(html).toContain('"Jane Doe · Page " counter(page) " / " counter(pages)')
    expect(html).toContain('github.com/janedoe')
    expect(html).toContain('<b>Migration:</b>')
  })

  it('renders German labels from the same template', () => {
    const html = renderCvHtml(data, cvConfig, 'de')
    expect(html).toContain('<html lang="de">')
    expect(html).toContain('<h2>Berufserfahrung</h2>')
    expect(html).toContain('Seite')
  })

  it('hides the languages span when empty', () => {
    const html = renderCvHtml(data, { ...cvConfig, languages: '' }, 'en')
    expect(html).not.toContain('German (native)')
  })
})

describe('letter html', () => {
  it('renders header, subject, and paragraphs', () => {
    const model = parseLetterMarkdown(letterMd)
    const html = renderLetterHtml(model, identity, 'en')
    expect(html).toContain('<h1>Jane Doe</h1>')
    expect(html).toContain('Subject: Senior Software Engineer')
    expect(html).toContain('Best regards<br>Jane Doe')
    expect((html.match(/<p>/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})

describe('pdf rendering', async () => {
  const hasChromium = await chromiumInstalled()

  it.skipIf(!hasChromium)('produces a PDF from CV html', async () => {
    const data = loadCvData(cvYaml)
    const html = renderCvHtml(data, cvConfig, 'en')
    const out = join(mkdtempSync(join(tmpdir(), 'job-kit-')), 'cv.pdf')
    await htmlToPdf(html, out)
    const bytes = readFileSync(out)
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(10_000)
  }, 30_000)
})
