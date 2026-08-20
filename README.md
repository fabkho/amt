# job-kit

**Your job search as a toolkit.** Crawl postings from clean APIs, keep one markdown note per job with a real status, and render CVs and cover letters (PDF, txt, md) into an upload-ready folder — from the terminal or from inside your AI coding session.

## The Problem

Applying to jobs means juggling three disconnected systems: job research scattered across boards and hand-maintained tables, a CV generator with per-job configs, and cover letters pasted together by hand. Nothing shares a key, statuses live in prose, and every teammate rebuilds the same workflow from scratch.

## How It Works

job-kit keeps a per-user home directory (`JOB_KIT_HOME`, default `~/.config/job-kit/`) with your `profile.config.ts` (preferences, hard filters, tone rules — typed via `defineProfile` from `job-kit/config`), your `cv-data.<lang>.yaml`, the tool-managed `sources.yaml` (boards, tracked companies, agent-channel recipes), and the `seen.json` ledger. One markdown note per relevant posting lands in your notes directory; everything the crawler dismissed is remembered in the ledger without leaving a file.

**A CLI** for direct use:

```bash
job-kit init                  # onboarding: profile, cv-data template, boards
job-kit doctor                # is my environment ready? (installs Chromium for PDFs)
job-kit sources add shopware  # track a company — its ATS is discovered automatically
job-kit crawl                 # fetch everything; notes only for stack-relevant postings
job-kit list --status new     # what should I look at?
job-kit show <slug>           # one posting in full
job-kit status <slug> shortlist --score 85   # persist your judgment
job-kit prepare <slug> --lang en             # CV + cover-letter pipeline into a folder
job-kit import <url>          # paste an ATS link; --company/--title for LinkedIn & co.
job-kit index                 # regenerate the _index.md overview
```

**An MCP server** (`job-kit-mcp`) for AI coding agents: nine tools, `job://` resources, and two workflow prompts (`find-new-jobs`, `write-application`) that carry your profile and tone rules. The agent drafts the letter with you in chat; the logic stays in code.

## Setup

```bash
pnpm add -g "git+ssh://git@github.com/fabkho/job-kit.git"   # installs job-kit + job-kit-mcp
job-kit doctor    # checks/installs Chromium, tells you what's missing
job-kit init      # interactive: profile.config.ts, cv-data.en.yaml template, boards
```

Fill `~/.config/job-kit/cv-data.en.yaml` (your CV content — `prepare` renders from it) and refine `profile.config.ts` (stacks, salary floor, tone rules).

### Agent integration

- **Claude Code:** `/plugin marketplace add fabkho/job-kit` then `/plugin install job-kit@job-kit` — bundles the MCP server and the workflow skills, with auto-updates. (Or manually: `claude mcp add --scope user job-kit -- job-kit-mcp`.)
- **Codex CLI:** `codex mcp add job-kit -- job-kit-mcp`; copy `skills/` into `~/.agents/skills/` for the workflow skills (Codex does not expose MCP prompts).
- **Cursor** (`~/.cursor/mcp.json`) / **Zed** (`context_servers`): point a stdio server at `job-kit-mcp`.
- **pi:** copy `pi-extension/` to `~/.pi/agent/extensions/job-kit/`.

## Development

```bash
pnpm install && pnpm lint && pnpm build && pnpm typecheck && pnpm test
```

Conventional commits (commitlint), release-please, `npx fallow audit` as the complexity/dead-code gate. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the architecture rules and [PLAN.md](./PLAN.md) for the design history.
