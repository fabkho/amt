---
name: job-search
description: Run the daily amt update — crawl configured sources, execute the user's agent channels, rank everything new, and present the day's inbox delta. Use when the user says "update", "daily update", "run my job search", "find jobs", or asks what's new in their search.
---

# Job-search round (amt)

amt is installed as an MCP server (`amt`) and a CLI (`amt … --json`). Call `discover` first — it returns the home directory, profile summary, sources, and note counts by status.

1. **Crawl:** call `crawl_jobs` (or `amt crawl --json`). Hard filters, dedupe, and the seen-ledger run automatically — notes are only created for stack-relevant postings. Report the summary and follow its `next` hint.
2. **Channels:** channels with a `crawl:` spec (LinkedIn, VueJobs) are already fetched by `crawl_jobs` itself — nothing to do. Only channels WITHOUT a spec come back as `pendingChannels`: execute those yourself in `priority` order (StepStone & co.; the tracked-company ATS crawl is the verifier, not a discovery channel), build the URLs, fetch, parse, and feed relevant finds via `import_job` (ATS URLs resolve automatically; use the `manual` fields otherwise). If no channels are configured, offer to seed the field-tested recipes from [channels.md](./channels.md) (adapted to the profile) via `add_channel` / `amt sources add-channel`.
3. **Rank — this is the core of the update, not an optional extra. Do NOT stop and ask before scoring; ranking IS the daily update.** Judge *every* unranked note (status `new`, no score) — stack fit, seniority, the profile's blocked company types, home-office floor — and persist each via `set_job_status` (CLI: `amt status <slug> <status>`) with `score` (0–100), `flags`, and an `assessment` explaining your reasoning. Cut clear mismatches with a `cutReason` from the enum. Keep viable ones as `new` with their score (do NOT auto-shortlist — shortlisting is the user's call). **The round is not done while anything is unranked** — if you crawled and left notes unscored, you stopped halfway.
4. **Prune:** once everything is ranked, call `prune_below_threshold` (CLI: `amt prune`) to auto-reject inbox notes scored below the profile's `scoreThreshold` (default 50) — only ≥ threshold stay open. Never touches the unranked, so step 3 must be complete first.
5. **Present the inbox delta:** what arrived today, how it ranked, and where each candidate slots among the existing scores. The day's file is `inbox/<date>.md` in the notes dir (`amt inbox` shows it). Never re-surface notes whose status is `cut`, `rejected`, or `applied` — that is a status query, not a list to maintain.

Optionally, `suggest_profile_updates` (CLI: `amt suggest`) mines the cut history for `companyBlocklist` candidates and the reason mix — propose these to the user, never edit `profile.yaml` yourself.

Rules: never run `amt init` (interactive); never hand-edit `sources.yaml`, `seen.json`, or note frontmatter — use the tools (`add_channel` updates channel recipes).
