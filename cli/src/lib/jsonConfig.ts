/**
 * Read/merge helpers for the JSON config files used by the claude command
 * (~/.claude/settings.json, ~/.claude/devlair-config.json).
 *
 * Missing or corrupt files read as `{}`; writes always create parent dirs and
 * preserve existing keys via a shallow merge.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readJson(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function updateJson(path: string, updates: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const data = { ...readJson(path), ...updates };
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
