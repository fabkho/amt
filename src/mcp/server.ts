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
  applyHardFilters,
  findProbableDuplicates,
  inboxNotes,
  listNotes,
  resolveCompanyLogo,
  rankingDebt as computeRankingDebt,
  notesForCompany,
  loadProfile,
  loadSources,
  pendingSources,
  addCompany,
  upsertSource,
  removeSource,
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
import { trackAndReindex } from '../core/tracking.js'

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
  const minHO = Math.max(0, ...search.locations.cities.map(c => c.minHomeOfficeDays))
  return [
    'CANDIDATE PROFILE',
    `Primary stacks: ${search.stacksPrimary.join(', ')}`,
    `Secondary stacks: ${search.stacksSecondary.join(', ') || '—'}`,
    `Salary: floor ${search.salaryFloor}${search.salaryTarget ? `, target ${search.salaryTarget}` : ''}`,
    `Seniority: ${search.seniority.join(', ')}`,
    `Locations: remote ${search.locations.remote ? 'yes' : 'no'}; cities: ${search.locations.cities.map(c => `${c.name} (≥${c.minHomeOfficeDays} HO days)`).join(', ') || '—'}`,
    ...(minHO > 0
      ? [`Home-office floor: a hybrid role needs ≥${minHO}/5 days home office (≥${Math.round((minHO / 5) * 100)}%). Cut roles clearly below it (e.g. "50% remote", "2 Tage Home-Office") with cutReason home_office_below — agent-judged, the tool cannot read HO% from free text.`]
      : []),
    `Company types to reject (agent-judged — no deterministic check exists): ${search.companyTypesBlocked.join(', ') || '—'}`,
    `Hard filters already applied by the tool: max years required ${search.maxYearsRequired ?? '—'}; company blocklist ${search.companyBlocklist.join(', ') || '—'}; title blocklist ${search.titleBlocklist.join(', ') || '—'}; location blocklist ${search.locationBlocklist.join(', ') || '—'}`,
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

  // The ranking debt as data — attached to every response that could end a
  // session, so no agent can plausibly not know about unranked (or blindly
  // scored) notes.
  function rankingDebtPayload(notesDir: string): {
    count: number
    slugs: string[]
    undescribed?: string[]
    directive: string
  } | null {
    const { unranked, undescribed } = computeRankingDebt(notesDir)
    if (unranked.length === 0 && undescribed.length === 0) return null
    return {
      count: unranked.length,
      slugs: unranked,
      ...(undescribed.length > 0 && { undescribed }),
      directive:
        'Rank the unranked now via set_job_status (score + assessment, or cut). '
        + (undescribed.length > 0
          ? 'The undescribed notes were scored from title/company only — fetch each posting description (for LinkedIn use the guest endpoint) and re-import via import_job to re-open them for ranking. '
          : '')
        + 'A crawl/update is not finished while this is non-empty.',
    }
  }

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
        let rankingDebt = null
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
          rankingDebt = rankingDebtPayload(profile.paths.notesDir)
        } catch (error) {
          profileSummary = { missing: toErrorMessage(error) }
        }
        return jsonContent({
          name: 'amt',
          version,
          rankingDebt,
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
        'One crawl, full coverage: fetches every configured board and tracked company directly, and '
        + 'returns the agent-executed channel recipes (LinkedIn, StepStone, …) as pendingChannels — '
        + 'the crawl is NOT complete until you execute those too and feed relevant finds via '
        + 'import_job. The user thinks of this as a single operation; never make them ask twice. '
        + 'Notes are created only for stack-relevant postings that pass the hard filters; everything '
        + 'else lands in the seen-ledger and never surfaces again. Summary counters: filtered = '
        + 'failed a hard rule, offStack = no stack keyword matched, known = already judged, stale = '
        + 'board find older than maxAgeDays.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false },
    },
    async () => {
      try {
        const home = resolveHome()
        const profile = await loadProfile(home)
        const sources = loadSources(home)
        const summary = await crawl(defaultHttpClient, home, profile, sources)
        const rankingDebt = rankingDebtPayload(profile.paths.notesDir)
        // Tool sources were fetched above; only agent-only recipes remain pending.
        const pending = pendingSources(sources)
          .sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99))
        if (pending.length === 0) {
          return jsonContent(
            rankingDebt
              ? { ...summary, rankingDebt, next: `${summary.next} THEN: ${rankingDebt.directive}` }
              : summary,
          )
        }
        return jsonContent({
          ...summary,
          rankingDebt,
          pendingChannels: pending,
          next:
            `${summary.next} THEN, to complete the crawl: execute the pendingChannels recipes `
            + 'yourself in priority order (build the URLs from the recipe, fetch, parse per the '
            + 'hints) and import relevant finds via import_job — these have no machine-crawl spec. '
            + 'FINALLY rank every unranked note (status new, score null) via '
            + 'set_job_status with score + assessment; cut clear mismatches. A crawl is finished '
            + 'only when the inbox is ranked — see inbox/<date>.md in the notes dir.',
        })
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
        const posting = manual
          ? manualPosting(url, manual)
          : (await importPostingFromUrl(defaultHttpClient, url)).posting
        company = posting.company
        body = posting.descriptionHtml ? htmlToMarkdown(posting.descriptionHtml) : ''
        const input = postingToNoteInput(posting, today())
        // Parity with the CLI import path — resolve the company logo.
        input.logo = await resolveCompanyLogo(defaultHttpClient, company)
        result = upsertNote(profile.paths.notesDir, input, body)
        // The binary never fetches LinkedIn — an empty body means the agent
        // must fetch the description itself and re-import to rank meaningfully.
        const missingDescription = body.trim().length === 0
        // Explicit imports skip the hard filters by design; surface what they
        // WOULD have flagged so the user decides with open eyes (never auto-cut).
        const verdict = applyHardFilters(posting, profile)
        const filterWarnings = verdict.passed ? [] : [`${verdict.cutReason}: ${verdict.cutNote}`]
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
        const probableDuplicates = findProbableDuplicates(
          profile.paths.notesDir,
          note.company,
          note.title,
          result.slug,
        )
        renderIndex(profile.paths.notesDir, profile.search.locations.cities.map(c => c.name))
        return jsonContent({
          ...result,
          status: note.status,
          tracked,
          companyHistory,
          probableDuplicates,
          missingDescription,
          ...(missingDescription && {
            descriptionDirective:
              'No description was captured — fetch the posting text yourself (for LinkedIn use '
              + 'the guest endpoint /jobs-guest/jobs/api/jobPosting/{id}) and re-call import_job '
              + 'with manual.descriptionHtml so this can be ranked on real content.',
          }),
          ...(filterWarnings.length > 0 && { filterWarnings }),
          rankingDebt: rankingDebtPayload(profile.paths.notesDir),
        })
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
        const tracked = await trackAndReindex(defaultHttpClient, home, profile, note)
        // Return the remaining debt: a progress meter that terminates at null.
        return jsonContent({
          slug: note.slug,
          status: note.status,
          score: score ?? note.score,
          tracked,
          rankingDebt: rankingDebtPayload(profile.paths.notesDir),
        })
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
    'add_channel',
    {
      title: 'Add Agent Channel',
      description:
        'Add or update an agent channel in sources.yaml: a recipe (URL template, parse hints, '
        + 'priority) that YOU execute during search rounds — the tool stores it but never runs it. '
        + 'Same-name channels are replaced, so this is also the update path. Field-tested seeds: '
        + 'https://github.com/fabkho/amt/blob/main/skills/job-search/channels.md',
      inputSchema: z.object({
        name: z.string(),
        description: z.string().optional(),
        recipe: z.record(z.string(), z.unknown()).optional()
          .describe('Free-form recipe: urlTemplate, params, parse hints, …'),
        priority: z.number().int().optional().describe('Execution order, 1 = first'),
        yield: z.string().optional().describe('Observed yield note'),
      }),
      annotations: { readOnlyHint: false },
    },
    async ({ name, description, recipe, priority, yield: yieldNote }) => {
      try {
        const { updated } = upsertSource(resolveHome(), {
          name,
          ...(description !== undefined && { description }),
          ...(recipe !== undefined && { recipe }),
          ...(priority !== undefined && { priority }),
          ...(yieldNote !== undefined && { yield: yieldNote }),
        })
        return jsonContent({ name, updated })
      } catch (error) {
        return toolErrorResponse('adding the channel', error)
      }
    },
  )

  server.registerTool(
    'remove_source',
    {
      title: 'Untrack Company or Channel',
      description: 'Stop tracking a company (by name or slug) or remove an agent channel (by name).',
      inputSchema: z.object({ name: z.string().describe('Company name/slug or channel name') }),
      annotations: { readOnlyHint: false },
    },
    async ({ name }) => {
      try {
        const removed = removeSource(resolveHome(), name)
        if (!removed) {
          throw new AmtError('COMPANY_NOT_TRACKED', `"${name}" is not tracked`)
        }
        return jsonContent({ removed: name })
      } catch (error) {
        return toolErrorResponse('untracking the source', error)
      }
    },
  )

  // ─── Tool: get_inbox ───────────────────────────────────────────

  server.registerTool(
    'get_inbox',
    {
      title: 'Get Daily Inbox',
      description:
        "The day's arrivals (default today): what was discovered, with scores and cut reasons, "
        + 'plus the count still unranked. Use this to present the daily-update delta. Mirrors the '
        + 'inbox/<date>.md file in the notes dir.',
      inputSchema: z.object({
        date: z.string().optional().describe('ISO date YYYY-MM-DD; defaults to today'),
      }),
    },
    async ({ date }) => {
      try {
        const profile = await loadProfile(resolveHome())
        const day = date ?? today()
        const arrived = inboxNotes(profile.paths.notesDir, day).map(({ note }) => ({
          slug: note.slug,
          company: note.company,
          title: note.title,
          status: note.status,
          score: note.score,
          cutReason: note.cutReason,
          workMode: note.workMode,
          url: note.url,
        }))
        return jsonContent({
          date: day,
          arrived,
          unranked: arrived.filter(n => n.status === 'new' && n.score === null).length,
        })
      } catch (error) {
        return toolErrorResponse('reading the inbox', error)
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
        renderIndex(profile.paths.notesDir, profile.search.locations.cities.map(c => c.name))
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

  // "daily-update" is the one daily verb — the whole loop behind the word "update".
  const dailyUpdateHandler =
    async () => {
      let context = ''
      let channels = ''
      let crawlable = 'none' // tool-crawled channel names, derived from sources
      try {
        const home = resolveHome()
        context = buildProfileSection(await loadProfile(home))
        const sources = loadSources(home)
        const crawledNames = sources.sources.filter(c => c.crawl).map(c => c.name)
        if (crawledNames.length) crawlable = crawledNames.join(', ')
        const agentOnly = pendingSources(sources)
        channels = agentOnly.length
          ? `Configured agent channels (execute in priority order when present): ${JSON.stringify(agentOnly, null, 2)}`
          : 'No agent channels configured. Offer to seed channel recipes into sources.yaml — personal, local data the tool stores but never executes. Ready-made, field-tested recipes (URL templates + parse hints): https://github.com/fabkho/amt/blob/main/skills/job-search/channels.md — ranking: 1. LinkedIn guest jobs API (very high yield), 2. StepStone search pages (high, flaky details), 3. VueJobs internal API (niche, on-target for Vue), 4. Bing RSS as fallback. Tracked-company ATS crawling is the verifier/closer, not a discovery channel.'
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
                'Run the daily update (the user may just say "update"):',
                '1. Call crawl_jobs and report the summary.',
                `2. crawl_jobs already fetched the tool-crawled channels (${crawlable}). Only the pendingChannels it returns (agent-only, no crawl spec) need you: fetch their URLs, parse postings, and feed relevant finds through import_job — use the manual fields for non-ATS sources.`,
                '3. Rank EVERY unranked note (status "new", no score): judge stack fit and flags against the profile below, then persist score (0-100), flags, and your reasoning via set_job_status — never hand-edit note files. Cut clear mismatches with a cutReason. The round is not done while anything is unranked.',
                "4. Present today's inbox delta: what arrived, how you ranked it, and where each candidate slots among the user's existing scores (the day's file is inbox/<date>.md in the notes dir). Never re-surface notes whose status is cut, rejected, or applied.",
                '',
                context,
                '',
                channels,
              ].join('\n'),
            },
          },
        ],
      }
    }

  server.registerPrompt(
    'daily-update',
    {
      title: 'Daily Update',
      description:
        'Daily update: crawl sources, run agent channels, rank everything new, present the inbox delta.',
      argsSchema: z.object({}).default({}),
    },
    dailyUpdateHandler,
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
