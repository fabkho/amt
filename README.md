# amt

<p align="center">
  <img src="assets/sachbearbeiter.gif" width="420" alt="Der Sachbearbeiter bei der Arbeit"><br>
  <em>Der Sachbearbeiter bei der Arbeit.</em>
</p>

`amt` is a personal job-search toolkit: a CLI plus an MCP server (`amt-mcp`) that puts a
clerk — *der Sachbearbeiter* — inside your AI coding agent. It crawls job APIs
(7 ATS platforms + Arbeitnow), keeps one markdown note per posting that matches your
stack, and files everything else in a seen-ledger so it never resurfaces. You judge,
it stamps, and `prepare` renders CV + cover letter (PDF/txt/md) into an upload-ready folder.

## Setup — let the agent do the paperwork

The easiest way to set up amt is to not set it up yourself. Install the binaries,
wire up your agent, and then just *talk*:

```bash
pnpm add -g "git+ssh://git@github.com/fabkho/amt.git"        # installs amt + amt-mcp
claude mcp add --scope user amt -- amt-mcp                    # or the plugin, see below
```

Then tell your agent who you are — your stack, salary floor, cities or remote,
what your CV should say (pointing it at an existing CV, PDF or LinkedIn export,
works great as a starting point), how your cover letters should sound. It writes your
`profile.config.ts` and `cv-data.<lang>.yaml` into `AMT_HOME` (default `~/.config/amt/`),
which is exactly what the MCP server reads. No forms, no typing YAML by hand.

> *"Set up amt for me: I'm a senior Vue/TypeScript dev in Cologne, remote or ≥3 home-office
> days, floor 68k. Here's my CV: …"*

Prefer doing it by hand? `amt doctor` checks the office is open (and installs Chromium
for PDFs), `amt init` walks you through it interactively.

## Der Dienstweg (the loop)

```bash
amt sources add shopware   # track a company — its ATS is discovered automatically
amt crawl                  # fetch everything; a note only for relevant postings
amt list --status new      # today's stack of files
amt show <slug>            # one posting, full description
amt status <slug> shortlist --score 85   # der Stempel
amt prepare <slug> --lang en             # CV + letter → upload-ready folder
amt status <slug> applied                # case closed. next window, please
```

Statuses: `new → shortlist → applied → interview` (or `rejected` / `cut` — with
`--reason`, because an Amt files even its rejections properly). Also on duty:
`amt import <url>` for pasted ATS links (`--company/--title` for LinkedIn & co.).
The `_index.md` overview in your notes directory keeps itself current.

## Der Sachbearbeiter (agent integration)

`amt-mcp` exposes nine tools, `job://` resources, and two workflow prompts
(`find-new-jobs`, `write-application`) carrying your profile and tone rules.
The agent drafts with you in chat; the logic stays in code.

- **Claude Code:** `/plugin marketplace add fabkho/amt` → `/plugin install amt@amt`
  (bundles the MCP server + workflow skills, with auto-updates)
- **Codex CLI:** `codex mcp add amt -- amt-mcp` + copy `skills/` to `~/.agents/skills/`
- **Cursor / Zed:** point a stdio MCP server at `amt-mcp`
- **pi:** copy `pi-extension/` to `~/.pi/agent/extensions/amt/`

## Development

`pnpm install && pnpm lint && pnpm build && pnpm typecheck && pnpm test` —
rules and architecture in [CONTRIBUTING.md](./CONTRIBUTING.md).
