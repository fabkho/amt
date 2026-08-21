import type { CvData, CvLink } from '../cv-data.js'
import {
  createTemplateEnv,
  defaultTemplatesDir,
  loadLabels,
  type Lang,
} from './templates.js'

/** Per-application header overrides — the successor of configs/<job>.yaml. */
export interface CvRenderConfig {
  email: string
  phone: string
  location: string
  /** Language line, e.g. "German (native) · English (fluent)". Empty hides it. */
  languages?: string
  /** Header bottom rule. */
  border?: boolean
  /** Overrides the person-level links from cv-data when set. */
  links?: CvLink[]
}

export interface RenderOptions {
  templatesDir?: string
}

export function renderCvHtml(
  data: CvData,
  config: CvRenderConfig,
  lang: Lang,
  options: RenderOptions = {},
): string {
  const templatesDir = options.templatesDir ?? defaultTemplatesDir()
  const env = createTemplateEnv(templatesDir)
  const labels = loadLabels(lang, templatesDir)
  return env.render('cv.njk', {
    ...data,
    border: true,
    ...config,
    // an empty profile links array must not shadow the cv-data links
    links: config.links?.length ? config.links : data.links ?? [],
    labels,
  })
}
