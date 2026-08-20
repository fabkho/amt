import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import nunjucks from 'nunjucks'
import { parse } from 'yaml'
import { z } from 'zod'
import { AmtError } from '../errors.js'

export type Lang = 'de' | 'en'

const labelsSchema = z.object({
  lang: z.string(),
  docTitle: z.string(),
  letterTitle: z.string(),
  page: z.string(),
  profile: z.string(),
  experience: z.string(),
  education: z.string(),
  skills: z.string(),
  projects: z.string(),
})

export type Labels = z.infer<typeof labelsSchema>

/**
 * The shipped templates live next to the package root. This module is bundled
 * into dist/ at runtime but imported from src/ under vitest, so both depths
 * are probed.
 */
export function defaultTemplatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  for (const levels of ['..', '../..', '../../..']) {
    const candidate = join(here, levels, 'templates')
    if (existsSync(join(candidate, 'cv.njk'))) return candidate
  }
  throw new AmtError(
    'TEMPLATES_NOT_FOUND',
    `No templates directory found relative to ${here}`,
  )
}

export function createTemplateEnv(templatesDir: string): nunjucks.Environment {
  // autoescape is off on purpose: CV bullets and labels carry trusted inline
  // HTML from the user's own data files.
  return new nunjucks.Environment(
    new nunjucks.FileSystemLoader(templatesDir),
    { autoescape: false },
  )
}

export function loadLabels(lang: Lang, templatesDir: string): Labels {
  const path = join(templatesDir, `labels.${lang}.yaml`)
  if (!existsSync(path)) {
    throw new AmtError('LABELS_NOT_FOUND', `No labels file at ${path}`)
  }
  return labelsSchema.parse(parse(readFileSync(path, 'utf-8')))
}
