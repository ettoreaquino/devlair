/**
 * Homebrew pre-flight for macOS.
 *
 * Must be called BEFORE Ink rendering starts — the Homebrew installer needs
 * full TTY access so it can prompt for a sudo password when creating
 * /opt/homebrew (Apple Silicon) or /usr/local (Intel). Module subprocesses
 * run with piped stdin (JSON context) and cannot receive sudo prompts.
 *
 * After this function returns, brew is guaranteed to be on PATH. If
 * installation fails, the process exits with a human-readable error.
 */

import { execSync, spawnSync } from "node:child_process";

const BREW_PATHS = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
const INSTALL_URL = "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh";

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

export function ensureHomebrew(): void {
  const existing = brewPath();
  if (existing) {
    // Already installed — add to PATH for the current process so child
    // module scripts inherit it via the environment.
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
    return;
  }

  // Homebrew not installed — run the installer with full TTY access.
  process.stdout.write("\nHomebrew is not installed. Installing now...\n");
  process.stdout.write("You may be prompted for your password.\n\n");

  const tmp = spawnSync("mktemp", { encoding: "utf8" }).stdout.trim();
  if (!tmp) {
    process.stderr.write("Error: could not create temp file.\n");
    process.exit(1);
  }
  const dl = spawnSync("curl", ["-fsSL", INSTALL_URL, "-o", tmp], { stdio: "inherit" });
  if (dl.status !== 0) {
    process.stderr.write("Error: failed to download the Homebrew installer.\n");
    process.exit(1);
  }

  // stdio: "inherit" gives the installer full TTY access for sudo prompts.
  const install = spawnSync("bash", [tmp], { stdio: "inherit" });
  spawnSync("rm", ["-f", tmp]);

  if (install.status !== 0) {
    process.stderr.write(
      "\nError: Homebrew installation failed.\n" + "Visit https://brew.sh for manual installation instructions.\n",
    );
    process.exit(1);
  }

  const installed = brewPath();
  if (!installed) {
    process.stderr.write("Error: Homebrew installed but brew not found at expected paths.\n");
    process.exit(1);
  }
  process.env.PATH = `${brewBinDir(installed)}:${process.env.PATH ?? ""}`;
}
