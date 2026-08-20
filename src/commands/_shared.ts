import { defineCommand, type ArgsDef, type ParsedArgs } from 'citty'
import { JobKitError, toErrorMessage } from '../core/errors.js'
import { log } from '../utils/logger.js'
import { writeResult } from '../utils/stdout-guard.js'

// Command factory (i18n-kit pattern): each command file is a declaration;
// output shaping, JSON mode, and error-to-exit-code translation live here.
//
// Exit codes: 0 clean · 1 the tool broke · 2 reserved for tripped gates.

const sharedArgs = {
  json: {
    type: 'boolean',
    description: 'Emit machine-readable JSON on stdout',
    default: false,
  },
} satisfies ArgsDef

interface CommandSpec<A extends ArgsDef> {
  name: string
  description: string
  args?: A
  run: (args: ParsedArgs<A & typeof sharedArgs>) => Promise<CommandResult> | CommandResult
}

interface CommandResult {
  /** Machine-readable payload — the only thing stdout ever carries. */
  result: unknown
  /** Human summary lines, rendered to stdout in TTY mode, stderr otherwise. */
  human?: string[]
}

function jsonMode(flag: boolean): boolean {
  return flag || !process.stdout.isTTY
}

export function createCommand<A extends ArgsDef>(spec: CommandSpec<A>) {
  return defineCommand({
    meta: { name: spec.name, description: spec.description },
    args: { ...spec.args, ...sharedArgs } as A & typeof sharedArgs,
    async run({ args }) {
      const asJson = jsonMode(args.json as boolean)
      try {
        const { result, human } = await spec.run(args as ParsedArgs<A & typeof sharedArgs>)
        if (asJson) {
          writeResult(`${JSON.stringify(result, null, 2)}\n`)
        } else {
          writeResult(`${(human ?? [JSON.stringify(result, null, 2)]).join('\n')}\n`)
        }
      } catch (error) {
        const code = error instanceof JobKitError ? error.code : 'UNEXPECTED'
        if (asJson) {
          // Zero bytes on stdout is a parse error for consumers — always
          // emit a parseable envelope.
          writeResult(`${JSON.stringify({ error: { code, message: toErrorMessage(error) } })}\n`)
        }
        log.error(`[${code}] ${toErrorMessage(error)}`)
        process.exitCode = 1
      }
    },
  })
}
