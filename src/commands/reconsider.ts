import { createCommand } from './_shared.js'
import { forgetSeen } from '../core/seen.js'
import { resolveHome } from '../core/profile.js'

export default createCommand({
  name: 'reconsider',
  description: 'Forget ledger cuts so the next crawl re-judges them against the current profile',
  args: {
    reason: {
      type: 'string',
      description: "Only 'filtered' (hard-rule cuts) or 'off-stack'; omit for all",
    },
  },
  run(args) {
    const reason = args.reason as 'filtered' | 'off-stack' | undefined
    if (reason && reason !== 'filtered' && reason !== 'off-stack') {
      throw new Error("--reason must be 'filtered' or 'off-stack'")
    }
    const forgotten = forgetSeen(resolveHome(), reason)
    return {
      result: { forgotten, reason: reason ?? 'all' },
      human: [
        `Forgot ${forgotten} ledger entr${forgotten === 1 ? 'y' : 'ies'}${reason ? ` (${reason})` : ''}.`,
        'Run `amt crawl` to re-judge those postings against your current profile.',
      ],
    }
  },
})
