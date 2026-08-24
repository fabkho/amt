// Public API of amt. The MCP server and the pi wrapper import only from
// here — this curated export list is the contract between core and its
// presentation layers. Never deep-import from core modules elsewhere.

export { AmtError, toErrorMessage } from './core/errors.js'
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
  inboxNotes,
  JOB_STATUSES,
  jobNoteSchema,
  listNotes,
  findProbableDuplicates,
  notesForCompany,
  readNote,
  placeMatches,
  placement,
  renderIndex,
  setStatus,
  slugify,
  unrankedNotes,
  updateNote,
  upsertNote,
} from './core/notes.js'
export { forgetSeen, loadSeen } from './core/seen.js'
export type {
  CutReason,
  JobNote,
  NoteUpdate,
  JobNoteInput,
  JobStatus,
  StoredNote,
  UpsertResult,
} from './core/notes.js'
export {
  applyHardFilters,
  extractYearsRequired,
  isFresh,
  isRelevant,
} from './core/match.js'
export type { MatchResult } from './core/match.js'
export { crawl } from './core/crawl.js'
export type { CrawlSummary } from './core/crawl.js'
export { importPostingFromUrl, manualPosting, parsePostingUrl } from './core/import-url.js'
export type { ManualFields, ParsedPostingUrl } from './core/import-url.js'
export { prepareApplication } from './core/prepare.js'
export type { PrepareOptions, PrepareResult } from './core/prepare.js'
export { resolveCompanyLogo } from './core/sources/logo.js'
export {
  addCompany,
  discoverCompany,
  loadSources,
  removeChannel,
  removeCompany,
  saveSources,
  slugCandidates,
  sourcesSchema,
  tryAutoTrack,
  upsertChannel,
} from './core/sources-store.js'
export type { AddCompanyResult, ChannelCrawl, ChannelSource, CompanySource, DiscoveryResult, Sources } from './core/sources-store.js'
export { channelDetailFetcher, fetchChannel, isCrawlableChannel } from './core/sources/channel.js'
export { getAdapter, listAdapters } from './core/sources/index.js'
export { defaultHttpClient } from './core/sources/http.js'
export {
  htmlToMarkdown,
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
