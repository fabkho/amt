import { createCommand } from './_shared.js'
import {
  CUT_REASONS,
  JOB_STATUSES,
  renderIndex,
  setStatus,
  updateNote,
  type CutReason,
  type JobNote,
  type JobStatus,
} from '../core/notes.js'
import { loadProfile, resolveHome, type Profile } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { tryAutoTrack } from '../core/sources-store.js'
import { AmtError } from '../core/errors.js'

interface StatusArgs {
  slug: string
  status: string
  reason?: string
  'cut-note'?: string
  score?: string
  assessment?: string
}

function changeStatus(profile: Profile, args: StatusArgs): JobNote {
  const status = args.status as JobStatus
  if (!JOB_STATUSES.includes(status)) {
    throw new AmtError(
      'STATUS_INVALID',
      `Unknown status "${status}" — valid: ${JOB_STATUSES.join(', ')}`,
    )
  }
  // Everything is validated BEFORE the first write — a half-applied status
  // with a failing score/reason must not exist.
  if (args.score !== undefined) {
    const score = Number(args.score)
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      throw new AmtError('SCORE_INVALID', `Score must be an integer 0-100, got "${args.score}"`)
    }
  }
  return setStatus(profile.paths.notesDir, args.slug, status, {
    cutReason: args.reason as CutReason | undefined,
    cutNote: args['cut-note'],
  })
}

function persistJudgment(profile: Profile, slug: string, args: StatusArgs): number | null | undefined {
  if (args.score === undefined && args.assessment === undefined) return undefined
  const updated = updateNote(profile.paths.notesDir, slug, {
    ...(args.score !== undefined ? { score: Number(args.score) } : {}),
    ...(args.assessment !== undefined ? { assessment: args.assessment } : {}),
  })
  return updated.score
}

export default createCommand({
  name: 'status',
  description: 'Set the status of a job note',
  args: {
    slug: { type: 'positional', description: 'Note slug', required: true },
    status: {
      type: 'positional',
      description: JOB_STATUSES.join('|'),
      required: true,
    },
    reason: { type: 'string', description: `Cut reason: ${CUT_REASONS.join('|')}` },
    'cut-note': { type: 'string', description: 'Free-text note explaining the cut' },
    score: { type: 'string', description: 'Fit score 0-100 to persist on the note' },
    assessment: { type: 'string', description: 'Reasoning — stored under "## Assessment" in the note body' },
  },
  async run(args) {
    const home = resolveHome()
    const profile = await loadProfile(home)
    const typed = args as unknown as StatusArgs

    const note = changeStatus(profile, typed)
    const score = persistJudgment(profile, note.slug, typed) ?? note.score

    // Shortlisting is interest — start watching the company's ATS.
    const tracked = await tryAutoTrack(
      defaultHttpClient,
      home,
      note.status === 'shortlist' && profile.search.autoTrackCompanies,
      note.company,
    )
    renderIndex(profile.paths.notesDir)

    return {
      result: { slug: note.slug, status: note.status, score, cutReason: note.cutReason, tracked },
      human: [
        `${note.slug} → ${note.status}${score !== null ? ` · score ${score}` : ''}${note.cutReason ? ` (${note.cutReason})` : ''}`,
        ...(tracked
          ? [`Now tracking ${note.company} (${tracked}) — future crawls include this company; \`amt sources remove\` to undo.`]
          : []),
      ],
    }
  },
})
