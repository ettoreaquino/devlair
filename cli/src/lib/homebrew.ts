/**
 * Homebrew pre-flight for macOS.
 *
 * macOsPreFlight() must be called BEFORE Ink rendering starts:
 * - If Homebrew is already installed, it adds brew to PATH so child module
 *   scripts inherit it via the environment.
 * - If Homebrew is NOT installed, it caches sudo credentials via `sudo -v`
 *   (TTY available pre-Ink) so the [1/8] homebrew module can run the
 *   installer in a piped subprocess without needing an interactive prompt.
 *
 * The actual installation is delegated to the homebrew module script, which
 * runs as step [1/8] with NONINTERACTIVE=1 and the cached credentials.
 */

import { execSync, spawnSync } from "node:child_process";

const BREW_PATHS = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];

function brewBinDir(brewBin: string): string {
  return brewBin.replace(/\/brew$/, "");
}

function brewPath(): string | null {
  for (const p of BREW_PATHS) {
    try {
      execSync(`test -x "${p}"`, { stdio: "ignore" });
      return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function setupBrewPath(existing: string): void {
  try {
    const shellenv = execSync(`"${existing}" shellenv`, { encoding: "utf8" });
    const SAFE_BREW_VARS = new Set(["PATH", "HOMEBREW_PREFIX", "HOMEBREW_CELLAR", "HOMEBREW_REPOSITORY"]);
    for (const line of shellenv.split("\n")) {
      const m = line.match(/^export ([A-Z_]+)="(.*)"/);
      if (m && SAFE_BREW_VARS.has(m[1])) process.env[m[1]] = m[2];
    }
  } catch {
    // Non-fatal: brew shellenv failure means PATH may be incomplete, but
    // brew itself is usable if the caller found it at a known path.
    process.env.PATH = `${brewBinDir(existing)}:${process.env.PATH ?? ""}`;
  }
}

export function macOsPreFlight(): void {
  const existing = brewPath();
  if (existing) {
    setupBrewPath(existing);
    return;
  }

  // Homebrew not installed — cache sudo credentials before Ink starts.
  // The homebrew module (step [1/8]) will run the actual installer using
  // NONINTERACTIVE=1 and these cached credentials, without needing a TTY.
  process.stdout.write("\nHomebrew will be installed as the first step.\n");
  process.stdout.write("Your password is needed now to prepare the installation.\n\n");

  const result = spawnSync("sudo", ["-v"], { stdio: "inherit" });
  if (result.status !== 0) {
    process.stderr.write(
      "\nWarning: could not cache sudo credentials. Homebrew installation may require manual intervention.\n",
    );
    // Non-fatal: the homebrew module will surface a clear error if it fails.
  }
}
