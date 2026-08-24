---
name: job-search
description: Run the daily amt update — crawl configured sources, execute the user's agent channels, rank everything new, and present the day's inbox delta. Use when the user says "update", "daily update", "run my job search", "find jobs", or asks what's new in their search.
---

# Job-search round (amt)

amt is installed as an MCP server (`amt`) and a CLI (`amt … --json`). Call `discover` first — it returns the home directory, profile summary, sources, and note counts by status.

1. **Crawl:** call `crawl_jobs` (or `amt crawl --json`). Hard filters, dedupe, and the seen-ledger run automatically — notes are only created for stack-relevant postings. Report the summary and follow its `next` hint.
2. **Agent channels:** `crawl_jobs` returns them as `pendingChannels` (also under `discover` → `sources.channels`) — the crawl is not complete until you execute them yourself in `priority` order (field-tested yield: LinkedIn guest ≫ StepStone > VueJobs > Bing-RSS; the tracked-company ATS crawl is the verifier, not a discovery channel). Build the URLs, fetch, parse. Feed relevant finds via `import_job` (ATS URLs resolve automatically; use the `manual` fields otherwise). If no channels are configured, offer to seed the field-tested recipes from [channels.md](./channels.md) (adapted to the profile) via `add_channel` / `amt sources add-channel`.
3. **Rank:** every unranked note (status `new`, no score) gets judged — stack fit, seniority, the profile's blocked company types — and persisted via `set_job_status` with `score` (0–100), `flags`, and an `assessment` explaining your reasoning. Cut clear mismatches with a `cutReason`. The round is not done while anything is unranked.
4. **Present the inbox delta:** what arrived today, how it ranked, and where each candidate slots among the existing scores. The day's file is `inbox/<date>.md` in the notes dir (`amt inbox` shows it). Never re-surface notes whose status is `cut`, `rejected`, or `applied` — that is a status query, not a list to maintain.

Rules: never run `amt init` (interactive); never hand-edit `sources.yaml`, `seen.json`, or note frontmatter — use the tools (`add_channel` updates channel recipes).
