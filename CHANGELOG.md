# Changelog

## [0.2.5](https://github.com/fabkho/amt/compare/amt-0.2.4...amt-0.2.5) (2026-08-24)


### Features

* init asks for stack keywords and seeds hydrated channel recipes ([18c93cc](https://github.com/fabkho/amt/commit/18c93cc378633de035eebf3378acb1e91353747a))

## [0.2.4](https://github.com/fabkho/amt/compare/amt-0.2.3...amt-0.2.4) (2026-08-24)


### Features

* manage agent channels through the tools ([96d95e8](https://github.com/fabkho/amt/commit/96d95e811c0c99795ed00bb0afe327c06260f42a))
* render the notes index as rank-sorted tables ([ec12f2e](https://github.com/fabkho/amt/commit/ec12f2e635340db4097d64c01f164fe255d088ff))

## [0.2.3](https://github.com/fabkho/amt/compare/amt-0.2.2...amt-0.2.3) (2026-08-23)


### Features

* placement buckets and score ranking in the notes index ([aed5408](https://github.com/fabkho/amt/commit/aed540899ad478233a145f619edc0d1bcd6165ad))

## [0.2.2](https://github.com/fabkho/amt/compare/amt-0.2.1...amt-0.2.2) (2026-08-23)


### Features

* arbeitsagentur board adapter — Bundesagentur für Arbeit Jobsuche ([e032c16](https://github.com/fabkho/amt/commit/e032c161831d9427dcfa895c38e814a11f7435d3))


### Bug Fixes

* match keywords against visible text, not raw HTML ([93470cd](https://github.com/fabkho/amt/commit/93470cd054cb4ebbce7d6dc4789cdeaa402e0cc6))

## [0.2.1](https://github.com/fabkho/amt/compare/amt-0.2.0...amt-0.2.1) (2026-08-21)


### Features

* amt 0.2.0 — das Amt ist eröffnet ([85438e3](https://github.com/fabkho/amt/commit/85438e309fd6c18d04c15a3deb2ee01a83010a23))
* publish to npm as @fabkho/amt ([51885b1](https://github.com/fabkho/amt/commit/51885b1c215ff5281fa387b044c9de29b9b8aaa5))

## 0.2.0 (2026-08-20)

Initial public release. One day, one office:

- Deterministic core: 6 ATS adapters (Recruitee, Ashby, Greenhouse, Lever, Personio, SmartRecruiters) + the Arbeitnow board, per-item tolerant parsing, seen-ledger, hard filters, fuzzy duplicate detection.
- One markdown note per relevant posting — human text and statuses survive every crawl.
- `prepare`: CV + cover letter (Nunjucks → Chromium PDF) into an upload-ready folder.
- MCP server with nine tools, `job://` resources, and two workflow prompts; Claude Code plugin, Agent Skills, pi wrapper.
- Reviewed by six independent agent passes; 88 tests.
