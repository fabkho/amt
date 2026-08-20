import { createRequire } from 'node:module'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  prepareApplication,
  crawl,
  defaultHttpClient,
  importPostingFromUrl,
  manualPosting,
  JOB_STATUSES,
  AmtError,
  listNotes,
  notesForCompany,
  loadProfile,
  loadSources,
  addCompany,
  removeCompany,
  postingToNoteInput,
  readNote,
  renderIndex,
  resolveHome,
  setStatus,
  updateNote,
  htmlToMarkdown,
  toErrorMessage,
  tryAutoTrack,
  upsertNote,
  CUT_REASONS,
  type CutReason,
  type JobStatus,
  type Lang,
  type Profile,
} from '../index.js'

const require = createRequire(import.meta.url)

// Bundled, this module sits in dist/ (one level below the package root);
// under vitest it is imported from src/mcp/ (two levels). Probe both.
function readVersion(): string {
  for (const candidate of ['../package.json', '../../package.json']) {
    try {
      return (require(candidate) as { version: string }).version
    } catch {
      // keep probing
    }
  }
  return '0.0.0'
}
const version = readVersion()


function jsonContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function toolErrorResponse(doing: string, error: unknown) {
  const code = error instanceof AmtError ? error.code : 'UNEXPECTED'
  return {
    content: [
      {
        type: 'text' as const,
        text: `[${code}] Error ${doing}: ${toErrorMessage(error)}`,
      },
    ],
    isError: true,
  }
}

/** Renders profile context for LLM-facing prompts. Never includes secrets. */
function buildProfileSection(profile: Profile): string {
  const { search, tone } = profile
  return [
    'CANDIDATE PROFILE',
    `Primary stacks: ${search.stacksPrimary.join(', ')}`,
    `Secondary stacks: ${search.stacksSecondary.join(', ') || '—'}`,
    `Salary: floor ${search.salaryFloor}${search.salaryTarget ? `, target ${search.salaryTarget}` : ''}`,
    `Seniority: ${search.seniority.join(', ')}`,
    `Locations: remote ${search.locations.remote ? 'yes' : 'no'}; cities: ${search.locations.cities.map(c => `${c.name} (≥${c.minHomeOfficeDays} HO days)`).join(', ') || '—'}`,
    `Company types to reject (agent-judged — no deterministic check exists): ${search.companyTypesBlocked.join(', ') || '—'}`,
    '',
    'TONE RULES (cover letters)',
    ...tone.rules.map(r => `- ${r}`),
    ...(tone.languageRule ? ['', `LANGUAGE RULE: ${tone.languageRule}`] : []),
  ].join('\n')
}

const today = (): string => new Date().toISOString().slice(0, 10)

