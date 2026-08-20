# amt

*Ein Amt, das für Sie arbeitet.* A bureaucracy for your job search — for once, on your side.

`amt` is a personal job-search toolkit: a CLI plus an MCP server (`amt-mcp`) that puts a
clerk — *der Sachbearbeiter* — inside your AI coding agent. It crawls job APIs
(7 ATS platforms + Arbeitnow), opens one markdown *Vorgang* per posting that matches
your stack, and files everything else in a seen-ledger so it never resurfaces.
You judge, it stamps, and `prepare` renders CV + cover letter (PDF/txt/md) into an
upload-ready folder.

Ihr Antrag wird bearbeitet. Genuinely, this time.

## Antragstellung (Setup)

```bash
pnpm add -g "git+ssh://git@github.com/fabkho/amt.git"   # installs amt + amt-mcp
amt doctor   # is the office open? installs Chromium for PDFs, reports what's missing
amt init     # take a number — interactive: profile, cv-data template, boards
```

Then fill in your paperwork in `AMT_HOME` (default `~/.config/amt/`):
`cv-data.en.yaml` (your CV content) and `profile.config.ts` (stacks, hard filters,
salary floor, tone rules — typed via `defineProfile` from `amt/config`). Notes land
in your notes directory; `sources.yaml` and `seen.json` are the office's own records.

## Der Dienstweg (the loop)

```bash
amt sources add shopware   # track a company — its ATS is discovered automatically
amt crawl                  # fetch everything; a Vorgang only for relevant postings
amt list --status new      # today's stack of files
amt show <slug>            # one posting, full description
amt status <slug> shortlist --score 85   # der Stempel
amt prepare <slug> --lang en             # CV + letter → upload-ready folder
amt status <slug> applied                # case closed. next window, please
```

Statuses: `new → shortlist → applied → interview` (or `rejected` / `cut` — with
`--reason`, because an Amt files even its rejections properly). Also on duty:
`amt import <url>` for pasted ATS links (`--company/--title` for LinkedIn & co.)
and `amt index` to regenerate the `_index.md` overview.

## Der Sachbearbeiter (agent integration)

`amt-mcp` exposes nine tools, `job://` resources, and two workflow prompts
(`find-new-jobs`, `write-application`) carrying your profile and tone rules.
The agent drafts with you in chat; the logic stays in code.

- **Claude Code:** `/plugin marketplace add fabkho/amt` → `/plugin install amt@amt`
  (or `claude mcp add --scope user amt -- amt-mcp`)
- **Codex CLI:** `codex mcp add amt -- amt-mcp` + copy `skills/` to `~/.agents/skills/`
- **Cursor / Zed:** point a stdio MCP server at `amt-mcp`
- **pi:** copy `pi-extension/` to `~/.pi/agent/extensions/amt/`

## Development

`pnpm install && pnpm lint && pnpm build && pnpm typecheck && pnpm test` —
rules and architecture in [CONTRIBUTING.md](./CONTRIBUTING.md).
