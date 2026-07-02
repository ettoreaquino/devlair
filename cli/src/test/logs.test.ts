import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRunLogDir, moduleLogPath } from "../lib/logs.js";

let home: string;

beforeEach(() => {
  home = join(tmpdir(), `devlair-logs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(home, { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("createRunLogDir", () => {
  test("creates ~/.devlair/logs/init-<ts>/ with mode 0700", () => {
    const dir = createRunLogDir(home);
    const st = statSync(dir);
    expect(st.isDirectory()).toBe(true);
    expect(st.mode & 0o777).toBe(0o700);
    expect(dir.startsWith(join(home, ".devlair", "logs", "init-"))).toBe(true);
  });

  test("uses the given prefix for the run directory name", () => {
    const dir = createRunLogDir(home, "doctor-");
    expect(dir.startsWith(join(home, ".devlair", "logs", "doctor-"))).toBe(true);
  });

  test("prunes older runs, keeping the 10 most recent", () => {
    const logsRoot = join(home, ".devlair", "logs");
    mkdirSync(logsRoot, { recursive: true });
    // Seed 12 fake older runs. Pruning sorts by directory name (the ISO-8601
    // run timestamp), so recency is encoded in the name alone — no mtime needed.
    for (let i = 0; i < 12; i++) {
      mkdirSync(join(logsRoot, `init-2025-01-01T00-00-${i.toString().padStart(2, "0")}Z`));
    }
    // Explicit `now` newer than every seed (00..11) so the result is
    // deterministic regardless of the wall clock.
    createRunLogDir(home, "init-", new Date(Date.UTC(2025, 0, 1, 0, 0, 30)));
    const remaining = readdirSync(logsRoot)
      .filter((n) => n.startsWith("init-"))
      .sort();
    // 10 retained including the just-created one.
    expect(remaining.length).toBe(10);
    // The three oldest seeds (00, 01, 02) should be pruned.
    expect(remaining.some((n) => n.endsWith("-00Z"))).toBe(false);
    expect(remaining.some((n) => n.endsWith("-01Z"))).toBe(false);
    expect(remaining.some((n) => n.endsWith("-02Z"))).toBe(false);
    // The just-created run is retained.
    expect(remaining.some((n) => n.endsWith("-30Z"))).toBe(true);
  });

  test("pruning is scoped per prefix — doctor runs never evict init runs", () => {
    const logsRoot = join(home, ".devlair", "logs");
    mkdirSync(logsRoot, { recursive: true });
    // Seed 12 init runs, then create 12 doctor runs. Each prefix prunes to 10
    // independently, so the init history must be untouched by doctor pruning.
    for (let i = 0; i < 12; i++) {
      mkdirSync(join(logsRoot, `init-2025-01-01T00-00-${i.toString().padStart(2, "0")}Z`));
    }
    for (let i = 0; i < 12; i++) {
      createRunLogDir(home, "doctor-", new Date(Date.UTC(2025, 0, 2, 0, 0, i)));
    }
    const initRuns = readdirSync(logsRoot).filter((n) => n.startsWith("init-"));
    const doctorRuns = readdirSync(logsRoot).filter((n) => n.startsWith("doctor-"));
    expect(initRuns.length).toBe(12); // untouched by doctor pruning
    expect(doctorRuns.length).toBe(10); // doctor pruned to KEEP_RUNS
  });
});

describe("moduleLogPath", () => {
  test("resolves <runDir>/<key>.log", () => {
    const dir = createRunLogDir(home);
    expect(moduleLogPath(dir, "tailscale")).toBe(join(dir, "tailscale.log"));
  });

  test("runner writes module stderr to the log file", async () => {
    const { runModule } = await import("../lib/runner.js");
    const dir = createRunLogDir(home);
    const script = join(home, "noisy.sh");
    writeFileSync(script, '#!/usr/bin/env bash\necho "line one" >&2\necho "line two" >&2\n', { mode: 0o755 });
    const logFile = moduleLogPath(dir, "noisy");
    const iter = runModule(
      script,
      { username: "t", userHome: home, platform: "linux", wslVersion: null, config: {} },
      "run",
      { logFile },
    );
    while (true) {
      const { done } = await iter.next();
      if (done) break;
    }
    const contents = readFileSync(logFile, "utf8");
    expect(contents).toContain("line one");
    expect(contents).toContain("line two");
    const st = statSync(logFile);
    expect(st.mode & 0o777).toBe(0o600);
  });
});
