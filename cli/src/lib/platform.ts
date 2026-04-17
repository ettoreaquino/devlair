import { readFileSync } from "node:fs";
import type { Platform } from "./types.js";

/**
 * Detect the current platform. Checks for WSL first (via environment variable
 * or /proc/version), then macOS, defaulting to bare Linux.
 */
export function detectPlatform(): Platform {
  if (process.env.WSL_DISTRO_NAME) return "wsl";
  try {
    const procVersion = readFileSync("/proc/version", "utf8").toLowerCase();
    if (procVersion.includes("microsoft")) return "wsl";
  } catch {
    // /proc/version doesn't exist (macOS, etc.) — fine.
  }
  if (process.platform === "darwin") return "macos";
  return "linux";
}

/**
 * Return 1 or 2 for WSL, null otherwise. WSL2 is identified by "WSL2" or
 * "microsoft-standard" in /proc/version; anything else is assumed WSL1.
 */
export function detectWslVersion(platform?: Platform): 1 | 2 | null {
  if ((platform ?? detectPlatform()) !== "wsl") return null;
  try {
    const procVersion = readFileSync("/proc/version", "utf8");
    if (procVersion.includes("WSL2") || procVersion.toLowerCase().includes("microsoft-standard")) {
      return 2;
    }
  } catch {
    // Can't read — assume WSL1.
  }
  return 1;
}
