---
name: job-search
description: Run a job-search round with job-kit — crawl configured sources, execute the user's agent channels, score new candidates against their profile, and present a shortlist. Use when the user says "run my job search", "find jobs", "job scan", or asks what's new in their search.
---

# Job-search round (job-kit)

job-kit is installed as an MCP server (`job-kit`) and a CLI (`job-kit … --json`). Call `discover` first — it returns the home directory, profile summary, sources, and note counts by status.

1. **Crawl:** call `crawl_jobs` (or `job-kit crawl --json`). Hard filters, dedupe, and the seen-ledger run automatically — notes are only created for stack-relevant postings. Report the summary and follow its `next` hint.
2. **Agent channels:** `discover` lists channel recipes under `sources.channels` (LinkedIn guest, StepStone …). Execute those yourself — build the URLs, fetch, parse. Feed relevant finds via `import_job` (ATS URLs resolve automatically; use the `manual` fields otherwise). If no channels are configured, offer to seed recipes into sources.yaml.
3. **Score:** for every note with status `new`, judge stack fit, seniority, and the profile's blocked company types, then persist via `set_job_status` with `score` (0–100), `flags`, and an `assessment` explaining your reasoning. Cut clear mismatches with a `cutReason`.
4. **Present:** show the best candidates first with salary/remote facts and your reasoning. Never re-surface notes whose status is `cut`, `rejected`, or `applied` — that is a status query, not a list to maintain.

Rules: never run `job-kit init` (interactive); never hand-edit `sources.yaml`, `seen.json`, or note frontmatter — use the tools.
