---
name: amt
description: Job-search workflow via the amt CLI — crawl sources, score candidates, prepare applications (CV + cover letter). Use when the user wants to search jobs, review candidates, or apply.
---

# amt (pi wrapper)

Thin wrapper around the globally installed `amt` CLI — one `amt` tool taking an argv array, always returning JSON.

**Setup:** `pnpm add -g @fabkho/amt`, then `amt doctor` (installs Chromium for PDFs) and `amt init` (profile + sources). Copy this directory to `~/.pi/agent/extensions/amt/` and `/reload`.

**Workflow:** `["crawl"]` fetches all sources (notes only for stack-relevant postings; the rest is remembered in the seen-ledger). `["list", "--status", "new"]` shows candidates to score. `["status", "<slug>", "shortlist"]` tracks the company automatically. `["prepare", "<slug>", "--lang", "en"]` scaffolds the cover letter — draft it with the user, run prepare again to render, then `["status", "<slug>", "applied"]`.

Agent channels (LinkedIn guest, StepStone) live in `sources.yaml` in `AMT_HOME` (default `~/.config/amt/`) under `channels` — execute those yourself and feed findings via `["import", "<url>", "--company", "<name>", "--title", "<title>"]` (ATS URLs need no manual fields).
