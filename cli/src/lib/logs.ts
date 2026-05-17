// Per-run log directory for `devlair init`. Each module's stderr is streamed
// to its own file so failures can be diagnosed without re-running with extra
// flags.

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const KEEP_RUNS = 10;
const LOG_DIR_PREFIX = "init-";

/** Format Date as `init-YYYY-MM-DDTHH-MM-SSZ` (filesystem-safe ISO). */
function runDirName(now: Date): string {
  const iso = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/-\d{3}Z$/, "Z");
  return `${LOG_DIR_PREFIX}${iso}`;
}

/**
 * Create `<userHome>/.devlair/logs/init-<ts>/` (mode 0700) and prune older
 * `init-*` directories to the most recent KEEP_RUNS, including the new one.
 *
 * Returns the absolute path to the new directory.
 */
export function createInitLogDir(userHome: string, now: Date = new Date()): string {
  const logsRoot = join(userHome, ".devlair", "logs");
  mkdirSync(logsRoot, { recursive: true, mode: 0o700 });

  const runDir = join(logsRoot, runDirName(now));
  mkdirSync(runDir, { recursive: true, mode: 0o700 });

  pruneOldRuns(logsRoot, KEEP_RUNS);
  return runDir;
}

function pruneOldRuns(logsRoot: string, keep: number): void {
  let entries: { name: string; mtimeMs: number }[];
  try {
    entries = readdirSync(logsRoot)
      .filter((name) => name.startsWith(LOG_DIR_PREFIX))
      .map((name) => {
        const full = join(logsRoot, name);
        try {
          return { name, mtimeMs: statSync(full).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((e): e is { name: string; mtimeMs: number } => e !== null);
  } catch {
    return;
  }
  if (entries.length <= keep) return;
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const stale of entries.slice(keep)) {
    const path = join(logsRoot, stale.name);
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      // Best-effort prune; never fail the run because of a stale log.
    }
  }
}

/** Resolve `<runDir>/<moduleKey>.log` — caller owns existence. */
export function moduleLogPath(runDir: string, moduleKey: string): string {
  return join(runDir, `${moduleKey}.log`);
}

/** Test helper. */
export function _logDirExists(runDir: string): boolean {
  return existsSync(runDir);
}
