/** Module script path resolution. */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

let _modulesDir: string | undefined;

/**
 * Return the absolute path to the modules/ directory.
 *
 * In development: cli/src/lib/paths.ts → ../../../modules/
 * In compiled binary: dist/cli.js → ../modules/
 */
export function modulesDir(): string {
  if (_modulesDir) return _modulesDir;

  // Try relative to this source file first (development layout)
  const devPath = resolve(import.meta.dir, "../../../modules");
  if (existsSync(join(devPath, "_lib.sh"))) {
    _modulesDir = devPath;
    return _modulesDir;
  }

  // Try relative to the binary (compiled layout: dist/devlair → ../modules/)
  const binDir = resolve(process.argv[0], "..");
  const binPath = resolve(binDir, "../modules");
  if (existsSync(join(binPath, "_lib.sh"))) {
    _modulesDir = binPath;
    return _modulesDir;
  }

  throw new Error(`Cannot find modules/ directory (tried ${devPath} and ${binPath})`);
}

/**
 * Return the absolute script path for a module key.
 * Normalizes underscore to hyphen: gnome_terminal → gnome-terminal.sh
 */
export function moduleScriptPath(key: string): string {
  const filename = `${key.replace(/_/g, "-")}.sh`;
  const path = join(modulesDir(), filename);
  if (!existsSync(path)) {
    throw new Error(`Module script not found: ${path}`);
  }
  return path;
}
