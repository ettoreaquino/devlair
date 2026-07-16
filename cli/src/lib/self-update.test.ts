import { describe, expect, it } from "bun:test";

import { createHash } from "node:crypto";

import { resolveInstallTarget, resolveModulesTarget, verifyChecksum } from "./self-update.js";

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
  it("relocates to user-owned ~/.devlair on macOS (no root-owned dir)", () => {
    const t = resolveModulesTarget({ platform: "darwin", home: "/Users/dev" });
    expect(t).toEqual({ dir: "/Users/dev/.devlair" });
  });

  it("refreshes /usr/local/share/devlair in place on Linux (upgrade runs as root)", () => {
    const t = resolveModulesTarget({ platform: "linux", home: "/root" });
    expect(t).toEqual({ dir: "/usr/local/share/devlair" });
  });

  it("lands the modules tree next to the relocated binary on macOS", () => {
    // Both the binary (~/.devlair/bin) and modules (~/.devlair/modules) live
    // under ~/.devlair, so uninstall's `rm -rf ~/.devlair` reverses both.
    const t = resolveModulesTarget({ platform: "darwin", home: "/Users/alice" });
    expect(`${t.dir}/modules`).toBe("/Users/alice/.devlair/modules");
  });
});

describe("verifyChecksum", () => {
  const buf = Buffer.from("devlair release artifact");
  const sum = createHash("sha256").update(buf).digest("hex");
  const checksums = `${sum}  modules.tar.gz\ndeadbeef${"0".repeat(56)}  other-file\n`;

  it("accepts a matching checksum for the named file", () => {
    expect(verifyChecksum(buf, "modules.tar.gz", checksums)).toBe(true);
  });

  it("rejects when the file's entry is missing", () => {
    expect(verifyChecksum(buf, "not-listed.tar.gz", checksums)).toBe(false);
  });

  it("rejects a mismatched checksum (tampered artifact)", () => {
    expect(verifyChecksum(Buffer.from("tampered"), "modules.tar.gz", checksums)).toBe(false);
  });

  it("rejects a malformed (non-64-hex) checksum entry", () => {
    expect(verifyChecksum(buf, "modules.tar.gz", "notahash  modules.tar.gz\n")).toBe(false);
  });

  it("is case-insensitive on the hex digest", () => {
    expect(verifyChecksum(buf, "modules.tar.gz", `${sum.toUpperCase()}  modules.tar.gz\n`)).toBe(true);
  });
});
