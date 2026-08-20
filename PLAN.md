# job-kit — Implementation Plan

> Konsolidiert aus fünf Scout-Reports (the-i18n-kit-Analyse, Bestandsinventur, Toolchain-Recherche, Job-API-Verifikation, TS-PDF-Rendering-Recherche), alle tragenden Aussagen unabhängig validiert (Stand 2026-08-20).
>
> **Sprachentscheidung: TypeScript.** Das ursprüngliche Python-Argument (WeasyPrint als einziger Renderer für CSS-Paged-Media-Margin-Boxes) ist seit Chrome 131 hinfällig: `@bottom-right { content: … counter(page) " / " counter(pages) }` rendert nativ in Chromium — **empirisch verifiziert** mit dem unveränderten Shopware-CV-HTML gegen lokales Chrome 151 (Footer „Page 1 / 2" korrekt, Layout praktisch identisch zu WeasyPrint). Damit gewinnt TS: Fabians Sprache, i18n-kit-Muster und -Tooling übertragen sich wörtlich, Kollegen (Webentwickler) haben Node ohnehin.

**Was:** CLI + MCP-Server (+ dünner pi-Wrapper) für den kompletten Bewerbungs-Workflow: Jobs crawlen → Job-Notes mit Status pflegen → CV & Anschreiben rendern (PDF/txt/md/html) in einen Upload-Ordner. Mehrbenutzerfähig über `profile.yaml` pro Person.

**Architekturprinzip (aus the-i18n-kit):** Deterministischer Kern als plain functions, Urteils- und Schreibarbeit beim Agenten. Kein Core-Package-Split — ein Package mit kuratierter öffentlicher API, CLI und MCP als Präsentationsschichten.

---

## Entscheidungen (validiert)

| Frage | Entscheidung | Beleg |
|---|---|---|
| Sprache | **TypeScript** | PDF-Argument empirisch entkräftet (s. o.) |
| PDF-Rendering | **Playwright `page.pdf()`** auf Chromium ≥131 (`preferCSSPageSize: true`, `printBackground: true`, `displayHeaderFooter: false`); ~20 Zeilen Renderer | Chrome-151-Test mit echtem CV-HTML; Chrome-Blog „print-margins" |
| PDF-Fallback | Vivliostyle CLI (volle Paged-Media-Abdeckung, aktiv), falls je Chromium-Lücken (string-set etc.) relevant werden — Preis: AGPL. paged.js (stagnant) und Typst (Template-Rewrite) verworfen | TS-PDF-Scout, Quellen geprüft |
| Struktur | **Ein Package** (kein Monorepo-Split — job-kit wird nicht einzeln auf npm publiziert), `src/` mit `core/`, `cli/`, `mcp/`, `templates/`; **zwei Bins**: `job-kit` (CLI) und `job-kit-mcp` (Server, damit MCP-Client-Config ein nacktes Kommando bleibt) | i18n-kit-Erkenntnis: CLI-Package *ist* der Core |
| CLI-Framework | **citty** (wie i18n-kit: `bin.ts` → `cli.ts` → lazy Command-Registry, `createCommand`-Factory) | vom User gesetzt; Muster verifiziert in `packages/cli/src/commands/_shared.ts` |
| MCP-SDK | `@modelcontextprotocol/server` **v2** (identisch zu i18n-kit; Registrierungsmuster, `jsonContent`/`toolErrorResponse`, Schema-Fragment-Factories wiederverwenden) | in i18n-kit `packages/mcp/package.json` verifiziert |
| Templating | **Nunjucks** (Jinja2-Port; bestehende Templates portieren mit minimalen Edits) | TS-PDF-Scout |
| Validierung | **zod v4** — doppelt genutzt wie im i18n-kit: `profile.yaml`-Schema *und* MCP-Input-Schemas; JSON-Schema für Editor-Autocomplete generiert | i18n-kit-Muster |
| Frontmatter | gray-matter (o. ä.) für Job-Notes | Standard |
| Tooling | **Vite+ 0.2.9** (`vp` als lokales Package-Bin — CI braucht keinen Installer): `vp pack` (tsdown-basiert, Build), `vp test` (Vitest), `vp lint` (Oxlint **inkl. type-aware Linting via tsgolint**), `vp fmt` (Oxfmt) — alles in **einer** `vite.config.ts`. Die stdout-Disziplin aus dem i18n-kit = `no-console` global + Override für die Logger-Datei. Dazu: `tsc --noEmit` als eigener Typecheck-Schritt, husky + commitlint (von `vp migrate` bewusst unangetastet gelassen), release-please (node), **fallow** (`gate: "new-only"` gegen die git merge-base — kein Baseline-File nötig bei Greenfield) | vp-migrate-Lauf + Pipeline lokal verifiziert 20.08.2026 |
| Vite+ | **Adoptiert (User-Entscheidung, 20.08.2026)** trotz Alpha-Status: `vp migrate` hat oxlint-Config, Scripts und Deps sauber konvertiert (nur der tsdown-Merge in `vite.config.ts` war manuell); Pipeline und Global-Install danach unverändert grün. Bekanntes Risiko: Alpha-Breaking-Changes — abgefedert durch Catalog-Pinning auf exakt 0.2.9 in `pnpm-workspace.yaml` | voidzero.dev-Announcements + eigener Migrationslauf |
| Verteilung | Privates Repo; Kollegen: `pnpm add -g git+ssh://…` (oder npm), danach `job-kit doctor` prüft/installiert Chromium (`playwright install chromium`, ~300 MB) | — |

## Wörtlich übernehmbare i18n-kit-Muster

- Exit-Codes: **0** sauber / **1** Tool kaputt / **2** Findings; 1 schlägt 2; deklarative Gates (`--fail-on-x`).
- **stdout = nur Ergebnis, stderr = alles andere** (consola auf stderr, stdout-Guard); `json_mode = --json or !isTTY`; Fehler in JSON-Mode als parsebares `{error:{code,message}}`.
- `createCommand`-Factory (~15 Zeilen pro Kommando); Dry-run-Default `true` für destruktive Ops; `init` schreibt nur Nicht-Ableitbares, überschreibt nie ohne `--force`.
- `discover` als dokumentierter Erstaufruf; MCP: snake_case-Tools, agentengerichtete Descriptions, **Prompts für Mehrschritt-Workflows**, Resources `job://{slug}`; Env-Kontrakt `JOB_KIT_HOME`.
- Tests: In-Process (InMemoryTransport) **plus Child-Process-Test gegen das gebaute Artefakt über echtes stdio** mit mkdtemp-Fixtures; Fixture-Playgrounds (aufgezeichnete API-Payloads pro Quelle, bewusst unvollständig).
- README-Form: Problem → How It Works → Quick Start; CONTRIBUTING mit annotiertem Source-Tree; `spike/` für Wegwerf-Evaluationen mit Messprotokoll.

## Datenmodell (aus Bestandsinventur)

1. **`profile.yaml`** (pro Person, `JOB_KIT_HOME`, zod-validiert, JSON-Schema publiziert): identity (Name, Kontakt, Rollen-/Sprachzeilen de/en), search (stacks_primary/secondary, stack_rule „max eine Seite gewechselt", locations mit min. HO-Tagen, **ein** salary_floor + salary_target — löst die drei widersprüchlichen Werte 65/68/75k auf, seniority, max_years_required, company_types_blocked, title_blocklist, max_age_days, sources), tone (salutation/signoff de/en, Regeln), paths (notes_dir, output_base, cv_data_dir).
2. **Job-Note** (`<notes_dir>/jobs/<slug>.md`, Frontmatter): company, slug, title, url, source, stack[], location, remote|hybrid|onsite, ho_days, salary_min/max (ints), years_required, published_at, discovered_at, **status: new|shortlist|applied|interview|rejected|cut**, score, flags[], cut_reason (Enum) + cut_note, application{folder,lang,applied_at}. Dedupe-Key `source:native_id`. „Nicht erneut melden" = **Query** über status statt dreier handgepflegter Listen. `_Baseline.md`/Tagesreports werden **generierte Views**.
3. **Output-Ordner-Kontrakt** (`<output_base>/<slug>/`): `job.yaml` (Snapshot), `config.yaml`, `cover-letter.<lang>.md` (editierbare Quelle) → generiert `.txt`, `.html`, `Cover_Letter_<Name>.pdf`; `cv.<lang>.html` → `CV_<Name>.pdf`; `attachments/`. Beendet die verifizierte Namensdrift (3 Schemata in Alt-Ordnern).

## Zu behebende Alt-Bugs (verifiziert)

- `index.ts` (cv-generator): 5 deklarierte Override-Params nie weitergereicht; `job` unsaniert in `execSync` → neuer Wrapper mit `spawnSync(argv[])`.
- `settings.yaml` wird geladen und verworfen (toter Code).
- Flacher Config-Merge `{**data, **config}` → Deep-Merge, damit Job-Configs einzelne Bullets patchen können.
- `themes/personal-en/` = 194-Zeilen-Fork mit 7 geänderten Strings → **ein** Nunjucks-Template + `labels.<lang>.yaml`; Anschreiben-CSS als geteiltes Partial mit dem CV-Theme (Tokens identisch, heute copy-paste).
- Job-Metadaten nur in `#`-Kommentaren der Configs → echte Felder aus der Job-Note.

## Quellen fürs Crawling (alle live verifiziert, ohne Auth)

| Quelle | Endpoint | Besonderheit |
|---|---|---|
| Recruitee | `<co>.recruitee.com/api/offers/` | reichstes Schema, explizite remote/hybrid-Bools, de/en-Translations |
| Greenhouse | `boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true` | HTML escaped; remote nur aus location-String |
| Lever | `api.lever.co/v0/postings/<co>?mode=json` | `workplaceType` explizit; createdAt in **epoch-ms** |
| Personio | `<co>.jobs.personio.de/xml` | XML; Beschreibung teils leer → Jobseite verlinken |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/<co>/postings` | remote **und** hybrid-Bool; Beschreibung = 2. Request; unbekannte Firma = 200 mit totalFound:0! |
| **Arbeitnow** | `www.arbeitnow.com/api/job-board-api` | deutschlandfokussiert, remote-Bool, stündlich, 175/Seite |
| HN Who's hiring | Algolia `search_by_date?tags=comment,story_<id>` | Freitext, Keyword-Grep |
| RemoteOK / WWR RSS | `remoteok.com/api` / WWR-RSS | Ergänzung; RemoteOK verlangt Link-Attribution |

ATS-Discovery: Slug-Varianten proben + Careers-Seite nach ATS-Hosts greppen (Adapter-Registry mit Confidence-Scores wie i18n-kit-Adapters). **LinkedIn/StepStone/Indeed: nicht im ausgelieferten Tool** (ToS/Bot-Schutz); die verifizierten Guest-Rezepte aus `~/.agents/skills/workflow/job-search/SKILL.md` bleiben in der Agent-Prompt-Schicht für den persönlichen Gebrauch.

---

## Phasen

### Phase 1 — Repo & Tooling
Neues privates Repo `job-kit`. pnpm-Single-Package, `src/`-Layout, zwei Bins (`bin/job-kit`, `bin/job-kit-mcp` via `package.json#bin`), tsdown-Build, vitest, oxlint-Config (`no-console` + Logger-Override) + `tsconfig.base`-Strict-Flags + husky/commitlint (Strict-Flags und Hooks aus i18n-kit übernehmen), CI-Workflow (lint → build → typecheck → test → `fallow audit`, concurrency + cancel), release-please-Config (node, ein Component), `.mcp.json` (project-scope), Bootstrap-Doku für Kollegen (Node + `pnpm add -g git+ssh://…` + `job-kit doctor`), README-Skelett, CONTRIBUTING. **Exit:** Global-Install aus dem Repo liefert beide funktionierenden (leeren) Bins; CI grün.

### Phase 2 — Core (`src/core/`, plain functions, keine CLI/MCP-Awareness)
`profile.ts` (zod-Schema, Laden/Validieren, JSON-Schema-Export) · `notes.ts` (Note-CRUD via Frontmatter, Dedupe, Status, generierte Views) · `sources/` (Adapter-Registry mit Confidence-Probing; 5 ATS + Arbeitnow zuerst, HN/RemoteOK/WWR danach; Normalisierung aufs Job-Schema, `raw` mitspeichern) · `render.ts` (Nunjucks-Port der Jinja2-Templates — ein Template + Label-Dateien statt personal/personal-en-Fork; Playwright-PDF-Renderer; Letter-Pipeline aus einem Modell `{subject, salutation, paragraphs[], signoff}` → md/txt/html/pdf; Config-Snapshot in den Output-Ordner) · `match.ts` (nur harte Filter deterministisch: salary_floor, „5+ Jahre"-Regex, Blocklisten; Scoring bleibt beim Agenten) · typisierte Errors (ToolError-Muster). Fixtures: aufgezeichnete API-Payloads + Beispiel-cv-data. **Exit:** vitest deckt jeden Adapter + beide Renderer gegen Fixtures ab; CV-PDF **visuell äquivalent** zum heutigen Shopware-Output (Chrome-151-Test war die Vorlage; einmaliger Diff-Pass wegen Blink-vs-WeasyPrint-Typografie).

### Phase 3 — CLI, dann MCP
CLI (citty, `createCommand`-Factory): `init` · `doctor` (Chromium/Profil-Check, installiert Playwright-Browser bei Bedarf) · `crawl` · `sources add|remove|list` · `import <url>` · `list` · `status <slug> <st>` · `show <slug>` · `apply <slug>` (Ordner + Rendern) · `render-cv` / `render-letter` · `views`. Konventionen: Exit-Codes 0/1/2, stdout/stderr-Trennung, `--json`, Dry-run-Defaults.

**Quellenliste (Design-Entscheidung 20.08., verfeinert):** Die Crawl-Liste lebt in einer tool-verwalteten `sources.yaml` in `JOB_KIT_HOME` (NICHT in der handeditierten `profile.config.ts`; das `sources`-Feld im Profil-Schema entfällt). Sie hat zwei Hälften mit unterschiedlicher Pflege:
- **Boards/Portale (wenige, stabil):** werden im `init`-Dialog geseedet („Welche Boards crawlen?" — Arbeitnow als Default-Vorschlag, später RemoteOK/WWR/HN). `crawl` selbst ist NIE interaktiv (Agent-/Cron-sicher); leere Liste → strukturierter Hinweis auf `init`/`sources add`.
- **Firmen/ATS (viele, dynamisch):** wachsen **organisch** — `shortlist`, `apply` und `import` proben automatisch das ATS der betreffenden Firma (5 API-Muster + Careers-Seiten-Grep) und nehmen sie in die Beobachtung auf (per Profil-Option abschaltbar). `sources add|remove|list` für manuelle Pflege; `add` macht die Discovery immer mit — niemand rät Slugs. Optional nennt `init` ein paar Startfirmen.
Danach MCP (`src/mcp/server.ts`, dünn über der Core-API): Tools `discover`, `crawl_jobs`, `import_job`, `list_jobs`, `set_job_status`, `render_letter`, `generate_application`; Resource `job://{slug}`; **Prompts** `find-new-jobs` (crawl → Filter → Score → Notes aktualisieren) und `write-application` (Note + Tonregeln lesen → Entwurf im Chat → iterieren → apply). **Exit:** stdio-Child-Process-Test gegen `dist/` grün; Workflow einmal end-to-end in Claude Code durchgespielt.

### Phase 4 — pi-Extension (dünn) & Migration
pi-Wrapper: `spawnSync` aufs CLI (argv-Array, Params vollständig durchgereicht), SKILL.md via `resources_discover`. Migration: einmaliger Import der Obsidian-Tabellen in Job-Notes (envelio/Shopware/Octopus mit Status `applied`); alte Bewerbungsordner bleiben unangetastet (Legacy); `~/.agents/skills/workflow/job-search/SKILL.md` wird auf die Agent-Kanäle (LinkedIn/StepStone) reduziert, Filter/Blocklisten wandern in `profile.yaml`. cv-generator-Extension danach stilllegen (WeasyPrint-Abhängigkeit entfällt komplett).

### Phase 5 — später
Statisches `dashboard.html` aus den Notes (lokal, kein Hosting); danach ggf. UI-Ausbau. Optionaler Spike (im `spike/`-Ordner, mit Messprotokoll): Bundesagentur-für-Arbeit-API (offiziell, statischer Key — vielversprechend, unverifiziert).

## Offene Entscheidungen

1. Repo-Host/Name: `github.com/fabkho/job-kit` privat? (Kollegen brauchen Zugriff für den Git-Install.)
2. Migrationstiefe: nur offene Kandidaten importieren oder auch die komplette CUT-Historie?