export function createServer(): McpServer {
  const server = new McpServer({ name: 'amt-mcp', version })

  // ─── Tool: discover ────────────────────────────────────────────

  server.registerTool(
    'discover',
    {
      title: 'Discover amt Setup',
      description:
        'Discover the amt environment: home directory, profile summary, configured sources '
        + '(boards, tracked companies, agent channels with their recipes), and job-note counts by '
        + 'status. Call this first to understand the setup before using other tools.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const home = resolveHome()
        const sources = loadSources(home)
        let profileSummary: unknown = null
        let noteCounts: Record<string, number> = {}
        try {
          const profile = await loadProfile(home)
          profileSummary = {
            name: profile.identity.name,
            notesDir: profile.paths.notesDir,
            outputBase: profile.paths.outputBase,
            autoTrackCompanies: profile.search.autoTrackCompanies,
          }
          noteCounts = Object.fromEntries(
            JOB_STATUSES.map(status => [
              status,
              listNotes(profile.paths.notesDir, { status: [status] }).length,
            ]),
          )
        } catch (error) {
          profileSummary = { missing: toErrorMessage(error) }
        }
        return jsonContent({
          name: 'amt',
          version,
          home,
          profile: profileSummary,
          sources,
          noteCounts,
        })
      } catch (error) {
        return toolErrorResponse('discovering the setup', error)
      }
    },
  )

  // ─── Tool: crawl_jobs ──────────────────────────────────────────

  server.registerTool(
    'crawl_jobs',
    {
      title: 'Crawl Job Sources',
      description:
        'Fetch every configured board and tracked company. Notes are created only for stack-relevant '
        + 'postings that pass the hard filters; everything else lands in the seen-ledger and never '
        + 'surfaces again. Summary counters: filtered = failed a hard rule, offStack = no stack '
        + 'keyword matched, known = already judged in an earlier crawl, stale = board find older than '
        + 'maxAgeDays. Agent channels are not executed here — run those '
        + 'yourself and feed findings via import_job.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false },
    },
    async () => {
      try {
        const home = resolveHome()
        const profile = await loadProfile(home)
        const sources = loadSources(home)
        const summary = await crawl(defaultHttpClient, home, profile, sources)
        return jsonContent(summary)
      } catch (error) {
        return toolErrorResponse('crawling job sources', error)
      }
    },
  )

  // ─── Tool: import_job ──────────────────────────────────────────

  server.registerTool(
    'import_job',
    {
      title: 'Import Job Posting',
      description:
        'Import a posting into the job notes. Pass an ATS URL (recruitee/ashby/greenhouse/lever/'
        + 'personio/smartrecruiters) to resolve it automatically, or pass explicit fields for sources the tool '
        + 'cannot fetch (LinkedIn, StepStone, agent channels). Auto-tracks the company when enabled '
        + '("tracked" = the ats:slug just added, or null when disabled, already tracked, or not '
        + 'discoverable). Dedupe hits return the existing note\'s "status" — never re-pitch a note '
        + 'that is cut, rejected, or applied. "companyHistory" lists other notes at this company: '
        + 'warn the user before a possible duplicate application; a different role is fine.',
      inputSchema: z.object({
        url: z.string().describe('Posting URL — ATS URLs resolve automatically.'),
        manual: z
          .object({
            company: z.string(),
            title: z.string(),
            descriptionHtml: z.string().optional(),
            location: z.string().optional(),
            workMode: z.enum(['remote', 'hybrid', 'onsite']).optional(),
            salaryMin: z.number().optional(),
            salaryMax: z.number().optional(),
            publishedAt: z.string().optional(),
          })
          .optional()
          .describe('Explicit fields for non-ATS URLs. Required when the URL is not a known ATS.'),
      }),
      annotations: { readOnlyHint: false },
    },
    async ({ url, manual }) => {
      try {
        const home = resolveHome()
        const profile = await loadProfile(home)
        let company: string
        let body: string
        let result
        if (manual) {
          const posting = manualPosting(url, manual)
          company = posting.company
          body = posting.descriptionHtml ? htmlToMarkdown(posting.descriptionHtml) : ''
          result = upsertNote(profile.paths.notesDir, postingToNoteInput(posting, today()), body)
        } else {
          const imported = await importPostingFromUrl(defaultHttpClient, url)
          company = imported.posting.company
          body = imported.posting.descriptionHtml ? htmlToMarkdown(imported.posting.descriptionHtml) : ''
          result = upsertNote(
            profile.paths.notesDir,
            postingToNoteInput(imported.posting, today()),
            body,
          )
        }
        const tracked = await tryAutoTrack(
          defaultHttpClient,
          home,
          profile.search.autoTrackCompanies,
          company,
        )
        // Dedupe hits surface the existing status so a cut/applied note is
        // never re-pitched by an agent re-running its channels.
        const { note } = readNote(profile.paths.notesDir, result.slug)
        // Context, not a blocker: a different role at the same company (or a
        // changed offer) is a legitimate second application.
        const companyHistory = notesForCompany(profile.paths.notesDir, note.company, result.slug)
        renderIndex(profile.paths.notesDir)
        return jsonContent({ ...result, status: note.status, tracked, companyHistory })
      } catch (error) {
        return toolErrorResponse('importing the posting', error)
      }
    },
  )

  // ─── Tool: list_jobs ───────────────────────────────────────────

  server.registerTool(
    'list_jobs',
    {
      title: 'List Job Notes',
      description:
        'List job notes with their status, score, and key facts. Filter by status to find e.g. all '
        + 'new candidates (status "new") or the shortlist.',
      inputSchema: z.object({
        status: z.array(z.enum(JOB_STATUSES)).optional().describe('Only these statuses.'),
      }),
    },
    async ({ status }) => {
      try {
        const profile = await loadProfile(resolveHome())
        const notes = listNotes(profile.paths.notesDir, { status })
        return jsonContent(notes.map(n => n.note))
      } catch (error) {
        return toolErrorResponse('listing job notes', error)
      }
    },
  )

  // ─── Tool: get_job ─────────────────────────────────────────────

  server.registerTool(
    'get_job',
    {
      title: 'Get Job Note',
      description: 'Read one job note including the full description body.',
      inputSchema: z.object({ slug: z.string() }),
    },
    async ({ slug }) => {
      try {
        const profile = await loadProfile(resolveHome())
        const stored = readNote(profile.paths.notesDir, slug)
        return jsonContent(stored)
      } catch (error) {
        return toolErrorResponse('reading the job note', error)
      }
    },
  )

  // ─── Tool: set_job_status ──────────────────────────────────────

  server.registerTool(
    'set_job_status',
    {
      title: 'Set Job Status',
      description:
        'Set the status of a job note and persist the judgment behind it: score (0-100), flags, and '
        + 'an assessment text stored under "## Assessment" in the note body. Cutting requires '
        + 'cutReason. Shortlisting auto-tracks the company ATS when the profile allows it '
        + '("tracked" = the ats:slug just added, or null).',
      inputSchema: z.object({
        slug: z.string(),
        status: z.enum(JOB_STATUSES),
        cutReason: z.enum(CUT_REASONS).optional(),
        cutNote: z.string().optional(),
        score: z.number().int().min(0).max(100).optional()
          .describe('Fit score 0-100 — persist it so the next session can sort on it.'),
        flags: z.array(z.string()).optional(),
        assessment: z.string().optional()
          .describe('Your reasoning — written into the note under "## Assessment".'),
      }),
      annotations: { readOnlyHint: false },
    },
    async ({ slug, status, cutReason, cutNote, score, flags, assessment }) => {
      try {
        const home = resolveHome()
        const profile = await loadProfile(home)
        const note = setStatus(profile.paths.notesDir, slug, status as JobStatus, {
          cutReason: cutReason as CutReason | undefined,
          cutNote,
        })
        if (score !== undefined || flags !== undefined || assessment !== undefined) {
          updateNote(profile.paths.notesDir, slug, { score, flags, assessment })
        }
        const tracked = await tryAutoTrack(
          defaultHttpClient,
          home,
          status === 'shortlist' && profile.search.autoTrackCompanies,
          note.company,
        )
        renderIndex(profile.paths.notesDir)
        return jsonContent({ slug: note.slug, status: note.status, score: score ?? note.score, tracked })
      } catch (error) {
        return toolErrorResponse('setting the job status', error)
      }
    },
  )

  // ─── Tools: sources ────────────────────────────────────────────

  server.registerTool(
    'add_source',
    {
      title: 'Track Company',
      description:
        'Start tracking a company: probes the known ATS API patterns (recruitee, ashby, greenhouse, '
        + 'lever, personio, smartrecruiters) to discover where it hosts its '
        + 'jobs, then adds it to sources.yaml. Use when the user names companies to watch.',
      inputSchema: z.object({ company: z.string() }),
      annotations: { readOnlyHint: false },
    },
    async ({ company }) => {
      try {
        const result = await addCompany(defaultHttpClient, resolveHome(), company)
        return jsonContent({
          name: result.name,
          ats: result.ats,
          slug: result.slug,
          openPostings: result.postings.length,
          alreadyTracked: result.alreadyTracked,
        })
      } catch (error) {
        return toolErrorResponse('tracking the company', error)
      }
    },
  )

  server.registerTool(
    'remove_source',
    {
      title: 'Untrack Company',
      description: 'Stop tracking a company (by name or slug).',
      inputSchema: z.object({ company: z.string() }),
      annotations: { readOnlyHint: false },
    },
    async ({ company }) => {
      try {
        const removed = removeCompany(resolveHome(), company)
        if (!removed) {
          throw new AmtError('COMPANY_NOT_TRACKED', `"${company}" is not tracked`)
        }
        return jsonContent({ removed: company })
      } catch (error) {
        return toolErrorResponse('untracking the company', error)
      }
    },
  )

  // ─── Tool: prepare_application ─────────────────────────────────

  server.registerTool(
    'prepare_application',
    {
      title: 'Prepare Application',
      description:
        'Materialize the application folder for a job note: frozen snapshot, CV (html+pdf), and the '
        + 'cover-letter pipeline around cover-letter.<lang>.md. On first run the letter is scaffolded '
        + '— draft it with the user, edit the file, then call again to render txt/html/pdf.',
      inputSchema: z.object({
        slug: z.string(),
        lang: z.enum(['de', 'en']).optional().describe('Defaults to the previous choice or en.'),
        pdf: z.boolean().optional().describe('Render PDFs (default true).'),
      }),
      annotations: { readOnlyHint: false },
    },
    async ({ slug, lang, pdf }) => {
      try {
        const profile = await loadProfile(resolveHome())
        const result = await prepareApplication(profile, slug, { lang: lang as Lang | undefined, pdf })
        renderIndex(profile.paths.notesDir)
        return jsonContent(result)
      } catch (error) {
        return toolErrorResponse('generating the application', error)
      }
    },
  )

  // ─── Resource: job note ────────────────────────────────────────

  server.registerResource(
    'job-note',
    new ResourceTemplate('job://{slug}', {
      list: async () => {
        try {
          const profile = await loadProfile(resolveHome())
          return {
            resources: listNotes(profile.paths.notesDir).map(({ note }) => ({
              uri: `job://${note.slug}`,
              name: note.slug,
              description: `${note.company} — ${note.title} (${note.status})`,
              mimeType: 'text/markdown',
            })),
          }
        } catch {
          return { resources: [] }
        }
      },
    }),
    { description: 'A job note: frontmatter facts plus the posting description.' },
    async (uri, { slug }) => {
      const profile = await loadProfile(resolveHome())
      const { note, body } = readNote(profile.paths.notesDir, slug as string)
      const frontmatter = Object.entries(note)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join('\n')
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: `---\n${frontmatter}\n---\n\n${body}`,
          },
        ],
      }
    },
  )

  // ─── Prompts ───────────────────────────────────────────────────

  server.registerPrompt(
    'find-new-jobs',
    {
      title: 'Find New Jobs',
      description:
        'Full search round: crawl sources, run agent channels, score new candidates against the profile.',
      argsSchema: z.object({}).default({}),
    },
    async () => {
      let context = ''
      let channels = ''
      try {
        const home = resolveHome()
        context = buildProfileSection(await loadProfile(home))
        const sources = loadSources(home)
        channels = sources.channels.length
          ? `Configured agent channels (execute in priority order when present): ${JSON.stringify(sources.channels, null, 2)}`
          : 'No agent channels configured. Offer to seed channel recipes into sources.yaml — personal, local data the tool stores but never executes. Field-tested ranking: 1. LinkedIn guest jobs API (very high yield), 2. StepStone search pages (high, flaky details), 3. VueJobs internal API https://vuejobs.com/api/posts (niche, on-target for Vue), 4. Bing RSS as fallback. Tracked-company ATS crawling is the verifier/closer, not a discovery channel.'
      } catch {
        // still provide the workflow without context
      }
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                'Run a job-search round:',
                '1. Call crawl_jobs and report the summary.',
                '2. Execute the agent channels yourself (fetch their URLs, parse postings) and feed relevant finds through import_job — use the manual fields for non-ATS sources.',
                '3. For every note with status "new": judge stack fit and flags against the profile below, then persist score (0-100), flags, and your reasoning via set_job_status — never hand-edit note files. Cut clear mismatches with a cutReason.',
                '4. Present the shortlist candidates to the user, best first, with salary/remote facts and your reasoning. Never re-surface notes whose status is cut, rejected, or applied.',
                '',
                context,
                '',
                channels,
              ].join('\n'),
            },
          },
        ],
      }
    },
  )

  server.registerPrompt(
    'write-application',
    {
      title: 'Write Application',
      description:
        'Guided workflow: draft the cover letter with the user, then render the application folder.',
      argsSchema: z.object({
        slug: z.string().describe('Job note slug to apply for.'),
      }),
    },
    async ({ slug }) => {
      let context = ''
      try {
        context = buildProfileSection(await loadProfile(resolveHome()))
      } catch {
        // profile missing — workflow still applies
      }
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Write the application for job note "${slug}":`,
                '1. Read the posting via get_job (or the job://{slug} resource template).',
                '2. Decide the language using the LANGUAGE RULE below; confirm with the user.',
                '3. Call prepare_application once — it scaffolds cover-letter.<lang>.md.',
                '4. Draft the letter WITH the user in chat, strictly following the TONE RULES below. Iterate until they approve, writing the agreed text into the markdown file.',
                '5. Write the agreed text into the markdown file (requires filesystem access — in a pure MCP client, hand the text to the user instead), call prepare_application again to render txt/html/pdf, and set the status to applied once the user has submitted.',
                '',
                context,
              ].join('\n'),
            },
          },
        ],
      }
    },
  )

  return server
}
