import { createCommand } from './_shared.js'
import { CUT_REASONS, JOB_STATUSES, setStatus, updateNote, type CutReason, type JobStatus } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { tryAutoTrack } from '../core/sources-store.js'
import { AmtError } from '../core/errors.js'

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
    const status = args.status as JobStatus
    if (!JOB_STATUSES.includes(status)) {
      throw new AmtError(
        'STATUS_INVALID',
        `Unknown status "${status}" — valid: ${JOB_STATUSES.join(', ')}`,
      )
    }
    const note = setStatus(profile.paths.notesDir, args.slug as string, status, {
      cutReason: args.reason as CutReason | undefined,
      cutNote: args['cut-note'] as string | undefined,
    })
    let score = note.score
    if (args.score !== undefined || args.assessment !== undefined) {
      const updated = updateNote(profile.paths.notesDir, note.slug, {
        ...(args.score !== undefined ? { score: Number(args.score) } : {}),
        ...(args.assessment !== undefined ? { assessment: args.assessment as string } : {}),
      })
      score = updated.score
    }

    // Shortlisting is interest — start watching the company's ATS.
    const tracked = await tryAutoTrack(
      defaultHttpClient,
      home,
      status === 'shortlist' && profile.search.autoTrackCompanies,
      note.company,
    )

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
