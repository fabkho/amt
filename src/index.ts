// Public API of job-kit. The MCP server and the pi wrapper import only from
// here — this curated export list is the contract between core and its
// presentation layers. Never deep-import from core modules elsewhere.

export { JobKitError, toErrorMessage } from './core/errors.js'
export { cvDataSchema, loadCvData } from './core/cv-data.js'
export type { CvData, CvLink } from './core/cv-data.js'
export {
  defaultTemplatesDir,
  loadLabels,
} from './core/render/templates.js'
export type { Labels, Lang } from './core/render/templates.js'
export { renderCvHtml } from './core/render/cv.js'
export type { CvRenderConfig, RenderOptions } from './core/render/cv.js'
export {
  letterToText,
  parseLetterMarkdown,
  renderLetterHtml,
} from './core/render/letter.js'
export type { LetterIdentity, LetterModel } from './core/render/letter.js'
export {
  chromiumInstalled,
  htmlToPdf,
  installChromium,
} from './core/render/pdf.js'
