import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { loadCvData } from './cv-data.js'
import { readNote, writeNote } from './notes.js'
import type { Profile } from './profile.js'
import { renderCvHtml, type CvRenderConfig } from './render/cv.js'
import {
  letterToText,
  parseLetterMarkdown,
  renderLetterHtml,
  type LetterIdentity,
} from './render/letter.js'
import { htmlToPdf } from './render/pdf.js'
import type { Lang } from './render/templates.js'

export interface ApplyOptions {
  lang?: Lang
  /** Skip PDF generation (tests, machines without Chromium). */
  pdf?: boolean
  templatesDir?: string
}

export interface ApplyResult {
  folder: string
  lang: Lang
  letterScaffolded: boolean
  files: string[]
}

function underscored(name: string): string {
  return name.replace(/\s+/g, '_')
}

function cvConfigFromProfile(profile: Profile, lang: Lang): CvRenderConfig {
  const { identity } = profile
  return {
    email: identity.email,
    phone: identity.phone,
    location: identity.location[lang],
    languages: identity.languagesLine?.[lang] ?? '',
    border: true,
    links: identity.links,
  }
}

function scaffoldLetter(profile: Profile, title: string, lang: Lang): string {
  const subjectPrefix = lang === 'de' ? 'Betreff' : 'Subject'
  return [
    `${subjectPrefix}: ${title}`,
    '',
    profile.tone.salutation[lang],
    '',
    '<!-- draft your paragraphs here, blank-line separated -->',
    '',
    profile.tone.closing[lang],
    profile.identity.name,
    '',
  ].join('\n')
}

/**
 * Materializes the application folder for a job note: frozen job snapshot,
 * CV (html + pdf), and the cover letter pipeline around the editable
 * cover-letter.<lang>.md. Safe to re-run after every letter edit.
 */
export async function applyToJob(
  profile: Profile,
  slug: string,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const lang = options.lang ?? readNote(profile.paths.notesDir, slug).note.application?.lang as Lang | undefined ?? 'en'
  const pdf = options.pdf ?? true
  const { note, body } = readNote(profile.paths.notesDir, slug)

  const folder = join(profile.paths.outputBase, slug)
  mkdirSync(folder, { recursive: true })
  const files: string[] = []
  const track = (path: string): string => {
    files.push(path)
    return path
  }

  writeFileSync(track(join(folder, 'job.yaml')), stringify(note))

  // CV
  const cvDataPath = join(profile.paths.cvDataDir ?? '', `cv-data.${lang}.yaml`)
  const cvData = loadCvData(readFileSync(cvDataPath, 'utf-8'))
  const cvConfig = cvConfigFromProfile(profile, lang)
  const cvHtml = renderCvHtml(cvData, cvConfig, lang, { templatesDir: options.templatesDir })
  writeFileSync(track(join(folder, `cv.${lang}.html`)), cvHtml)
  writeFileSync(track(join(folder, 'config.yaml')), stringify({ lang, ...cvConfig }))
  if (pdf) {
    await htmlToPdf(cvHtml, track(join(folder, `CV_${underscored(profile.identity.name)}.pdf`)))
  }

  // Cover letter
  const letterMdPath = join(folder, `cover-letter.${lang}.md`)
  let letterScaffolded = false
  if (!existsSync(letterMdPath)) {
    writeFileSync(letterMdPath, scaffoldLetter(profile, note.title, lang))
    letterScaffolded = true
  }
  track(letterMdPath)
  const letter = parseLetterMarkdown(readFileSync(letterMdPath, 'utf-8'))
  const identity: LetterIdentity = {
    name: profile.identity.name,
    role: profile.identity.role[lang],
    email: profile.identity.email,
    phone: profile.identity.phone,
    location: profile.identity.location[lang],
  }
  writeFileSync(track(join(folder, `cover-letter.${lang}.txt`)), letterToText(letter))
  const letterHtml = renderLetterHtml(letter, identity, lang, { templatesDir: options.templatesDir })
  writeFileSync(track(join(folder, `cover-letter.${lang}.html`)), letterHtml)
  if (pdf) {
    await htmlToPdf(
      letterHtml,
      track(join(folder, `Cover_Letter_${underscored(profile.identity.name)}.pdf`)),
    )
  }

  note.application = {
    folder,
    lang,
    appliedAt: note.application?.appliedAt ?? null,
  }
  writeNote(profile.paths.notesDir, note, body)

  return { folder, lang, letterScaffolded, files }
}
