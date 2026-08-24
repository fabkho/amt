# amt

<p align="center">
  <img src="assets/sachbearbeiter.gif" width="420" alt="Der Sachbearbeiter bei der Arbeit"><br>
  <em>Der Sachbearbeiter bei der Arbeit.</em>
</p>

`amt` is a personal job-search toolkit: a CLI plus an MCP server (`amt-mcp`) that puts a
clerk — *der Sachbearbeiter* — inside your AI coding agent. It crawls job APIs
(6 ATS platforms, the Arbeitnow board, and the Bundesagentur für Arbeit), keeps one markdown note per posting that matches your
stack, and files everything else in a seen-ledger so it never resurfaces. You judge,
it stamps, and `prepare` renders CV + cover letter (PDF/txt/md) into an upload-ready folder.

## Setup — let the agent do the paperwork

The easiest way to set up amt is to not set it up yourself. Install the binaries,
wire up your agent, and then just *talk*:

```bash
pnpm add -g @fabkho/amt        # installs the amt + amt-mcp binaries
claude mcp add --scope user amt -- amt-mcp                    # or the plugin, see below
```

Then tell your agent who you are — your stack, salary floor, cities or remote,
what your CV should say (pointing it at an existing CV, PDF or LinkedIn export,
works great as a starting point), how your cover letters should sound. It writes your
`profile.yaml` and `cv-data.<lang>.yaml` into `AMT_HOME` (default `~/.config/amt/`),
which is exactly what the MCP server reads. No forms, no typing YAML by hand.

**Where things land** is yours to choose, via `paths` in `profile.yaml`:
`notesDir` is where the job notes go — any folder works, and an Obsidian vault works
great (the frontmatter shows up as properties, and the self-updating `_index.md` links
every note). `outputBase` is where `prepare` drops the upload-ready application folders.

> *"Set up amt for me: I'm a senior React/Go dev in Hamburg, remote-only, floor 80k.
> Here's my CV: …"*

Prefer doing it by hand? `amt doctor` checks the office is open (and installs Chromium
for PDFs), `amt init` walks you through it interactively.

## Der Dienstweg (the loop)

The full experience is one sentence to your agent: *"run my job search"* —
it crawls every source **including the agent channels** (LinkedIn & Co.),
scores the finds against your profile, and hands you a ranked list.
The same loop by hand:

```bash
amt sources add shopware   # track a company — its ATS is discovered automatically
amt crawl                  # fetch all APIs (warns about channels only an agent can run)
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

## Die Quellenlage (sources)

amt itself crawls only **safe, official job APIs**: boards like Arbeitnow, the
Bundesagentur für Arbeit Jobsuche (Germany's largest job database — queried along
your stack keywords and cities), and the career pages of companies you track — `amt sources add <company>` auto-discovers
which ATS they use (Recruitee, Ashby, Greenhouse, Lever, Personio, SmartRecruiters).

Everything else goes into `sources.yaml` as a **channel**: a recipe (URL template,
parse hints, priority) that your *agent* executes — the tool stores channels but
never runs them. Ship-safe by design, and fully yours to extend: add any source
you like that doesn't block AI crawlers, tweak a keyword or parse hint, and the
very next crawl uses it.

You shouldn't have to think about this split — and via MCP you don't: a crawl
returns the channels as `pendingChannels` and the agent completes them in the
same breath. One "crawl", full coverage. Only the bare CLI stops at the API
layer (and says so).

## Der Sachbearbeiter (agent integration)

**The MCP server is the recommended way to use amt** — the CLI is the paper
form, the agent is the clerk who fills it in. `amt-mcp` exposes the tools
(crawl, import, status, prepare, channels), `job://` resources, and two
workflow prompts (`find-new-jobs`, `write-application`) carrying your profile
and tone rules. The agent drafts with you in chat; the logic stays in code.

- **Claude Code:** `/plugin marketplace add fabkho/amt` → `/plugin install amt@amt`
  (bundles the MCP server + workflow skills, with auto-updates)
- **Codex CLI:** `codex mcp add amt -- amt-mcp` + copy `skills/` to `~/.agents/skills/`
- **Cursor / Zed:** point a stdio MCP server at `amt-mcp`
- **pi:** copy `pi-extension/` to `~/.pi/agent/extensions/amt/`

## Sprechzeiten (troubleshooting)

- **Node ≥ 22** and pnpm (`corepack enable`; if a global install complains about a
  missing global bin dir, run `pnpm setup` and restart your shell).
- **`amt` behaves strangely / prints nonsense:** macOS ships a deprecated
  `/usr/sbin/amt`. If it shadows the real one, add to the END of your `~/.zshrc`:
  `export PATH="$PNPM_HOME:$PATH"` — `which amt` should point into your pnpm dir.

## Development

`pnpm install && pnpm lint && pnpm build && pnpm typecheck && pnpm test` —
rules and architecture in [CONTRIBUTING.md](./CONTRIBUTING.md).
