/**
 * Root elevation — re-exec with sudo if not already running as root.
 * Must be called BEFORE Ink rendering starts (sudo password prompt
 * conflicts with Ink's raw-mode terminal handling).
 */

import { spawnSync } from "node:child_process";

export function elevateIfNeeded(): void {
  if (process.getuid?.() === 0) return;

  // Preserve only the env vars we need — blanket -E would forward secrets
  // like AWS_SECRET_ACCESS_KEY to every child module running as root.
  const preserve = ["TERM", "COLORTERM", "LANG", "LC_ALL", "ANTHROPIC_API_KEY"].join(",");
  const result = spawnSync("sudo", [`--preserve-env=${preserve}`, "--", ...process.argv], {
    stdio: "inherit",
  });

  if (result.error) {
    process.stderr.write("Error: sudo is not available. Run as root.\n");
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
