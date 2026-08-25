import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import nunjucks from 'nunjucks'

// The web templates ship next to the built code (dist/) and, under vitest,
// live in the repo's templates/web. Probe both like the MCP version helper.
function templatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  for (const levels of ['..', '../..', '../../..']) {
    const candidate = join(here, levels, 'templates/web')
    if (existsSync(join(candidate, 'layout.njk'))) return candidate
  }
  return join(here, '../templates/web')
}

let env: nunjucks.Environment | null = null

function getEnv(): nunjucks.Environment {
  // autoescape ON: job descriptions come from external sites and must not be
  // rendered as raw HTML.
  env ??= new nunjucks.Environment(new nunjucks.FileSystemLoader(templatesDir()), {
    autoescape: true,
  })
  return env
}

export function render(template: string, context: Record<string, unknown>): string {
  return getEnv().render(`${template}.njk`, context)
}
