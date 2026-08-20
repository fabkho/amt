# job-kit (pi wrapper)

Thin wrapper around the globally installed `job-kit` CLI — one `job_kit` tool taking an argv array, always returning JSON.

**Setup:** `pnpm add -g git+ssh://git@github.com/fabkho/job-kit.git`, then `job-kit doctor` (installs Chromium for PDFs) and `job-kit init` (profile + sources). Copy this directory to `~/.pi/agent/extensions/job-kit/` and `/reload`.

**Workflow:** `["crawl"]` fetches all sources (notes only for stack-relevant postings; the rest is remembered in the seen-ledger). `["list", "--status", "new"]` shows candidates to score. `["status", "<slug>", "shortlist"]` tracks the company automatically. `["prepare", "<slug>", "--lang", "en"]` scaffolds the cover letter — draft it with the user, run prepare again to render, then `["status", "<slug>", "applied"]`.

Agent channels (LinkedIn guest, StepStone) live in `~/.config/job-kit/sources.yaml` under `channels` — execute those yourself and feed findings via `["import", "<url>", "--company", "<name>", "--title", "<title>"]` (ATS URLs need no manual fields).
