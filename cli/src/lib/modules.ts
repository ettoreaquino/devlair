import type { Platform } from "./types.js";

export const GROUPS = ["core", "network", "coding", "cloud-sync", "ai", "desktop"] as const;
export type Group = (typeof GROUPS)[number];

export interface ModuleSpec {
  key: string;
  label: string;
  group: Group;
  deps: string[];
  reapply: boolean;
  /** Platforms this module can run on. */
  platforms: Set<Platform>;
  /** Platforms where this module runs by default (null = same as `platforms`). */
  defaultOn: Set<Platform> | null;
}

function spec(
  key: string,
  label: string,
  group: Group,
  opts: {
    deps?: string[];
    reapply?: boolean;
    platforms?: Platform[];
    defaultOn?: Platform[];
  } = {},
): ModuleSpec {
  return {
    key,
    label,
    group,
    deps: opts.deps ?? [],
    reapply: opts.reapply ?? false,
    platforms: new Set(opts.platforms ?? (["linux", "wsl"] as Platform[])),
    defaultOn: opts.defaultOn !== undefined ? new Set(opts.defaultOn) : null,
  };
}

export const MODULE_SPECS: readonly ModuleSpec[] = [
  spec("system", "System update", "core"),
  spec("timezone", "Timezone", "core", { platforms: ["linux"] }),
  spec("tailscale", "Tailscale", "network", { defaultOn: ["linux"] }),
  spec("ssh", "SSH", "network", { deps: ["tailscale"], platforms: ["linux"] }),
  spec("firewall", "Firewall + Fail2Ban", "network", { deps: ["ssh"], platforms: ["linux"] }),
  spec("zsh", "Zsh + Dracula", "core", { reapply: true }),
  spec("tmux", "tmux", "coding", { reapply: true }),
  spec("devtools", "Dev tools", "coding", { reapply: true }),
  spec("rclone", "rclone sync", "cloud-sync", { defaultOn: [] }),
  spec("github", "GitHub SSH key", "coding"),
  spec("shell", "Shell aliases", "core", { deps: ["zsh"], reapply: true }),
  spec("gnome_terminal", "Gnome Terminal Dracula", "desktop", { reapply: true, platforms: ["linux"] }),
  spec("claude", "Claude Code", "ai", { deps: ["devtools"], reapply: true, defaultOn: [] }),
];

export const REAPPLY_KEYS: ReadonlySet<string> = new Set(MODULE_SPECS.filter((s) => s.reapply).map((s) => s.key));

const SPEC_MAP: ReadonlyMap<string, ModuleSpec> = new Map(MODULE_SPECS.map((s) => [s.key, s]));

/**
 * Assert that MODULE_SPECS is in valid topological (dependency) order.
 * Throws on unknown deps or forward references.
 */
export function validateDag(): void {
  const seen = new Set<string>();
  for (const s of MODULE_SPECS) {
    for (const dep of s.deps) {
      if (!SPEC_MAP.has(dep)) {
        throw new Error(`Module '${s.key}' depends on unknown module '${dep}'`);
      }
      if (!seen.has(dep)) {
        throw new Error(`Module '${s.key}' depends on '${dep}' which appears later in MODULE_SPECS`);
      }
    }
    seen.add(s.key);
  }
}

// Validate on import — catches ordering bugs early.
validateDag();

/**
 * Return ModuleSpecs in dependency-safe order, optionally filtered to `keys`.
 * Dependencies are auto-expanded when keys is provided.
 * Modules incompatible with `platform` are excluded when specified.
 */
export function resolveOrder(keys?: Set<string>, platform?: Platform): ModuleSpec[] {
  let filter: Set<string> | undefined = keys;
  if (filter !== undefined) {
    const expanded = new Set<string>();
    const expand = (k: string) => {
      if (expanded.has(k)) return;
      expanded.add(k);
      const s = SPEC_MAP.get(k);
      if (s) for (const dep of s.deps) expand(dep);
    };
    for (const k of filter) expand(k);
    filter = expanded;
  }

  let specs = filter === undefined ? [...MODULE_SPECS] : MODULE_SPECS.filter((s) => filter.has(s.key));
  if (platform !== undefined) {
    specs = specs.filter((s) => s.platforms.has(platform));
  }
  return specs;
}

/** Return all module keys belonging to the given groups. */
export function keysForGroups(groups: Set<string>): Set<string> {
  return new Set(MODULE_SPECS.filter((s) => groups.has(s.group)).map((s) => s.key));
}
