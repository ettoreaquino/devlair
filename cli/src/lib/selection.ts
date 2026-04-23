/**
 * Module selection logic — resolves which modules to run based on
 * CLI flags, platform, and default-on settings.
 */

import type { InitFlags } from "./args.js";
import { type ModuleSpec, keysForGroups, resolveOrder } from "./modules.js";
import type { Platform } from "./types.js";

export interface SelectionResult {
  /** Modules that will be executed, in dependency order. */
  selected: ModuleSpec[];
  /** Modules excluded because they are opt-in on this platform. */
  optional: ModuleSpec[];
  /** Modules excluded because they don't support this platform. */
  platformSkipped: ModuleSpec[];
}

export function selectModules(flags: InitFlags, platform: Platform): SelectionResult {
  // Build the set of explicitly requested keys (null = "all")
  let want: Set<string> | null = null;

  if (flags.only || flags.group) {
    if (flags.group) {
      want = keysForGroups(flags.group);
    }
    if (flags.only) {
      const only = flags.only;
      want = want !== null ? new Set([...want].filter((k) => only.has(k))) : only;
    }
  }

  // Resolve full order with dependency expansion
  const allSpecs = resolveOrder(want ?? undefined);

  // Separate platform-incompatible modules
  const platformSkipped = allSpecs.filter((s) => !s.platforms.has(platform));
  let selected = allSpecs.filter((s) => s.platforms.has(platform) && !flags.skip.has(s.key));

  // When no explicit selection, filter out modules not default for this platform
  let optional: ModuleSpec[] = [];
  if (want === null) {
    optional = selected.filter((s) => s.defaultOn !== null && !s.defaultOn.has(platform));
    const optionalKeys = new Set(optional.map((s) => s.key));
    selected = selected.filter((s) => !optionalKeys.has(s.key));
  }

  return { selected, optional, platformSkipped };
}
