import { createCommand } from './_shared.js'
import { readNote } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'

export default createCommand({
  name: 'show',
  description: 'Show a job note with its description',
  args: {
    slug: { type: 'positional', description: 'Note slug', required: true },
  },
  async run(args) {
    const profile = await loadProfile(resolveHome())
    const { note, body } = readNote(profile.paths.notesDir, args.slug as string)
    return {
      result: { ...note, body },
      human: [
        `${note.company} — ${note.title}`,
        `status: ${note.status}${note.cutReason ? ` (${note.cutReason}: ${note.cutNote})` : ''}`,
        `${note.workMode ?? '?'} · ${note.location ?? '?'} · published ${note.publishedAt ?? '?'}`,
        note.url,
        '',
        body,
      ],
    }
  },
})
