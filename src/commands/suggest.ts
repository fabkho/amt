import { createCommand } from './_shared.js'
import { suggestProfileUpdates } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'

export default createCommand({
  name: 'suggest',
  description: 'Suggest profile.yaml updates from your cut history (companies to blocklist, reason mix)',
  async run() {
    const profile = await loadProfile(resolveHome())
    const s = suggestProfileUpdates(profile.paths.notesDir, {
      existingBlocklist: profile.search.companyBlocklist,
    })
    return {
      result: s,
      human: [
        s.repeatCompanies.length
          ? 'Companies cut repeatedly (consider companyBlocklist):'
          : 'No repeat-cut companies worth blocklisting yet.',
        ...s.repeatCompanies.map(c => `  ${c.cuts}×  ${c.name}  (${c.reasons.join(', ') || '—'})`),
        '',
        'Cut reasons so far:',
        ...s.cutReasonCounts.map(r => `  ${String(r.count).padStart(3)}  ${r.reason}`),
      ],
    }
  },
})
