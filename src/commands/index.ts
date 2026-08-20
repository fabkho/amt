import { createCommand } from './_shared.js'
import { renderIndex } from '../core/notes.js'
import { loadProfile, resolveHome } from '../core/profile.js'

export default createCommand({
  name: 'index',
  description: 'Regenerate the _index.md overview from the job notes',
  async run() {
    const profile = await loadProfile(resolveHome())
    renderIndex(profile.paths.notesDir)
    const path = `${profile.paths.notesDir}/_index.md`
    return {
      result: { indexFile: path },
      human: [`Regenerated ${path}`],
    }
  },
})
