// Public API of job-kit. The MCP server and the pi wrapper import only from
// here — this curated export list is the contract between core and its
// presentation layers. Never deep-import from core modules elsewhere.

export { JobKitError, toErrorMessage } from './core/errors.js'
export {
  expandPath,
  loadProfile,
  profileSchema,
  resolveHome,
} from './core/profile.js'
export type { Profile, ProfileInput } from './core/profile.js'
export {
  CUT_REASONS,
  dedupeKey,
  JOB_STATUSES,
  jobNoteSchema,
  listNotes,
  readNote,
  renderIndex,
  setStatus,
  slugify,
  upsertNote,
  writeNote,
} from './core/notes.js'
export type {
  CutReason,
  JobNote,
  JobNoteInput,
  JobStatus,
  StoredNote,
  UpsertResult,
} from './core/notes.js'
export {
  applyHardFilters,
  extractYearsRequired,
  isFresh,
} from './core/match.js'
export type { MatchResult } from './core/match.js'
export { crawl } from './core/crawl.js'
export type { CrawlSummary } from './core/crawl.js'
export { importPostingFromUrl, parsePostingUrl } from './core/import-url.js'
export type { ParsedPostingUrl } from './core/import-url.js'
export { applyToJob } from './core/apply.js'
export type { ApplyOptions, ApplyResult } from './core/apply.js'
export {
  addCompany,
  discoverCompany,
  loadSources,
  removeCompany,
  saveSources,
  slugCandidates,
  sourcesSchema,
  tryAutoTrack,
} from './core/sources-store.js'
export type { CompanySource, DiscoveryResult, Sources } from './core/sources-store.js'
export { getAdapter, listAdapters } from './core/sources/index.js'
export { defaultHttpClient } from './core/sources/http.js'
export {
  postingToNoteInput,
  toIsoDate,
  unescapeHtml,
  workModeFromFlags,
} from './core/sources/normalize.js'
export type {
  HttpClient,
  JobPosting,
  SourceAdapter,
} from './core/sources/types.js'
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
