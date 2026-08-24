---
name: job-search
description: Run a job-search round with amt — crawl configured sources, execute the user's agent channels, score new candidates against their profile, and present a shortlist. Use when the user says "run my job search", "find jobs", "job scan", or asks what's new in their search.
---

# Job-search round (amt)

amt is installed as an MCP server (`amt`) and a CLI (`amt … --json`). Call `discover` first — it returns the home directory, profile summary, sources, and note counts by status.

1. **Crawl:** call `crawl_jobs` (or `amt crawl --json`). Hard filters, dedupe, and the seen-ledger run automatically — notes are only created for stack-relevant postings. Report the summary and follow its `next` hint.
2. **Agent channels:** `crawl_jobs` returns them as `pendingChannels` (also under `discover` → `sources.channels`) — the crawl is not complete until you execute them yourself in `priority` order (field-tested yield: LinkedIn guest ≫ StepStone > VueJobs > Bing-RSS; the tracked-company ATS crawl is the verifier, not a discovery channel). Build the URLs, fetch, parse. Feed relevant finds via `import_job` (ATS URLs resolve automatically; use the `manual` fields otherwise). If no channels are configured, offer to seed the field-tested recipes from [channels.md](./channels.md) (adapted to the profile) via `add_channel` / `amt sources add-channel`.
3. **Score:** for every note with status `new`, judge stack fit, seniority, and the profile's blocked company types, then persist via `set_job_status` with `score` (0–100), `flags`, and an `assessment` explaining your reasoning. Cut clear mismatches with a `cutReason`.
4. **Present:** show the best candidates first with salary/remote facts and your reasoning. Never re-surface notes whose status is `cut`, `rejected`, or `applied` — that is a status query, not a list to maintain.

Rules: never run `amt init` (interactive); never hand-edit `sources.yaml`, `seen.json`, or note frontmatter — use the tools (`add_channel` updates channel recipes).
