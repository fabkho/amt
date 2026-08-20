import { createCommand } from './_shared.js'
import { applyToJob } from '../core/apply.js'
import { loadProfile, resolveHome } from '../core/profile.js'
import type { Lang } from '../core/render/templates.js'

export default createCommand({
  name: 'apply',
  description:
    'Materialize the application folder: CV, cover-letter pipeline, snapshots. Re-run after editing the letter.',
  args: {
    slug: { type: 'positional', description: 'Note slug', required: true },
    lang: { type: 'string', description: 'de|en (default: previous choice or en)' },
    pdf: {
      type: 'boolean',
      description: 'Render PDFs (disable with --no-pdf)',
      default: true,
    },
  },
  async run(args) {
    const profile = await loadProfile(resolveHome())
    const result = await applyToJob(profile, args.slug as string, {
      lang: args.lang as Lang | undefined,
      pdf: args.pdf as boolean,
    })
    return {
      result,
      human: [
        `Application folder: ${result.folder} (${result.lang})`,
        ...(result.letterScaffolded
          ? [`Cover letter scaffolded — draft it, then re-run apply to render the PDF.`]
          : ['Cover letter rendered from the existing markdown.']),
      ],
    }
  },
})
