# Changelog

## [0.2.9](https://github.com/fabkho/amt/compare/amt-0.2.8...amt-0.2.9) (2026-08-24)


### Features

* description debt ([#14](https://github.com/fabkho/amt/issues/14)) and drop find-new-jobs alias + naming ladder ([#21](https://github.com/fabkho/amt/issues/21)) ([#33](https://github.com/fabkho/amt/issues/33)) ([3491e1c](https://github.com/fabkho/amt/commit/3491e1c744a825941aa3eb2ade8e855f4d4619ee))

## [0.2.8](https://github.com/fabkho/amt/compare/amt-0.2.7...amt-0.2.8) (2026-08-24)


### Features

* review fixes — [#16](https://github.com/fabkho/amt/issues/16) [#17](https://github.com/fabkho/amt/issues/17) [#18](https://github.com/fabkho/amt/issues/18) [#19](https://github.com/fabkho/amt/issues/19) [#20](https://github.com/fabkho/amt/issues/20) [#24](https://github.com/fabkho/amt/issues/24) [#25](https://github.com/fabkho/amt/issues/25) ([#32](https://github.com/fabkho/amt/issues/32)) ([c5151ca](https://github.com/fabkho/amt/commit/c5151ca0ae5a3e14f0e8d0e40728470c3ae1e552))


### Bug Fixes

* location hard-filter recognizes city exonyms ([#15](https://github.com/fabkho/amt/issues/15)) ([#30](https://github.com/fabkho/amt/issues/30)) ([a0f20ac](https://github.com/fabkho/amt/commit/a0f20aceb58932c546607d9ca492306985e6c139))

## [0.2.7](https://github.com/fabkho/amt/compare/amt-0.2.6...amt-0.2.7) (2026-08-24)


### Features

* channel engine — the binary crawls channel recipes itself ([#26](https://github.com/fabkho/amt/issues/26)) ([#27](https://github.com/fabkho/amt/issues/27)) ([0472cc0](https://github.com/fabkho/amt/commit/0472cc0ecfb23949dfcba9f57a505195cacb3c45))


### Bug Fixes

* channel engine stringifies only scalar field values ([#29](https://github.com/fabkho/amt/issues/29)) ([26cc486](https://github.com/fabkho/amt/commit/26cc4867adccdcc6f265638b96fe503e1ae8d3d1))

## [0.2.6](https://github.com/fabkho/amt/compare/amt-0.2.5...amt-0.2.6) (2026-08-24)


### Features

* company logos in notes and the index table ([88c555d](https://github.com/fabkho/amt/commit/88c555d183fe6ce260cf29890ba38328953e05c5))
* daily inbox — one file per day, ranked, linked from the index ([dd5b1c6](https://github.com/fabkho/amt/commit/dd5b1c6cd9b61a0d8ab8d6352f0ce52676926682))
* daily-update prompt — the explicit daily verb ([2fa0384](https://github.com/fabkho/amt/commit/2fa038415b60f532eb91c18bdf034c48036dd9c9))
* ranking debt is data — unranked notes surface in every entry tool ([78ce794](https://github.com/fabkho/amt/commit/78ce794e7573f325faabe68d183dc85944edd723))
* unify crawl — one verb, full coverage ([c42a03b](https://github.com/fabkho/amt/commit/c42a03bda3bde4507d3d094d161dc61e02a99abf))


### Bug Fixes

* backfill logos on note refresh, not only on creation ([6c6a98a](https://github.com/fabkho/amt/commit/6c6a98a6f133e78ce28496c3beaea9cbef2117a2))
* slug de-collision uses the end of the nativeId ([43439db](https://github.com/fabkho/amt/commit/43439db23e5859353b1b99661379aef8b11510e4))

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
