import { createCommand } from './_shared.js'
import { inboxNotes } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'

export default createCommand({
  name: 'inbox',
  description: "A day's arrivals (default today) — see inbox/<date>.md in the notes dir",
  args: {
    date: { type: 'positional', description: 'ISO date (YYYY-MM-DD)', required: false },
  },
  async run(args) {
    const profile = await loadProfile(resolveHome())
    const date = (args.date as string | undefined) ?? new Date().toISOString().slice(0, 10)
    const notes = inboxNotes(profile.paths.notesDir, date)
    const unranked = notes.filter(({ note }) => note.status === 'new' && note.score === null)
    return {
      result: {
        date,
        arrived: notes.map(({ note }) => ({
          slug: note.slug,
          company: note.company,
          title: note.title,
          status: note.status,
          score: note.score,
          workMode: note.workMode,
          url: note.url,
        })),
        unranked: unranked.length,
      },
      human:
        notes.length === 0
          ? [`Inbox ${date}: no arrivals.`]
          : [
              `Inbox ${date}: ${notes.length} arrived, ${unranked.length} unranked.`,
              ...notes.map(
                ({ note }) =>
                  `${note.score !== null ? `⭐ ${String(note.score).padStart(2)}` : '  --'}  ${note.status.padEnd(9)} ${note.slug}`,
              ),
            ],
    }
  },
})
