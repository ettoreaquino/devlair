/**
 * Homebrew pre-flight for macOS.
 *
 * macOsPreFlight() must be called BEFORE Ink rendering starts:
 * - If Homebrew is already installed, it adds brew to PATH so child module
 *   scripts inherit it via the environment.
 * - If Homebrew is NOT installed, it runs the official installer interactively
 *   right here, while a real TTY is available. This matches the manual install
 *   path and is the single point of installation on macOS.
 *
 * Why install here and not in the `homebrew` module: module scripts are spawned
 * detached with piped stdio (see runner.ts), so they have no controlling
 * terminal. A `NONINTERACTIVE=1` Homebrew install in that context falls back to
 * `sudo -n`, which fails on a fresh machine even for admins — surfacing the
 * misleading "needs to be an Administrator" error. Installing pre-Ink lets
 * Homebrew prompt for the password over the real TTY and manage its own sudo.
 *
 * macOsPurgeHomebrew() is the symmetric teardown for `devlair uninstall
 * --purge`: it runs Homebrew's official uninstaller interactively pre-Ink.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BREW_PATHS = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
const BREW_INSTALL_URL = "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh";
const BREW_UNINSTALL_URL = "https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh";
const MANUAL_INSTALL_CMD = `/bin/bash -c "$(curl -fsSL ${BREW_INSTALL_URL})"`;

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

/** True only when both stdin and stdout are attached to a terminal. */
function hasInteractiveTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export type PreFlightAction =
  | { kind: "use-existing" }
  | { kind: "install" }
  | { kind: "error-non-admin" }
  | { kind: "error-no-tty" };

/**
 * Pure decision for the macOS Homebrew pre-flight, factored out so the branch
 * logic is unit-testable without spawning sudo/curl.
 */
export function decidePreFlight(state: {
  brewInstalled: boolean;
  isAdmin: boolean;
  hasTTY: boolean;
}): PreFlightAction {
  if (state.brewInstalled) return { kind: "use-existing" };
  if (!state.isAdmin) return { kind: "error-non-admin" };
  if (!state.hasTTY) return { kind: "error-no-tty" };
  return { kind: "install" };
}

/**
 * Download a script to a temp file (no `curl | bash`), returning its path.
 * Caller is responsible for removing the parent temp dir.
 */
function downloadScript(url: string): string {
  const dir = mkdtempSync(join(tmpdir(), "devlair-"));
  const file = join(dir, "script.sh");
  const r = spawnSync("curl", ["-fsSL", url, "-o", file], { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`failed to download ${url}`);
  }
  return file;
}

/** Run a downloaded script interactively (full TTY), then clean up its temp dir. */
function runScriptInteractive(file: string, args: string[] = [], env?: Record<string, string>): number {
  const status =
    spawnSync("bash", [file, ...args], {
      stdio: "inherit",
      env: env ? { ...process.env, ...env } : process.env,
    }).status ?? 1;
  rmSync(join(file, ".."), { recursive: true, force: true });
  return status;
}

export function macOsPreFlight(): void {
  const existing = brewPath();
  const action = decidePreFlight({
    brewInstalled: existing !== null,
    isAdmin: isMacAdmin(),
    hasTTY: hasInteractiveTTY(),
  });

  switch (action.kind) {
    case "use-existing": {
      if (existing) setupBrewPath(existing);
      return;
    }
    case "error-non-admin": {
      process.stderr.write(
        [
          "",
          "Error: Homebrew is not installed and your account is not a macOS Administrator.",
          "       devlair init requires Homebrew. Ask your IT admin to install it first:",
          `         ${MANUAL_INSTALL_CMD}`,
          "       Then re-run: devlair init",
          "",
        ].join("\n"),
      );
      process.exit(1);
      return;
    }
    case "error-no-tty": {
      process.stderr.write(
        [
          "",
          "Error: Homebrew is not installed and there is no interactive terminal to install it.",
          "       Re-run devlair init from an interactive terminal, or install Homebrew first:",
          `         ${MANUAL_INSTALL_CMD}`,
          "",
        ].join("\n"),
      );
      process.exit(1);
      return;
    }
    case "install": {
      // Admin + TTY: install Homebrew interactively now. Homebrew prompts for
      // the sudo password itself over the real TTY.
      process.stdout.write("\nHomebrew is required and will be installed first.\n");
      process.stdout.write("The Homebrew installer will prompt you for your password.\n\n");

      let status: number;
      try {
        status = runScriptInteractive(downloadScript(BREW_INSTALL_URL));
      } catch {
        status = 1;
      }

      const installed = status === 0 ? brewPath() : null;
      if (!installed) {
        process.stderr.write(
          [
            "",
            "Error: Homebrew installation did not complete.",
            "       Re-run devlair init from an interactive terminal, or install Homebrew manually:",
            `         ${MANUAL_INSTALL_CMD}`,
            "       Then re-run: devlair init",
            "",
          ].join("\n"),
        );
        process.exit(1);
        return;
      }
      setupBrewPath(installed);
      return;
    }
  }
}

/**
 * Remove Homebrew for `devlair uninstall --purge`. Runs pre-Ink with a real
 * TTY (same reason as install). Best-effort: warns instead of aborting, so the
 * rest of the teardown still runs if the uninstaller can't complete.
 */
export function macOsPurgeHomebrew(): void {
  if (brewPath() === null) return; // nothing to remove
  if (!hasInteractiveTTY()) {
    process.stderr.write("\nWarning: cannot remove Homebrew without an interactive terminal; leaving it installed.\n");
    return;
  }

  process.stdout.write("\nRemoving Homebrew (--purge). The uninstaller will prompt for your password.\n\n");
  let status: number;
  try {
    // --force skips the interactive "are you sure?" confirmation; the user
    // already committed by passing --purge. sudo still prompts over the TTY.
    status = runScriptInteractive(downloadScript(BREW_UNINSTALL_URL), ["--force"]);
  } catch {
    status = 1;
  }
  if (status !== 0) {
    process.stderr.write("\nWarning: the Homebrew uninstaller did not complete cleanly.\n");
  }
}
