import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { AmtError } from './errors.js'
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

export interface PrepareOptions {
  lang?: Lang
  /** Skip PDF generation (tests, machines without Chromium). */
  pdf?: boolean
  templatesDir?: string
}

export interface PrepareResult {
  folder: string
  lang: Lang
  letterScaffolded: boolean
  /** True while the letter still contains the scaffold placeholder — txt/html/pdf are held back. */
  letterIsPlaceholder: boolean
  files: string[]
  /** What to do now — surfaced verbatim by the CLI and MCP layers. */
  next: string
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

const PLACEHOLDER = '<!-- draft your paragraphs here'

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
export async function prepareApplication(
  profile: Profile,
  slug: string,
  options: PrepareOptions = {},
): Promise<PrepareResult> {
  const { note, body } = readNote(profile.paths.notesDir, slug)
  const lang = options.lang ?? (note.application?.lang as Lang | undefined) ?? 'en'
  const pdf = options.pdf ?? true

  const folder = join(profile.paths.outputBase, slug)
  mkdirSync(folder, { recursive: true })
  const files: string[] = []
  const track = (path: string): string => {
    files.push(path)
    return path
  }

  writeFileSync(track(join(folder, 'job.yaml')), stringify(note))

  // CV
  if (!profile.paths.cvDataDir) {
    throw new AmtError(
      'CV_DATA_MISSING',
      'profile.paths.cvDataDir is unset — load the profile via loadProfile(), which defaults it to AMT_HOME.',
    )
  }
  const cvDataPath = join(profile.paths.cvDataDir, `cv-data.${lang}.yaml`)
  if (!existsSync(cvDataPath)) {
    throw new AmtError(
      'CV_DATA_MISSING',
      `No CV data for "${lang}" — create ${cvDataPath} (see the schema in the amt README; \`amt doctor\` lists which languages exist).`,
    )
  }
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
  const letterMd = readFileSync(letterMdPath, 'utf-8')
  // Never render the scaffold placeholder into uploadable files — a txt
  // containing "draft your paragraphs here" must not exist.
  const letterIsPlaceholder = letterMd.includes(PLACEHOLDER)
  if (!letterIsPlaceholder) {
    const letter = parseLetterMarkdown(letterMd)
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
  }

  note.application = {
    folder,
    lang,
    appliedAt: note.application?.appliedAt ?? null,
  }
  writeNote(profile.paths.notesDir, note, body)

  const next = letterIsPlaceholder
    ? `Draft the letter in ${letterMdPath}, then re-run prepare (\`amt prepare\` / prepare_application) to render txt/html/pdf.`
    : `Letter rendered. After submitting, mark it: \`amt status ${slug} applied\` / set_job_status with status "applied".`
  return { folder, lang, letterScaffolded, letterIsPlaceholder, files, next }
}
