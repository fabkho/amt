// Husky must only install hooks inside a development checkout. When the
// package is built as a git dependency (pnpm add -g git+ssh://…) there is no
// .git directory and hook installation would abort the whole prepare step.
import { existsSync } from 'node:fs'

if (!existsSync('.git')) {
  process.exit(0)
}

const { default: husky } = await import('husky')
const output = husky()
if (output) process.stderr.write(`${output}\n`)
