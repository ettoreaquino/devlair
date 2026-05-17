import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createInitLogDir, moduleLogPath } from "../lib/logs.js";

let home: string;

beforeEach(() => {
  home = join(tmpdir(), `devlair-logs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(home, { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("createInitLogDir", () => {
  test("creates ~/.devlair/logs/init-<ts>/ with mode 0700", () => {
    const dir = createInitLogDir(home);
    const st = statSync(dir);
    expect(st.isDirectory()).toBe(true);
    expect(st.mode & 0o777).toBe(0o700);
    expect(dir.startsWith(join(home, ".devlair", "logs", "init-"))).toBe(true);
  });

  test("prunes older runs, keeping the 10 most recent", () => {
    const logsRoot = join(home, ".devlair", "logs");
    mkdirSync(logsRoot, { recursive: true });
    // Seed 12 fake older runs, mtimes spaced 1s apart so sort order is stable.
    for (let i = 0; i < 12; i++) {
      const name = `init-2025-01-01T00-00-${i.toString().padStart(2, "0")}Z`;
      const path = join(logsRoot, name);
      mkdirSync(path);
      writeFileSync(join(path, "marker"), name);
      const t = new Date(2025, 0, 1, 0, 0, i).getTime() / 1000;
      utimesSync(path, t, t);
    }
    createInitLogDir(home);
    const remaining = readdirSync(logsRoot)
      .filter((n) => n.startsWith("init-"))
      .sort();
    // 10 retained including the just-created one.
    expect(remaining.length).toBe(10);
    // The oldest seeded entries (00, 01) should be gone.
    expect(remaining.some((n) => n.endsWith("-00Z"))).toBe(false);
    expect(remaining.some((n) => n.endsWith("-01Z"))).toBe(false);
  });
});

describe("moduleLogPath", () => {
  test("resolves <runDir>/<key>.log", () => {
    const dir = createInitLogDir(home);
    expect(moduleLogPath(dir, "tailscale")).toBe(join(dir, "tailscale.log"));
  });

  test("runner writes module stderr to the log file", async () => {
    const { runModule } = await import("../lib/runner.js");
    const dir = createInitLogDir(home);
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
