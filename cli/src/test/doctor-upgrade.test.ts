/**
 * Tests for doctor and upgrade command logic.
 * Tests args parsing, module check collection, and upgrade flag handling.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDoctorFlags, parseUpgradeFlags } from "../lib/args.js";
import { MODULE_SPECS, REAPPLY_KEYS, resolveOrder } from "../lib/modules.js";
import { runModule } from "../lib/runner.js";
import type { ModuleContext, ModuleEvent } from "../lib/types.js";

const LIB_PATH = join(import.meta.dir, "../../../modules/_lib.sh");

let tmpDir: string;

function ctx(): ModuleContext {
  return {
    username: "tester",
    userHome: "/home/tester",
    platform: "linux",
    wslVersion: null,
    config: {},
  };
}

function writeScript(name: string, body: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, `#!/usr/bin/env bash\nsource "${LIB_PATH}"\nread_context\n${body}`, { mode: 0o755 });
  return path;
}

async function collect(script: string, mode: "run" | "check" = "run") {
  const events: ModuleEvent[] = [];
  const iter = runModule(script, ctx(), mode);
  while (true) {
    const { value, done } = await iter.next();
    if (done) return { events, result: value };
    events.push(value);
  }
}

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "devlair-doctor-"));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Args parsing ────────────────────────────────────────────────────────────

describe("parseDoctorFlags", () => {
  test("returns fix=false by default", () => {
    expect(parseDoctorFlags([])).toEqual({ fix: false });
  });

  test("parses --fix flag", () => {
    expect(parseDoctorFlags(["--fix"])).toEqual({ fix: true });
  });

  test("ignores unknown flags", () => {
    expect(parseDoctorFlags(["--verbose", "--fix"])).toEqual({ fix: true });
  });
});

describe("parseUpgradeFlags", () => {
  test("returns noSelf=false by default", () => {
    expect(parseUpgradeFlags([])).toEqual({ noSelf: false });
  });

  test("parses --no-self flag", () => {
    expect(parseUpgradeFlags(["--no-self"])).toEqual({ noSelf: true });
  });
});

// ── Check mode protocol ─────────────────────────────────────────────────────

describe("check mode via runner", () => {
  test("collects json_check events", async () => {
    const script = writeScript(
      "check-ok.sh",
      `MODE=\${1:-run}
case "$MODE" in
  check)
    json_check "service running" "ok" "active"
    json_check "config present" "ok" "/etc/foo.conf"
    exit 0
    ;;
esac`,
    );
    const { events } = await collect(script, "check");
    expect(events).toContainEqual({ type: "check", label: "service running", status: "ok", detail: "active" });
    expect(events).toContainEqual({ type: "check", label: "config present", status: "ok", detail: "/etc/foo.conf" });
  });

  test("collects mixed check statuses", async () => {
    const script = writeScript(
      "check-mixed.sh",
      `MODE=\${1:-run}
case "$MODE" in
  check)
    json_check "installed" "ok" "yes"
    json_check "config" "warn" "outdated"
    json_check "service" "fail" "stopped"
    exit 0
    ;;
esac`,
    );
    const { events } = await collect(script, "check");
    const checks = events.filter((e) => e.type === "check");
    expect(checks).toHaveLength(3);
    expect(checks[0]).toMatchObject({ status: "ok" });
    expect(checks[1]).toMatchObject({ status: "warn" });
    expect(checks[2]).toMatchObject({ status: "fail" });
  });

  test("check mode does not emit result events", async () => {
    const script = writeScript(
      "check-noresult.sh",
      `MODE=\${1:-run}
case "$MODE" in
  check) json_check "foo" "ok" "bar"; exit 0 ;;
  run) json_result "ok" "done"; exit 0 ;;
esac`,
    );
    const { events } = await collect(script, "check");
    expect(events.filter((e) => e.type === "result")).toHaveLength(0);
    expect(events.filter((e) => e.type === "check")).toHaveLength(1);
  });
});

// ── REAPPLY_KEYS ─────────────────────────────────────────────────────────────

describe("REAPPLY_KEYS for doctor --fix", () => {
  test("contains expected reapply modules", () => {
    expect(REAPPLY_KEYS.has("zsh")).toBe(true);
    expect(REAPPLY_KEYS.has("shell")).toBe(true);
    expect(REAPPLY_KEYS.has("tmux")).toBe(true);
    expect(REAPPLY_KEYS.has("devtools")).toBe(true);
    expect(REAPPLY_KEYS.has("claude")).toBe(true);
  });

  test("does not contain non-reapply modules", () => {
    expect(REAPPLY_KEYS.has("system")).toBe(false);
    expect(REAPPLY_KEYS.has("tailscale")).toBe(false);
    expect(REAPPLY_KEYS.has("ssh")).toBe(false);
  });

  test("resolveOrder preserves dependency order for reapply keys", () => {
    const specs = resolveOrder(REAPPLY_KEYS, "linux");
    const keys = specs.map((s) => s.key);
    // shell depends on zsh
    if (keys.includes("shell") && keys.includes("zsh")) {
      expect(keys.indexOf("zsh")).toBeLessThan(keys.indexOf("shell"));
    }
    // claude depends on devtools
    if (keys.includes("claude") && keys.includes("devtools")) {
      expect(keys.indexOf("devtools")).toBeLessThan(keys.indexOf("claude"));
    }
  });
});

// ── Upgrade script protocol ─────────────────────────────────────────────────

describe("upgrade script protocol", () => {
  test("upgrade script emits progress and check events", async () => {
    const script = writeScript(
      "upgrade-mock.sh",
      `json_progress "updating packages"
json_check "system packages" "ok" "updated"
json_progress "upgrading tools"
json_check "GitHub CLI" "ok" "gh 2.x"
json_result "ok" "upgrade complete"
exit 0`,
    );
    const { events, result } = await collect(script, "run");
    expect(result.status).toBe("ok");
    expect(events).toContainEqual({ type: "progress", message: "updating packages" });
    expect(events).toContainEqual({ type: "check", label: "system packages", status: "ok", detail: "updated" });
    expect(events).toContainEqual({ type: "check", label: "GitHub CLI", status: "ok", detail: "gh 2.x" });
  });
});

// ── Doctor module filtering ─────────────────────────────────────────────────

describe("doctor module filtering", () => {
  test("filters modules by platform", () => {
    const linuxSpecs = MODULE_SPECS.filter((s) => s.platforms.has("linux"));
    const wslSpecs = MODULE_SPECS.filter((s) => s.platforms.has("wsl"));

    // linux has more modules than wsl
    expect(linuxSpecs.length).toBeGreaterThan(wslSpecs.length);

    // timezone, ssh, firewall are linux-only
    expect(linuxSpecs.find((s) => s.key === "timezone")).toBeDefined();
    expect(wslSpecs.find((s) => s.key === "timezone")).toBeUndefined();
  });
});
