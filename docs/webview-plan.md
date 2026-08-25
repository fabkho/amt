# `amt serve` — local web dashboard

A local, single-user dashboard over the job notes. It is **another surface over
`core`** (like the CLI and MCP), never a second source of truth: every action
writes the actual markdown note, so Obsidian and the dashboard never disagree.

## Stack (decided)

- **No SPA, no build step.** Server-rendered HTML (Nunjucks, already a dep) +
  **htmx** for actions and filtering (HTML-over-the-wire, no JSON API, no client
  state to drift). **petite-vue** is vendored for optional local UI sprinkles.
- **No CSS framework.** Hand-written `assets/web/dashboard.css` in the owner's
  portfolio aesthetic: cream paper `#F5F2EB`, ink `#2C2C2A`, red-brick accent
  `#B93E2E`, IBM Plex Mono, thin ruled/dashed borders, paper-texture noise — the
  "official document" look that suits amt's Amt theme.
- **Vendored, offline.** htmx + petite-vue live in `assets/web/vendor/`; nothing
  is fetched from a CDN at runtime.
- **Zero new runtime deps** — the server is `node:http`.

## Pages

- **`/` Dashboard** — stat strip (unranked / favorites / shortlist / applied /
  interview / offer), the 📥 inbox (new & unranked), and the shortlist.
- **`/jobs` Akten** — all notes, filterable: status · work-mode · place bucket
  (Remote / profile cities / Other) · min score · ★-only · free-text.
- **`/jobs/:slug`** — full description + assessment, facts, and all actions.

## Action model

Each is an htmx POST → `core` mutation → HTML fragment swapped in place.

| Action | Effect |
| --- | --- |
| **★ favorite** | toggles the `favorite` note field (sticky across crawls; floats to the top within equal scores) |
| **accept** | → `shortlist` (auto-tracks the company) |
| **reject** | → `cut` with a reason picked from `CUT_REASONS` |
| **mark applied** | → `applied` (stamps `appliedAt`) |
| **build application** | runs `prepare` (scaffold CV + letter); the letter is still drafted with the agent under the tone rules — the UI kicks off and finalizes the pipeline around it |

> **Park** was considered and dropped in favor of **★ favorite** — more useful
> for surfacing the good ones than a hold state.

## Run it

```bash
amt serve            # http://localhost:4400
amt serve --port 8080
```

## Not in this iteration (backlog)

- **Cron / scheduled crawl + notifications** (issue #13) — postponed. The neat
  option when it lands: the running server *is* the scheduler (`--crawl-at`),
  firing an OS notification when new notes arrive.
- Manual score editing from the UI (ranking stays with the agent).
- Inline letter editing (currently: scaffold in the UI, draft with the agent).
