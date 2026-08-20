import { createCommand } from './_shared.js'
import { JOB_STATUSES, listNotes, type JobStatus } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import { JobKitError } from '../core/errors.js'

export default createCommand({
  name: 'list',
  description: 'List job notes, optionally filtered by status',
  args: {
    status: {
      type: 'string',
      description: `Filter: ${JOB_STATUSES.join('|')} (comma-separated)`,
    },
  },
  async run(args) {
    const profile = await loadProfile(resolveHome())
    let status: JobStatus[] | undefined
    if (args.status) {
      status = (args.status as string).split(',').map(s => s.trim()) as JobStatus[]
      const invalid = status.filter(s => !JOB_STATUSES.includes(s))
      if (invalid.length > 0) {
        throw new JobKitError(
          'STATUS_INVALID',
          `Unknown status: ${invalid.join(', ')} — valid: ${JOB_STATUSES.join(', ')}`,
        )
      }
    }
    const notes = listNotes(profile.paths.notesDir, { status })
    return {
      result: notes.map(({ note }) => ({
        slug: note.slug,
        company: note.company,
        title: note.title,
        status: note.status,
        score: note.score,
        workMode: note.workMode,
        url: note.url,
      })),
      human:
        notes.length === 0
          ? ['No matching job notes.']
          : notes.map(
              ({ note }) =>
                `${note.status.padEnd(9)} ${note.slug} — ${note.company}: ${note.title}`,
            ),
    }
  },
})
