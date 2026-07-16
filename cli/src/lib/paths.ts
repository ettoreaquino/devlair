/** Module script path resolution. */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

let _modulesDir: string | undefined;

// User-owned copy written by `devlair upgrade` on macOS (see lib/self-update.ts
// resolveModulesTarget). Preferred over the install location so a self-update's
// fresh modules win — mirroring how the relocated ~/.devlair/bin binary shadows
// a legacy /usr/local/bin one.
//
// SECURITY: this is trusted ONLY on macOS. On Linux, init/upgrade re-exec as
// root via sudo (lib/elevate.ts) without forcing HOME, so homedir() can still
// resolve to the invoking *unprivileged* user's home. Preferring a user-owned
// ~/.devlair/modules there would let any local process that can write that dir
// plant scripts the root process then executes — a privilege-escalation path.
// Linux always uses the root-owned install dir below.
const USER_MODULES_DIR = join(homedir(), ".devlair", "modules");
const INSTALL_MODULES_DIR = "/usr/local/share/devlair/modules";

/**
 * Return the absolute path to the modules/ directory.
 *
 * Production: install.sh extracts modules.tar.gz to /usr/local/share/devlair/modules/,
 * and `devlair upgrade` on macOS refreshes a user-owned copy at ~/.devlair/modules/.
 * Development: cli/src/lib/paths.ts → ../../modules/ in the repo (cli/modules/).
 *
 * The compiled-binary path can't be derived from process.argv[0] (which is the
 * literal string "bun" in bun-compiled binaries) or from import.meta.dir (which
 * points into the internal /$bunfs/... virtual FS), so we pin the install path
 * instead and fall back to the dev layout.
 */
export function modulesDir(): string {
  if (_modulesDir) return _modulesDir;

  // macOS only for the user-owned copy (see SECURITY note above).
  const candidates = process.platform === "darwin" ? [USER_MODULES_DIR, INSTALL_MODULES_DIR] : [INSTALL_MODULES_DIR];
  for (const dir of candidates) {
    if (existsSync(join(dir, "_lib.sh"))) {
      _modulesDir = dir;
      return _modulesDir;
    }
  }

  const devPath = resolve(import.meta.dir, "../../modules");
  if (existsSync(join(devPath, "_lib.sh"))) {
    _modulesDir = devPath;
    return _modulesDir;
  }

  throw new Error(`Cannot find modules/ directory (tried ${USER_MODULES_DIR}, ${INSTALL_MODULES_DIR} and ${devPath})`);
}

/**
 * Clear the cached modules dir. Call after a self-update relocates the modules
 * tree mid-process so the next modulesDir() re-resolves to the fresh copy
 * instead of returning a path resolved before the refresh.
 */
export function resetModulesDirCache(): void {
  _modulesDir = undefined;
}

/**
 * Return the absolute script path for a module key.
 * Normalizes underscore to hyphen: gnome_terminal → gnome-terminal.sh
 */
export function moduleScriptPath(key: string): string {
  const filename = `${key.replace(/_/g, "-")}.sh`;
  const dir = modulesDir();
  const resolved = resolve(dir, filename);
  // Defense-in-depth: prevent path traversal if a crafted key contains ../
  if (!resolved.startsWith(`${dir}/`)) {
    throw new Error(`Module key resolves outside modules directory: ${key}`);
  }
  if (!existsSync(resolved)) {
    throw new Error(`Module script not found: ${resolved}`);
  }
  return resolved;
}
