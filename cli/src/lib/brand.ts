import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Brand shown when no `--brand` flag was given and none was persisted. */
export const DEFAULT_BRAND = "d e v l a i r";

/** Path to the persisted brand file in the invoking user's home. */
export function brandFilePath(userHome: string): string {
  return join(userHome, ".devlair", "brand");
}

function readPersistedBrand(userHome: string): string | undefined {
  try {
    const raw = readFileSync(brandFilePath(userHome), "utf8").trim();
    return raw.length > 0 ? raw : undefined;
  } catch {
    // No persisted brand yet (or unreadable) — fall back to the default.
    return undefined;
  }
}

/**
 * Resolve the brand to display: an explicit `--brand` flag wins, then the
 * brand persisted by a prior `init --brand` (~/.devlair/brand), then the
 * default. The shell module writes the persisted file, so the value survives
 * re-runs and is reused by `doctor`/`upgrade` and the generated login banner.
 */
export function resolveBrand(flagBrand: string | undefined, userHome: string): string {
  const flag = flagBrand?.trim();
  if (flag) return flag;
  return readPersistedBrand(userHome) ?? DEFAULT_BRAND;
}
