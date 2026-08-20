<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

<!--AMT START-->

# amt specifics for agents

- **stdout is machine-readable.** Every CLI command supports `--json`; errors come as `{"error":{"code","message"}}` on stdout with exit 1. Exit 2 = findings (doctor). Diagnostics are on stderr.
- **State ownership:** `profile.yaml` in `AMT_HOME` is human-edited only — never rewrite it programmatically. `sources.yaml` and `seen.json` are tool-managed (use `amt sources add/remove`, never hand-edit). Job-note bodies: only the region between `<!-- job-kit:description -->` markers is machine-owned; text outside it is the user's.
- **Never run `amt init` from an agent** (TTY-interactive). Write `profile.yaml` directly instead (schema: `profile.schema.json` in `AMT_HOME`).
- Persist scoring via `amt status <slug> <status> --score N` or the MCP `set_job_status` tool (score/flags/assessment) — do not hand-edit frontmatter.
- Agent channels (LinkedIn guest, StepStone) in `sources.yaml` are data for YOU to execute; the tool never fetches them. Feed findings via `amt import <url> --company … --title …`.

<!--AMT END-->
