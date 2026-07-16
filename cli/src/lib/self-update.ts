/**
 * Self-update install-target resolution.
 *
 * The recurring macOS "permission denied" failures during `devlair upgrade`
 * all traced back to one thing: the binary lived in root-owned /usr/local/bin
 * while the process runs as a normal user (Homebrew forbids root). Every
 * self-mutation then needed a bespoke sudo workaround, and each patch only
 * covered one path.
 *
 * The fix is to write the new binary into a user-owned location. The devlair
 * shell module already puts ~/.devlair/bin ahead of /usr/local/bin on PATH, so
 * relocating there shadows any legacy system copy with no root required. This
 * module decides — as a pure function, so it is unit-testable — where the new
 * binary should go for the machine we're running on.
 */

import { createHash } from "node:crypto";
import { constants, accessSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

export interface InstallTarget {
  /** Absolute path the new binary should be written to. */
  path: string;
  /** Whether a `sudo -n` fallback may be attempted if the direct write fails. */
  allowSudo: boolean;
  /** A legacy binary to best-effort remove after a successful install (migration). */
  migrateFrom?: string;
  /** A user-facing note appended to the success message. */
  note?: string;
}

export interface ResolveOptions {
  platform: NodeJS.Platform;
  /** The running binary's real path (process.execPath). */
  execPath: string;
  /** The user's home directory. */
  home: string;
  /** The PATH environment string. */
  pathEnv: string;
  /** Predicate: can we create/replace files in this directory? Injected for testability. */
  isWritableDir: (dir: string) => boolean;
}

/** True when `dir` is one of the entries in the PATH string. */
function onPath(dir: string, pathEnv: string): boolean {
  return pathEnv
    .split(delimiter)
    .map((p) => p.replace(/\/+$/, ""))
    .includes(dir.replace(/\/+$/, ""));
}

/**
 * Decide where the self-update should install the new binary.
 *
 * 1. If the directory the binary already runs from is writable, update in place
 *    with no sudo. This covers Linux (the process is elevated to root, so
 *    /usr/local/bin is writable), Homebrew prefixes, and machines already
 *    installed under ~/.devlair/bin.
 * 2. macOS with a legacy root-owned install: if ~/.devlair/bin is on PATH (the
 *    devlair shell block puts it ahead of /usr/local/bin), relocate there — no
 *    root needed, and the old copy is shadowed and then retired.
 * 3. Otherwise fall back to an in-place update, allowing a cached-credential
 *    `sudo -n` attempt; the caller degrades gracefully if that fails.
 */
export function resolveInstallTarget(opts: ResolveOptions): InstallTarget {
  const { platform, execPath, home, pathEnv, isWritableDir } = opts;
  const execDir = dirname(execPath);

  if (isWritableDir(execDir)) {
    return { path: execPath, allowSudo: false };
  }

  if (platform === "darwin") {
    const userBinDir = join(home, ".devlair", "bin");
    if (onPath(userBinDir, pathEnv)) {
      return { path: join(userBinDir, "devlair"), allowSudo: false, migrateFrom: execPath };
    }
    return {
      path: execPath,
      allowSudo: true,
      note: "run `devlair init` so future updates install without sudo",
    };
  }

  return { path: execPath, allowSudo: true };
}

export interface ModulesTarget {
  /** Directory that should CONTAIN the `modules/` tree (tree lands at `${dir}/modules`). */
  dir: string;
}

/**
 * Decide where `devlair upgrade` should write the refreshed modules tree.
 *
 * The v2 shell modules ship as a separate `modules.tar.gz` (not baked into the
 * binary), so a self-update that only replaces the binary leaves stale modules
 * on disk — and Phase 3's config re-apply then runs the OLD scripts. This
 * resolves where the fresh tree goes, mirroring the binary's own strategy:
 *
 * - macOS: the process never elevates (Homebrew refuses root), and the default
 *   modules dir `/usr/local/share/devlair/modules` is root-owned. Relocate to
 *   user-owned `~/.devlair/modules` — no sudo, no password prompt — exactly as
 *   the binary relocates to `~/.devlair/bin`. `modulesDir()` prefers this copy
 *   (macOS only — see paths.ts, which must never trust a user-owned modules dir
 *   on Linux where the process runs as root).
 * - Linux: `devlair upgrade` re-execs as root (see lib/elevate.ts), so the
 *   root-owned install location is writable directly; refresh it in place.
 */
export function resolveModulesTarget(opts: { platform: NodeJS.Platform; home: string }): ModulesTarget {
  if (opts.platform === "darwin") {
    return { dir: join(opts.home, ".devlair") };
  }
  return { dir: "/usr/local/share/devlair" };
}

/**
 * Verify a downloaded artifact's SHA-256 against a `checksums.txt` body (the
 * `<hex>  <filename>` format published with every release). Returns false on a
 * mismatch OR a missing entry — a self-update must never install an artifact
 * whose integrity it cannot confirm. Shared by the binary and modules-tarball
 * download paths so both get the same guarantee install.sh provides.
 */
export function verifyChecksum(buffer: Buffer, filename: string, checksumsText: string): boolean {
  const expected = checksumsText
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] === filename)?.[0];
  if (!expected || !/^[0-9a-f]{64}$/i.test(expected)) return false;
  const actual = createHash("sha256").update(buffer).digest("hex");
  return actual.toLowerCase() === expected.toLowerCase();
}

/** Real writability check used in production (injected as a predicate in tests). */
export function isWritableDir(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
