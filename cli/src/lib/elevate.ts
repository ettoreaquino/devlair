/**
 * Root elevation — re-exec with sudo if not already running as root.
 * Must be called BEFORE Ink rendering starts (sudo password prompt
 * conflicts with Ink's raw-mode terminal handling).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Cache sudo credentials up front so later `sudo -n` calls succeed.
 *
 * On macOS `elevateIfNeeded()` deliberately does NOT re-exec the process as
 * root (Homebrew refuses root, modules install to user space). But the
 * devlair-core artifacts (`/usr/local/bin/devlair`, `/usr/local/share/devlair`)
 * are root-owned, so uninstall's `sudo -n rm` fallback fails on a machine
 * without cached sudo creds — surfacing as "[N/N] some files need root".
 *
 * Priming `sudo -v` here, BEFORE Ink starts rendering, prompts for the password
 * once over the real TTY (Ink's raw mode would otherwise swallow it) and caches
 * the timestamp the later `sudo -n rm` relies on. No-op when nothing privileged
 * is present, when already root, or when sudo is unavailable.
 */
export function primeSudoForRootArtifacts(paths: readonly string[]): void {
  if (process.platform !== "darwin") return;
  if (process.getuid?.() === 0) return;
  if (!paths.some((p) => existsSync(p))) return;

  const result = spawnSync("sudo", ["-v"], { stdio: "inherit" });
  if (result.error || (result.status ?? 1) !== 0) {
    // Don't hard-fail: the run can still proceed and report what needs root.
    process.stderr.write("Warning: could not cache sudo credentials; root-owned files may not be removed.\n");
  }
}

export function elevateIfNeeded(): void {
  // macOS: Homebrew refuses to run as root, and all macOS modules install to
  // user space via brew/curl. Elevation is neither needed nor safe on macOS.
  if (process.platform === "darwin") return;
  if (process.getuid?.() === 0) return;

  // Preserve only the env vars we need — blanket -E would forward secrets
  // like AWS_SECRET_ACCESS_KEY to every child module running as root.
  const preserve = ["TERM", "COLORTERM", "LANG", "LC_ALL"].join(",");
  // In a bun-compiled binary, process.argv[0] is the literal "bun" and
  // argv[1] is a /$bunfs/... internal path — neither resolves under sudo.
  // Re-exec the real binary (process.execPath) with the user-facing args only.
  const userArgs = process.argv.slice(2);
  const result = spawnSync("sudo", [`--preserve-env=${preserve}`, "--", process.execPath, ...userArgs], {
    stdio: "inherit",
  });

  if (result.error) {
    process.stderr.write("Error: sudo is not available. Run as root.\n");
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
