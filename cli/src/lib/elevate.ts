/**
 * Root elevation — re-exec with sudo if not already running as root.
 * Must be called BEFORE Ink rendering starts (sudo password prompt
 * conflicts with Ink's raw-mode terminal handling).
 */

import { spawnSync } from "node:child_process";

export function elevateIfNeeded(): void {
  if (process.getuid?.() === 0) return;

  // Re-exec with sudo -E to preserve environment (TERM, COLORTERM for
  // Ink color detection, ANTHROPIC_API_KEY for AI modules, etc.)
  const result = spawnSync("sudo", ["-E", "--", ...process.argv], {
    stdio: "inherit",
  });

  if (result.error) {
    process.stderr.write("Error: sudo is not available. Run as root.\n");
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
