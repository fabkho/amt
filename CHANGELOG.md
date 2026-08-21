# Changelog

## [0.2.1](https://github.com/fabkho/amt/compare/amt-0.2.0...amt-0.2.1) (2026-08-21)


### Features

* probable-duplicate detection, board pagination, truncation warning ([c77dc23](https://github.com/fabkho/amt/commit/c77dc23bba41ec5f01113f763a91945f2dc8a45c))

## [0.2.0](https://github.com/fabkho/amt/compare/amt-0.1.0...amt-0.2.0) (2026-08-20)


### ⚠ BREAKING CHANGES

* salary floor cuts only bands topping out below the floor
* profile is yaml — jiti, amt/config, and defineProfile retired
* rename job-kit to amt
* clearer wording across the crawl surface

### Features

* ashby adapter with structured compensation parsing ([730aceb](https://github.com/fabkho/amt/commit/730acebfa1d8a6d85eb6ffee1bc19f3e155e2499))
* claude code plugin, agent skills, and truthful docs ([8eb9241](https://github.com/fabkho/amt/commit/8eb924130ba725bfbe9b99ae6711108c27c2d772))
* company-history warning, cli assessments, board-noise filters ([cd1a59b](https://github.com/fabkho/amt/commit/cd1a59bdb3108b1899379474090a06a1ab69f915))
* cv and cover-letter rendering core ([477ccde](https://github.com/fabkho/amt/commit/477ccde7c65a4ec6e1a5b8584f9e24ac48670cd2))
* deterministic hard filters for postings ([5b68fff](https://github.com/fabkho/amt/commit/5b68fff54a74c406f3342fbae21da9340a570370))
* doctor warns when the deprecated /usr/sbin/amt shadows the CLI ([b4b09a6](https://github.com/fabkho/amt/commit/b4b09a6a12be988cfbdd716bdfb24c0e2e85e642))
* full cli — crawl, sources, import, list, status, show, apply, init ([05463b8](https://github.com/fabkho/amt/commit/05463b8a00c2a366d85638ddc28d1d746d8bbaeb))
* job notes with status tracking and index view ([2973ca6](https://github.com/fabkho/amt/commit/2973ca604ef1f9025cc5ee8450ecc33ecf06470f))
* mcp server with tools, job resources, and workflow prompts ([b336e36](https://github.com/fabkho/amt/commit/b336e36a7e83caa382da5d989c5005206b47cbf3))
* notes only for relevant postings, seen-ledger for the rest ([9a8ce83](https://github.com/fabkho/amt/commit/9a8ce837cf3a1b7c46c51e56c810be7a039ea851))
* rename job-kit to amt ([78a56f2](https://github.com/fabkho/amt/commit/78a56f2b2033076e26b433375baf40ec08425019))
* source adapters for six job APIs ([b284931](https://github.com/fabkho/amt/commit/b284931f620034499aa104da335c6f319ea269d4))
* thin pi-extension wrapper; fix empty JOB_KIT_HOME ([3fad8ce](https://github.com/fabkho/amt/commit/3fad8cededf1f2d166170d5b130159185f004595))
* typed user profile with defineProfile ([8b04b0f](https://github.com/fabkho/amt/commit/8b04b0f31c5bfc038fede43d167e6ef66469ee10))
* yield-ranked agent channels, vuejobs recipe, storage docs ([a9b10ad](https://github.com/fabkho/amt/commit/a9b10adde1effb0382878cb5a61cbb201b7d4c1d))


### Bug Fixes

* input validation at the cli edge, resilient note loading ([bf58781](https://github.com/fabkho/amt/commit/bf58781af9a0f6d908bd5847c3d6a9cf82a680f2))
* mcp surface speaks mcp — validator findings round two ([94b5964](https://github.com/fabkho/amt/commit/94b5964afb0c229a1bf7dc6e819e99a2085717b6))
* pi-review batch — lever full descriptions, structured ashby salaries ([527eddd](https://github.com/fabkho/amt/commit/527eddd7197b030d6748e296af644fac03e688b4))
* require Node &gt;=22 and build on install from git ([4a4f37c](https://github.com/fabkho/amt/commit/4a4f37cb1804a3daf35e9a3eae5c9c272e92dace))
* review findings — score persistence, note-body safety, crawl resilience ([0a82e64](https://github.com/fabkho/amt/commit/0a82e641091286b3aad615da86972e23a604d3b1))
* salary floor cuts only bands topping out below the floor ([62af276](https://github.com/fabkho/amt/commit/62af2768cf87a63cbc670264292705224f77ae4b))
* tolerate malformed arbeitnow entries instead of failing the board ([1e88700](https://github.com/fabkho/amt/commit/1e8870042f1741c76643a30c88b38e05d7d79512))
* word-boundary matching for stack relevance ([019a60e](https://github.com/fabkho/amt/commit/019a60eb39d41ec7e03fd3167074cde8eab17687))


### Code Refactoring

* clearer wording across the crawl surface ([8cc58ce](https://github.com/fabkho/amt/commit/8cc58ce9acc1f68db81d58fde7910593a4fc0fdd))
* profile is yaml — jiti, amt/config, and defineProfile retired ([0de264f](https://github.com/fabkho/amt/commit/0de264f59fcfbaf98414a62d40cd41ff3d2025e3))
