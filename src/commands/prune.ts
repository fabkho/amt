import { createCommand } from './_shared.js'
import { pruneBelowThreshold } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'

export default createCommand({
  name: 'prune',
  description: 'Auto-reject inbox notes scored below the threshold (default: profile scoreThreshold)',
  args: {
    threshold: { type: 'string', description: 'Score floor 0-100; below this is cut' },
  },
  async run(args) {
    const profile = await loadProfile(resolveHome())
    const raw = args.threshold as string | undefined
    const threshold = raw !== undefined && Number.isFinite(Number(raw)) ? Number(raw) : profile.search.scoreThreshold
    const pruned = pruneBelowThreshold(profile.paths.notesDir, threshold)
    return {
      result: { threshold, pruned: pruned.length, slugs: pruned },
      human: [
        pruned.length
          ? `Pruned ${pruned.length} inbox note(s) scored below ${threshold} (cutReason below_threshold).`
          : `Nothing to prune — no inbox notes below ${threshold}.`,
      ],
    }
  },
})
