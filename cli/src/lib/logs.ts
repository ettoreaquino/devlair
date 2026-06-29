// Per-run log directory for `devlair init`. Each module's stderr is streamed
// to its own file so failures can be diagnosed without re-running with extra
// flags.

import { chmodSync, chownSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const KEEP_RUNS = 10;
const LOG_DIR_PREFIX = "init-";

function runDirName(now: Date): string {
  const iso = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/-\d{3}Z$/, "Z");
  return `${LOG_DIR_PREFIX}${iso}`;
}

/**
 * Return [uid, gid] of the invoking user when running under sudo, or null.
 * Only returns a value when both SUDO_UID and SUDO_GID are set, non-zero, and
 * parseable as integers — covers the common `sudo devlair init` case.
 */
export function invokerOwnership(): [number, number] | null {
  const uid = Number.parseInt(process.env.SUDO_UID ?? "", 10);
  const gid = Number.parseInt(process.env.SUDO_GID ?? "", 10);
  if (!Number.isFinite(uid) || !Number.isFinite(gid) || uid === 0 || gid === 0) return null;
  return [uid, gid];
}

/** Throw if path exists as a symlink — guards against pre-planted symlink attacks under sudo. */
function rejectSymlink(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new Error(`Refusing to create log directory: ${path} is a symlink`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return; // does not exist yet — fine
    throw err;
  }
}

/**
 * Create `<userHome>/.devlair/logs/init-<ts>/` (mode 0700) and prune older
 * `init-*` directories to the most recent KEEP_RUNS, including the new one.
 *
 * Returns the absolute path to the new directory.
 */
export function createInitLogDir(userHome: string, now: Date = new Date()): string {
  const devlairDir = join(userHome, ".devlair");
  const logsRoot = join(devlairDir, "logs");

  // Reject symlinks on each path component before creating children.
  // Under sudo, a user-planted symlink at ~/.devlair or ~/.devlair/logs would
  // otherwise redirect root-owned mkdir/rmSync into an attacker-chosen target.
  rejectSymlink(devlairDir);
  rejectSymlink(logsRoot);

  mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
  // Explicitly tighten permissions — mkdirSync mode is only applied to newly
  // created dirs; an existing ~/.devlair/logs with 0755 would stay 0755.
  chmodSync(logsRoot, 0o700);

  const runDir = join(logsRoot, runDirName(now));
  mkdirSync(runDir, { mode: 0o700 });
  chmodSync(runDir, 0o700);

  const ownership = invokerOwnership();
  if (ownership) {
    chownSync(logsRoot, ownership[0], ownership[1]);
    chownSync(runDir, ownership[0], ownership[1]);
  }

  pruneOldRuns(logsRoot, KEEP_RUNS);
  return runDir;
}

function pruneOldRuns(logsRoot: string, keep: number): void {
  let names: string[];
  try {
    names = readdirSync(logsRoot).filter((name) => name.startsWith(LOG_DIR_PREFIX));
  } catch {
    return;
  }
  if (names.length <= keep) return;
  // Sort by directory name, which is the run's ISO-8601 UTC timestamp from
  // runDirName(). The format is fixed-width, so a plain code-unit sort (default,
  // locale-independent) orders chronologically. The name is the canonical run
  // identity; sorting by it avoids depending on filesystem mtime, whose
  // granularity made an mtime-based sort flaky on CI.
  names.sort(); // ascending: oldest first
  const stale = names.slice(0, names.length - keep);
  for (const name of stale) {
    const path = join(logsRoot, name);
    try {
      // Re-lstat to guard against a TOCTOU race where the entry was replaced
      // with a symlink between readdirSync and now — never rmSync a symlink target.
      if (lstatSync(path).isSymbolicLink()) continue;
      rmSync(path, { recursive: true, force: true });
    } catch {
      // Best-effort prune; never fail the run because of a stale log.
    }
  }
}

/** Resolve `<runDir>/<moduleKey>.log` — caller owns existence. */
export function moduleLogPath(runDir: string, moduleKey: string): string {
  const resolved = resolve(runDir, `${moduleKey}.log`);
  // Defense-in-depth: prevent path traversal if moduleKey contains ../
  if (!resolved.startsWith(`${runDir}/`)) {
    throw new Error(`Module key resolves outside log directory: ${moduleKey}`);
  }
  return resolved;
}
