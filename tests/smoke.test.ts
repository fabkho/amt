import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { JobKitError, toErrorMessage } from "../src/index.js";

describe("core errors", () => {
  it("carries a machine-readable code", () => {
    const err = new JobKitError("PROFILE_NOT_FOUND", "no profile.yaml");
    expect(err.code).toBe("PROFILE_NOT_FOUND");
    expect(toErrorMessage(err)).toBe("no profile.yaml");
  });

  it("stringifies non-Error values", () => {
    expect(toErrorMessage("boom")).toBe("boom");
  });
});

// Pins shebang + bundling of the actual shipped artifact. CI builds before
// testing, so dist/ must exist there; locally the test skips with a hint.
describe("built CLI artifact", () => {
  it.skipIf(!existsSync("dist/bin.mjs"))("reports its version with exit 0", () => {
    const result = spawnSync(process.execPath, ["dist/bin.mjs", "--version"], {
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it.skipIf(!existsSync("dist/bin.mjs"))("doctor reports findings honestly on an empty home", () => {
    // A controlled empty home: profile missing → ok:false and gate exit 2,
    // regardless of what the developer's real ~/.config/job-kit contains.
    const result = spawnSync(process.execPath, ["dist/bin.mjs", "doctor", "--no-install"], {
      encoding: "utf-8",
      env: { ...process.env, JOB_KIT_HOME: mkdtempSync(join(tmpdir(), "job-kit-doctor-")) },
    });
    expect(result.status).toBe(2);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; profile: string; next: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.profile).toBe("missing");
    expect(parsed.next).toContain("init");
  });
});
