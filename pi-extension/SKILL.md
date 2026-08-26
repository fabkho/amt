---
name: amt
description: Job-search workflow via the amt CLI — crawl sources, score candidates, prepare applications (CV + cover letter). Use when the user wants to search jobs, review candidates, or apply.
---

# amt (pi wrapper)

Thin wrapper around the globally installed `amt` CLI — one `amt` tool taking an argv array, always returning JSON.

**Setup:** `pnpm add -g @fabkho/amt`, then `amt doctor` (installs Chromium for PDFs) and `amt init` (profile + sources). Copy this directory to `~/.pi/agent/extensions/amt/` and `/reload`.

**Workflow — the daily update is crawl → RANK → prune → present. Ranking is the core of the update, not an optional extra: after crawling, do NOT stop and ask — score everything.**

1. `["crawl"]` fetches all sources incl. tool-crawled channels (LinkedIn, StepStone, VueJobs) — notes only for stack-relevant postings; the rest is remembered in the seen-ledger.
2. **Rank every unranked note.** `["list", "--status", "new"]` lists them. For each, judge stack fit / seniority / blocked company types / home-office floor and persist a score+reasoning: `["status", "<slug>", "new", "--score", "<0-100>", "--assessment", "<why>"]`, or cut a clear mismatch: `["status", "<slug>", "cut", "--reason", "<enum>", "--cut-note", "<why>"]`. Keep viable ones as `new` with their score — do NOT auto-shortlist (that's the user's call). **The round isn't done while anything is unranked.**
3. `["prune"]` auto-rejects inbox notes below the profile's `scoreThreshold` (default 50). Only run it after step 2 is complete (it never touches the unranked).
4. `["inbox"]` shows the day's delta to present.

To apply: `["status", "<slug>", "shortlist"]` (auto-tracks the company) → `["prepare", "<slug>", "--lang", "en"]` scaffolds the cover letter — draft it with the user, run prepare again to render, then `["status", "<slug>", "applied"]`.

Agent-only sources (no `crawl` spec) live in `sources.yaml` in `AMT_HOME` (default `~/.config/amt/`) under the unified `sources` list (`execute: agent`) — execute those yourself and feed findings via `["import", "<url>", "--company", "<name>", "--title", "<title>"]` (both flags required for manual; ATS URLs need none). Manage sources with `["sources", "add-channel", ...]`; re-judge loosened ledger cuts with `["reconsider"]`; `["suggest"]` proposes `companyBlocklist` additions from your cut history (propose to the user, never edit `profile.yaml` yourself).
