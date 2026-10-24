/**
 * Tests for doctor and upgrade command logic.
 * Tests args parsing, module check collection, and upgrade flag handling.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDoctorFlags, parseUpgradeFlags } from "../lib/args.js";
import { createRunLogDir, moduleLogPath } from "../lib/logs.js";
import { MODULE_SPECS, REAPPLY_KEYS, resolveOrder } from "../lib/modules.js";
import { runModule } from "../lib/runner.js";
import type { ModuleContext, ModuleEvent } from "../lib/types.js";

const LIB_PATH = join(import.meta.dir, "../../modules/_lib.sh");

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

async function collect(script: string, mode: "run" | "check" = "run", logFile?: string) {
  const events: ModuleEvent[] = [];
  const iter = runModule(script, ctx(), mode, { logFile });
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

describe("json_step readback rows", () => {
  async function step(args: string) {
    const { events, result } = await collect(
      writeScript(
        `step-${Math.random().toString(36).slice(2)}.sh`,
        `json_step ${args}\necho "warned=$STEP_WARNED" >&2\nexit 0`,
      ),
    );
    return { row: events.find((e) => e.type === "check"), stderr: result.stderr };
  }

  test("same version before and after is ok and unchanged", async () => {
    const { row, stderr } = await step(`"uv" "0.4.1" "0.4.1" 0`);
    expect(row).toEqual({ type: "check", label: "uv", status: "ok", detail: "unchanged (0.4.1)" });
    expect(stderr).toContain("warned=0");
  });

  test("a version change is ok and shows from -> to", async () => {
    const { row } = await step(`"uv" "0.4.1" "0.5.0" 0`);
    expect(row).toEqual({ type: "check", label: "uv", status: "ok", detail: "0.4.1 -> 0.5.0" });
  });

  test("a fresh install shows none -> to", async () => {
    const { row } = await step(`"nvm + Node LTS" "" "22.11.0" 0`);
    expect(row).toMatchObject({ status: "ok", detail: "none -> 22.11.0" });
  });

  test("a failed step is warn with its reason and the version still in place", async () => {
    const { row, stderr } = await step(`"AWS CLI" "2.17.0" "2.17.0" 3 "signature did not verify; not installed"`);
    expect(row).toEqual({
      type: "check",
      label: "AWS CLI",
      status: "warn",
      detail: "signature did not verify; not installed; still 2.17.0",
    });
    expect(stderr).toContain("warned=1");
  });

  test("a failed step without a reason reports its exit code", async () => {
    const { row } = await step(`"Bun" "1.1.0" "" 7`);
    expect(row).toMatchObject({ status: "warn", detail: "upgrade failed (exit 7)" });
  });

  test("an unreadable version after a clean exit is warn", async () => {
    const { row } = await step(`"Bun" "1.1.0" "" 0`);
    expect(row).toMatchObject({ status: "warn", detail: "version unreadable after upgrade" });
  });
});

describe("upgrade warn path", () => {
  test("a failing step surfaces as warn rows and result, with stderr in a 0700 upgrade- log dir", async () => {
    const home = mkdtempSync(join(tmpdir(), "devlair-upgrade-log-"));
    try {
      const runDir = createRunLogDir(home, "upgrade-");
      expect(runDir.startsWith(join(home, ".devlair", "logs", "upgrade-"))).toBe(true);
      expect(statSync(runDir).mode & 0o777).toBe(0o700);

      const script = writeScript(
        "upgrade-warn.sh",
        `json_step "GitHub CLI" "2.40.0" "2.41.0" 0
rc=0; ( echo "E: mock apt failure" >&2; exit 100 ) || rc=$?
json_step "system packages" "" "" "$rc" "apt-get upgrade failed (exit $rc)"
[[ $STEP_WARNED -eq 1 ]] && json_result "warn" "upgrade finished with warnings" || json_result "ok" "upgrade complete"
exit 0`,
      );
      const logFile = moduleLogPath(runDir, "upgrade");
      const { events } = await collect(script, "run", logFile);

      expect(events).toContainEqual({ type: "check", label: "GitHub CLI", status: "ok", detail: "2.40.0 -> 2.41.0" });
      expect(events).toContainEqual({
        type: "check",
        label: "system packages",
        status: "warn",
        detail: "apt-get upgrade failed (exit 100)",
      });
      expect(events).toContainEqual({ type: "result", status: "warn", detail: "upgrade finished with warnings" });
      expect(readFileSync(logFile, "utf8")).toContain("E: mock apt failure");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

const hasGpg = spawnSync("gpg", ["--version"]).status === 0;

describe.skipIf(!hasGpg)("verify_gpg_sig", () => {
  const KEY_PATH = join(import.meta.dir, "../../modules/configs/aws-cli-public-key.asc");

  function bash(script: string) {
    return spawnSync("bash", ["-c", `source "${LIB_PATH}"\nset +e\n${script}`], { encoding: "utf8" });
  }

  test("the vendored AWS key matches the pinned fingerprint", () => {
    const out = spawnSync("gpg", ["--batch", "--with-colons", "--show-keys", KEY_PATH], { encoding: "utf8" }).stdout;
    const fpr = out
      .split("\n")
      .find((l) => l.startsWith("fpr:"))
      ?.split(":")[9];
    const pinned = bash('echo "$AWS_CLI_GPG_FPR"').stdout.trim();
    expect(fpr).toBe(pinned);
  });

  test("accepts only a signature by the pinned key", () => {
    // Throwaway signing key: proves the helper checks the primary fingerprint,
    // not just that some imported key produced a good signature.
    const r = bash(`
      g=$(mktemp -d); d=$(mktemp -d)
      gpg --homedir "$g" --batch --passphrase '' --quick-gen-key "devlair test <t@example.invalid>" ed25519 sign never 2>/dev/null
      fpr=$(gpg --homedir "$g" --with-colons --list-keys | awk -F: '/^fpr:/ {print $10; exit}')
      gpg --homedir "$g" --armor --export > "$d/key.asc"
      echo payload > "$d/file"
      gpg --homedir "$g" --batch --detach-sign -o "$d/file.sig" "$d/file" 2>/dev/null
      verify_gpg_sig "$d/file" "$d/file.sig" "$d/key.asc" "$fpr"; echo "good=$?"
      verify_gpg_sig "$d/file" "$d/file.sig" "$d/key.asc" "$AWS_CLI_GPG_FPR"; echo "wrongfpr=$?"
      echo tampered >> "$d/file"
      verify_gpg_sig "$d/file" "$d/file.sig" "$d/key.asc" "$fpr"; echo "tampered=$?"
      verify_gpg_sig "$d/file" "$d/missing.sig" "$d/key.asc" "$fpr"; echo "nosig=$?"
      rm -rf "$g" "$d"
    `);
    expect(r.stdout).toContain("good=0");
    expect(r.stdout).toContain("wrongfpr=1");
    expect(r.stdout).toContain("tampered=1");
    expect(r.stdout).toContain("nosig=1");
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
