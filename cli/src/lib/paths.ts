/** Module script path resolution. */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

let _modulesDir: string | undefined;

const INSTALL_MODULES_DIR = "/usr/local/share/devlair/modules";

/**
 * Return the absolute path to the modules/ directory.
 *
 * Production: install.sh extracts modules.tar.gz to /usr/local/share/devlair/modules/.
 * Development: cli/src/lib/paths.ts → ../../../modules/ in the repo.
 *
 * The compiled-binary path can't be derived from process.argv[0] (which is the
 * literal string "bun" in bun-compiled binaries) or from import.meta.dir (which
 * points into the internal /$bunfs/... virtual FS), so we pin the install path
 * instead and fall back to the dev layout.
 */
export function modulesDir(): string {
  if (_modulesDir) return _modulesDir;

  if (existsSync(join(INSTALL_MODULES_DIR, "_lib.sh"))) {
    _modulesDir = INSTALL_MODULES_DIR;
    return _modulesDir;
  }

  const devPath = resolve(import.meta.dir, "../../../modules");
  if (existsSync(join(devPath, "_lib.sh"))) {
    _modulesDir = devPath;
    return _modulesDir;
  }

  throw new Error(`Cannot find modules/ directory (tried ${INSTALL_MODULES_DIR} and ${devPath})`);
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
