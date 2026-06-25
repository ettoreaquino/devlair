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

import { spawnSync } from "node:child_process";

const BREW_PATHS = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];

function isMacAdmin(): boolean {
  const r = spawnSync("id", ["-Gn"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (r.status !== 0 || !r.stdout) return false;
  return r.stdout.trim().split(/\s+/).includes("admin");
}

function brewBinDir(brewBin: string): string {
  return brewBin.replace(/\/brew$/, "");
}

function brewPath(): string | null {
  for (const p of BREW_PATHS) {
    if (spawnSync("test", ["-x", p], { stdio: "ignore" }).status === 0) {
      return p;
    }
  }
  return null;
}

function setupBrewPath(existing: string): void {
  try {
    const shellenv = spawnSync(existing, ["shellenv"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).stdout;
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

  // Homebrew not installed. The Homebrew installer requires the user to be
  // in the macOS admin group (it checks via dseditgroup before trying sudo).
  // Detect this early so we can give a clear error instead of a cryptic
  // module failure deep in the init flow.
  if (!isMacAdmin()) {
    process.stderr.write(
      [
        "",
        "Error: Homebrew is not installed and your account is not a macOS Administrator.",
        "       devlair init requires Homebrew. Ask your IT admin to install it first:",
        '         /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        "       Then re-run: devlair init",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  // Admin user — cache sudo credentials before Ink starts so the homebrew
  // module installer script can call sudo in its piped subprocess without
  // needing interactive input.
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
