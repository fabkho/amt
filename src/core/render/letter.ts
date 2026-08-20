import { AmtError } from '../errors.js'
import {
  createTemplateEnv,
  defaultTemplatesDir,
  loadLabels,
  type Lang,
} from './templates.js'
import type { RenderOptions } from './cv.js'

/**
 * The editable source of a cover letter is a plain markdown file:
 *
 *   Subject: <role>            (or "Betreff:")
 *   Hi,                        (salutation)
 *   <paragraphs, blank-line separated>
 *   Best regards               (closing)
 *   <name>                     (signature)
 */
export interface LetterModel {
  subject: string
  salutation: string
  paragraphs: string[]
  closing: string
  signature: string
}

export interface LetterIdentity {
  name: string
  role: string
  email: string
  phone: string
  location: string
}

export function parseLetterMarkdown(markdown: string): LetterModel {
  const blocks = markdown
    .trim()
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)

  if (blocks.length < 4) {
    throw new AmtError(
      'LETTER_INVALID',
      'A letter needs at least subject, salutation, one paragraph, and a sign-off block.',
    )
  }

  const [subject, salutation] = blocks as [string, string, ...string[]]
  if (!/^(subject|betreff):/i.test(subject)) {
    throw new AmtError(
      'LETTER_INVALID',
      `The first line must start with "Subject:" or "Betreff:", got: ${subject.slice(0, 40)}`,
    )
  }

  const signoffLines = blocks[blocks.length - 1]!.split('\n').map(l => l.trim())
  const [closing = '', ...signatureLines] = signoffLines

  return {
    subject,
    salutation,
    paragraphs: blocks.slice(2, -1),
    closing,
    signature: signatureLines.join(' '),
  }
}

/** Rebuilds the canonical text form — used for the .txt upload variant. */
export function letterToText(model: LetterModel): string {
  return [
    model.subject,
    model.salutation,
    ...model.paragraphs,
    `${model.closing}\n${model.signature}`,
  ].join('\n\n') + '\n'
}

export function renderLetterHtml(
  model: LetterModel,
  identity: LetterIdentity,
  lang: Lang,
  options: RenderOptions = {},
): string {
  const templatesDir = options.templatesDir ?? defaultTemplatesDir()
  const env = createTemplateEnv(templatesDir)
  const labels = loadLabels(lang, templatesDir)
  return env.render('letter.njk', {
    personal: { name: identity.name, role: identity.role },
    email: identity.email,
    phone: identity.phone,
    location: identity.location,
    letter: model,
    labels,
  })
}
