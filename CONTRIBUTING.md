# Contributing

## Source tree

```
src/
├── bin.ts            # CLI entry: installs the stdout guard, then loads cli.ts
├── cli.ts            # citty root command, lazy subcommand registry
├── commands/         # one file per CLI command (~15 lines each once the factory lands)
├── core/             # ALL logic lives here — plain functions, plain objects, typed errors.
│                     # No CLI/MCP imports, no process.exit, no console.
├── mcp-bin.ts        # MCP entry: serveStdio over createServer
├── mcp/server.ts     # tool/resource/prompt registrations — imports only from src/index.ts surface
├── index.ts          # curated public API (the contract for MCP and the pi wrapper)
└── utils/            # logger (consola → stderr), stdout-guard
```

## Rules that matter

- **stdout is the result channel.** Diagnostics go through `utils/logger.ts` (stderr). Command results go through `writeResult()`. `no-console` is enforced by oxlint.
- **Exit codes:** 0 = clean, 1 = the tool broke, 2 = the run worked but a gate tripped.
- **Destructive commands default to dry-run.**
- Conventional commits (commitlint); husky runs lint + typecheck pre-commit.
- `npx fallow audit` gates on new complexity/dead code against committed baselines.

## Onboarding (colleagues)

1. Node ≥ 20 and pnpm (`corepack enable`).
2. `pnpm add -g git+ssh://git@github.com/fabkho/job-kit.git` — installs `job-kit` and `job-kit-mcp`.
3. `job-kit doctor` — tells you what's missing (from phase 2 on: installs the Playwright Chromium used for PDF rendering).
4. `job-kit init` (phase 3) scaffolds your personal `profile.yaml`.
