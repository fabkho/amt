import { createCommand } from './_shared.js'
import { CUT_REASONS, JOB_STATUSES, setStatus, type CutReason, type JobStatus } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import { defaultHttpClient } from '../core/sources/http.js'
import { tryAutoTrack } from '../core/sources-store.js'
import { JobKitError } from '../core/errors.js'

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
    note: { type: 'string', description: 'Free-text note for the cut' },
  },
  async run(args) {
    const home = resolveHome()
    const profile = await loadProfile(home)
    const status = args.status as JobStatus
    if (!JOB_STATUSES.includes(status)) {
      throw new JobKitError('INVALID_STATUS', `Unknown status "${status}"`)
    }
    const note = setStatus(profile.paths.notesDir, args.slug as string, status, {
      cutReason: args.reason as CutReason | undefined,
      cutNote: args.note as string | undefined,
    })

    // Shortlisting is interest — start watching the company's ATS.
    const tracked = await tryAutoTrack(
      defaultHttpClient,
      home,
      status === 'shortlist' && profile.search.autoTrackCompanies,
      note.company,
    )

    return {
      result: { slug: note.slug, status: note.status, cutReason: note.cutReason, tracked },
      human: [
        `${note.slug} → ${note.status}${note.cutReason ? ` (${note.cutReason})` : ''}`,
        ...(tracked ? [`Now tracking ${note.company} (${tracked}).`] : []),
      ],
    }
  },
})
