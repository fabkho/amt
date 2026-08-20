# amt

**Your job search as a toolkit.** Crawl postings from clean APIs, keep one markdown note per job with a real status, and render CVs and cover letters (PDF, txt, md) into an upload-ready folder — from the terminal or from inside your AI coding session.

## The Problem

Applying to jobs means juggling three disconnected systems: job research scattered across boards and hand-maintained tables, a CV generator with per-job configs, and cover letters pasted together by hand. Nothing shares a key, statuses live in prose, and every teammate rebuilds the same workflow from scratch.

## How It Works

amt keeps a per-user home directory (`AMT_HOME`, default `~/.config/amt/`) with your `profile.config.ts` (preferences, hard filters, tone rules — typed via `defineProfile` from `amt/config`), your `cv-data.<lang>.yaml`, the tool-managed `sources.yaml` (boards, tracked companies, agent-channel recipes), and the `seen.json` ledger. One markdown note per relevant posting lands in your notes directory; everything the crawler dismissed is remembered in the ledger without leaving a file.

**A CLI** for direct use:

```bash
amt init                  # onboarding: profile, cv-data template, boards
amt doctor                # is my environment ready? (installs Chromium for PDFs)
amt sources add shopware  # track a company — its ATS is discovered automatically
amt crawl                 # fetch everything; notes only for stack-relevant postings
amt list --status new     # what should I look at?
amt show <slug>           # one posting in full
amt status <slug> shortlist --score 85   # persist your judgment
amt prepare <slug> --lang en             # CV + cover-letter pipeline into a folder
amt import <url>          # paste an ATS link; --company/--title for LinkedIn & co.
amt index                 # regenerate the _index.md overview
```

**An MCP server** (`amt-mcp`) for AI coding agents: nine tools, `job://` resources, and two workflow prompts (`find-new-jobs`, `write-application`) that carry your profile and tone rules. The agent drafts the letter with you in chat; the logic stays in code.

## Setup

```bash
pnpm add -g "git+ssh://git@github.com/fabkho/amt.git"   # installs amt + amt-mcp
amt doctor    # checks/installs Chromium, tells you what's missing
amt init      # interactive: profile.config.ts, cv-data.en.yaml template, boards
```

Fill `~/.config/amt/cv-data.en.yaml` (your CV content — `prepare` renders from it) and refine `profile.config.ts` (stacks, salary floor, tone rules).

### Agent integration

- **Claude Code:** `/plugin marketplace add fabkho/amt` then `/plugin install amt@amt` — bundles the MCP server and the workflow skills, with auto-updates. (Or manually: `claude mcp add --scope user amt -- amt-mcp`.)
- **Codex CLI:** `codex mcp add amt -- amt-mcp`; copy `skills/` into `~/.agents/skills/` for the workflow skills (Codex does not expose MCP prompts).
- **Cursor** (`~/.cursor/mcp.json`) / **Zed** (`context_servers`): point a stdio server at `amt-mcp`.
- **pi:** copy `pi-extension/` to `~/.pi/agent/extensions/amt/`.

## Development

```bash
pnpm install && pnpm lint && pnpm build && pnpm typecheck && pnpm test
```

Conventional commits (commitlint), release-please, `npx fallow audit` as the complexity/dead-code gate. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the architecture rules and [PLAN.md](./PLAN.md) for the design history.
