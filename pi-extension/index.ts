import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Deliberately thin: one tool that runs the globally installed amt CLI
// with an argv array (no shell, no injection) and returns its JSON stdout.
// The full command surface lives in the CLI; this wrapper never duplicates
// parameter plumbing — the mistake that broke the old cv-generator wrapper.

// @ts-ignore — provided by jiti runtime
const BASE = typeof __dirname !== "undefined" ? __dirname : new URL(".", import.meta.url).pathname;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "amt",
    label: "amt",
    description:
      "Run a amt CLI command and return its JSON result. Commands: doctor, crawl, "
      + "sources list|add <company>|remove <company>, import <url>, list [--status s], "
      + "status <slug> <status> [--reason r] [--cut-note n] [--score 0-100], show <slug>, "
      + "prepare <slug> [--lang de|en] [--no-pdf], index. Non-ATS finds (LinkedIn, StepStone): "
      + "import <url> --company <name> --title <title>. "
      + "Pass arguments as an array, e.g. [\"status\", \"acme-frontend\", \"shortlist\"].",
    parameters: Type.Object({
      args: Type.Array(Type.String(), {
        description: "CLI arguments, one array element per token.",
      }),
    }),
    async execute(_toolCallId, params) {
      try {
        const stdout = execFileSync("amt", [...params.args, "--json"], {
          encoding: "utf-8",
          timeout: 300_000,
        });
        return { content: [{ type: "text", text: stdout.trim() }], details: {} };
      } catch (err: any) {
        // The structured {error:{code,message}} envelope is on STDOUT.
        const stdout = typeof err?.stdout === "string" ? err.stdout.trim() : "";
        const stderr = typeof err?.stderr === "string" ? err.stderr.trim() : "";
        return {
          content: [
            {
              type: "text",
              text: `amt failed (exit ${err?.status ?? "?"}): ${stdout || stderr || err?.message || err}`,
            },
          ],
          details: {},
        };
      }
    },
  });

  pi.on("resources_discover", async () => {
    const skillPath = join(BASE, "SKILL.md");
    if (existsSync(skillPath)) {
      return { skillPaths: [skillPath] };
    }
  });
}
