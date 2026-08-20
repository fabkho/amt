# Contributing

## Source tree

```
src/
├── bin.ts            # CLI entry: installs the stdout guard, then loads cli.ts
├── cli.ts            # citty root command, lazy subcommand registry
├── commands/         # one thin declaration per CLI command (createCommand factory)
├── core/             # ALL logic lives here — plain functions, plain objects, typed errors.
│   │                 # No CLI/MCP imports, no process.exit, no console.
│   └── sources/      # one adapter per job API (7: recruitee, ashby, greenhouse,
│                     # lever, personio, smartrecruiters, arbeitnow) + registry
├── mcp-bin.ts        # MCP entry: serveStdio over createServer
├── mcp/server.ts     # tools/resources/prompts — imports ONLY from src/index.ts
├── index.ts          # curated public API (the contract for MCP and wrappers)
└── utils/            # logger (consola → stderr), stdout-guard
templates/            # Nunjucks CV + letter templates, labels.<lang>.yaml, shared.css
pi-extension/         # thin pi wrapper (own runtime — lint/fallow-ignored)
skills/               # Agent Skills (open standard) — shipped via the Claude Code plugin,
                      # copied to ~/.agents/skills for Codex
```

## Rules that matter

- **stdout is the result channel.** Diagnostics go through `utils/logger.ts` (stderr). Command results go through `writeResult()`. `no-console` is enforced by oxlint.
- **Exit codes:** 0 = clean, 1 = the tool broke, 2 = the run worked but findings exist (doctor uses this).
- **State ownership:** `profile.yaml` is human-edited only (schema-validated, autocomplete via generated profile.schema.json); `sources.yaml` and `seen.json` are tool-managed; note frontmatter human state and body text outside the description markers survive every crawler refresh.
- **`init` is the only interactive command** — everything else must be safe for agents and scheduled runs.
- Conventional commits (commitlint); husky runs lint + typecheck pre-commit; `npx fallow audit` gates new complexity/dead code.

## Onboarding (colleagues)

1. Node ≥ 22 and pnpm (`corepack enable`).
2. `pnpm add -g "git+ssh://git@github.com/fabkho/amt.git"` — installs `amt` and `amt-mcp`.
3. `amt doctor` — installs Chromium for PDF rendering, reports what's missing.
4. `amt init` — scaffolds your `profile.yaml` (+ its JSON schema), a `cv-data.en.yaml` template, and seeds the boards. Fill both files.
5. Wire up your agent — see "Agent integration" in the README.
