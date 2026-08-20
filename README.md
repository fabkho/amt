# job-kit

**Your job search as a toolkit.** Crawl postings from clean APIs, keep one markdown note per job with a real status, and render CVs and cover letters (PDF, txt, md) into an upload-ready folder — from the terminal or from inside your AI coding session.

> Work in progress — see [PLAN.md](./PLAN.md) for the roadmap. Currently: phase 1 (scaffold).

## The Problem

Applying to jobs means juggling three disconnected systems: job research scattered across boards and hand-maintained tables, a CV generator with per-job configs, and cover letters pasted together by hand. Nothing shares a key, statuses live in prose, and every teammate rebuilds the same workflow from scratch.

## How It Works

job-kit keeps a per-user `profile.yaml` (your stack focus, hard filters, tone rules) and one markdown note per job posting. Two interfaces on one deterministic core:

**A CLI** for direct use:

```bash
job-kit doctor        # is my environment ready?
job-kit crawl         # what's new that matches my profile?   (phase 2/3)
job-kit list          # where do my applications stand?       (phase 3)
job-kit prepare <slug> # render CV + cover letter to a folder
```

**An MCP server** (`job-kit-mcp`) that plugs into AI coding agents: your agent reads the job note and your tone rules, drafts the cover letter with you in chat, then calls the render tools — the judgment stays in the conversation, the logic stays in code.

## Quick Start

```bash
pnpm install
pnpm build
node dist/bin.mjs doctor
```

MCP (Claude Code, project scope): the committed [.mcp.json](./.mcp.json) wires `job-kit` up after `pnpm build`.

## Development

```bash
pnpm lint && pnpm build && pnpm typecheck && pnpm test
```

Conventional commits, enforced by commitlint. Releases via release-please.
