import { describe, expect, it } from "bun:test";

import { resolveInstallTarget } from "./self-update.js";

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
