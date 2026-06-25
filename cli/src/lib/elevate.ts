/**
 * Root elevation — re-exec with sudo if not already running as root.
 * Must be called BEFORE Ink rendering starts (sudo password prompt
 * conflicts with Ink's raw-mode terminal handling).
 */

import { spawnSync } from "node:child_process";

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
