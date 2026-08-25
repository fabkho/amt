import { createCommand } from './_shared.js'
import { staleApplications } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'

export default createCommand({
  name: 'followups',
  description: 'Applications waiting on a reply longer than --days (default 14)',
  args: {
    days: { type: 'string', description: 'Minimum days since applied (default 14)' },
  },
  async run(args) {
    const profile = await loadProfile(resolveHome())
    const minDays = args.days ? Number(args.days) : 14
    const today = new Date().toISOString().slice(0, 10)
    const due = staleApplications(profile.paths.notesDir, today, minDays)
    return {
      result: due,
      human:
        due.length === 0
          ? [`No applications older than ${minDays} days await a reply.`]
          : [
              `${due.length} application(s) waiting ≥ ${minDays} days — time to nudge:`,
              ...due.map(f => `${String(f.daysAgo).padStart(3)}d  ${f.company}: ${f.title}  (${f.slug})`),
            ],
    }
  },
})
