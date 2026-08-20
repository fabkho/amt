import { createCommand } from './_shared.js'
import { renderIndex } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'

export default createCommand({
  name: 'index',
  description: 'Regenerate the _index.md overview from the job notes',
  async run() {
    const profile = await loadProfile(resolveHome())
    const content = renderIndex(profile.paths.notesDir)
    return {
      result: { notesDir: profile.paths.notesDir, bytes: content.length },
      human: [`Regenerated ${profile.paths.notesDir}/_index.md`],
    }
  },
})
