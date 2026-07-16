import { describe, expect, it } from "bun:test";

import { resolveInstallTarget, resolveModulesTarget } from "./self-update.js";

const HOME = "/Users/dev";
const USER_BIN = "/Users/dev/.devlair/bin";

describe("resolveInstallTarget", () => {
  it("updates in place with no sudo when the binary's dir is writable (Linux as root)", () => {
    const t = resolveInstallTarget({
      platform: "linux",
      execPath: "/usr/local/bin/devlair",
      home: "/root",
      pathEnv: "/usr/local/bin:/usr/bin",
      isWritableDir: () => true,
    });
    expect(t).toEqual({ path: "/usr/local/bin/devlair", allowSudo: false });
  });

  it("relocates to ~/.devlair/bin (no sudo) on macOS when it is on PATH", () => {
    const t = resolveInstallTarget({
      platform: "darwin",
      execPath: "/usr/local/bin/devlair",
      home: HOME,
      pathEnv: `${USER_BIN}:/usr/local/bin:/usr/bin`,
      isWritableDir: (dir) => dir === USER_BIN, // legacy /usr/local/bin not writable
    });
    expect(t).toEqual({
      path: `${USER_BIN}/devlair`,
      allowSudo: false,
      migrateFrom: "/usr/local/bin/devlair",
    });
  });

  it("tolerates a trailing slash on the PATH entry", () => {
    const t = resolveInstallTarget({
      platform: "darwin",
      execPath: "/usr/local/bin/devlair",
      home: HOME,
      pathEnv: `${USER_BIN}/:/usr/bin`,
      isWritableDir: () => false,
    });
    expect(t.path).toBe(`${USER_BIN}/devlair`);
    expect(t.allowSudo).toBe(false);
  });

  it("falls back to an in-place sudo update on macOS when ~/.devlair/bin is not on PATH", () => {
    const t = resolveInstallTarget({
      platform: "darwin",
      execPath: "/usr/local/bin/devlair",
      home: HOME,
      pathEnv: "/usr/local/bin:/usr/bin",
      isWritableDir: () => false,
    });
    expect(t.path).toBe("/usr/local/bin/devlair");
    expect(t.allowSudo).toBe(true);
    expect(t.migrateFrom).toBeUndefined();
    expect(t.note).toContain("devlair init");
  });

  it("does not relocate when already running from ~/.devlair/bin", () => {
    const t = resolveInstallTarget({
      platform: "darwin",
      execPath: `${USER_BIN}/devlair`,
      home: HOME,
      pathEnv: `${USER_BIN}:/usr/local/bin`,
      isWritableDir: (dir) => dir === USER_BIN,
    });
    expect(t).toEqual({ path: `${USER_BIN}/devlair`, allowSudo: false });
  });

  it("allows a sudo fallback on unelevated Linux with an unwritable dir", () => {
    const t = resolveInstallTarget({
      platform: "linux",
      execPath: "/usr/local/bin/devlair",
      home: "/home/dev",
      pathEnv: "/usr/local/bin:/usr/bin",
      isWritableDir: () => false,
    });
    expect(t).toEqual({ path: "/usr/local/bin/devlair", allowSudo: true });
  });
});

describe("resolveModulesTarget", () => {
  it("relocates to user-owned ~/.devlair on macOS (no sudo, no root-owned dir)", () => {
    const t = resolveModulesTarget({ platform: "darwin", home: "/Users/dev" });
    expect(t).toEqual({ dir: "/Users/dev/.devlair", allowSudo: false });
  });

  it("refreshes /usr/local/share/devlair in place on Linux (upgrade runs as root)", () => {
    const t = resolveModulesTarget({ platform: "linux", home: "/root" });
    expect(t).toEqual({ dir: "/usr/local/share/devlair", allowSudo: true });
  });

  it("lands the modules tree next to the relocated binary on macOS", () => {
    // Both the binary (~/.devlair/bin) and modules (~/.devlair/modules) live
    // under ~/.devlair, so uninstall's `rm -rf ~/.devlair` reverses both.
    const t = resolveModulesTarget({ platform: "darwin", home: "/Users/alice" });
    expect(`${t.dir}/modules`).toBe("/Users/alice/.devlair/modules");
  });
});
