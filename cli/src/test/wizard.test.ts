/**
 * Unit tests for wizard selection logic and helpers.
 * Tests the pure logic used by wizard components without rendering Ink.
 */

import { describe, expect, test } from "bun:test";
import { GROUPS, MODULE_SPECS, type ModuleSpec, keysForGroups, resolveOrder } from "../lib/modules.js";

// ── GroupSelect logic ──────────────────────────────────────────────────────

describe("GroupSelect logic", () => {
  test("all groups are defined", () => {
    expect(GROUPS).toEqual(["core", "network", "coding", "cloud-sync", "ai", "desktop"]);
  });

  test("every module belongs to a known group", () => {
    const groupSet = new Set<string>(GROUPS);
    for (const spec of MODULE_SPECS) {
      expect(groupSet.has(spec.group)).toBe(true);
    }
  });

  test("core group always has modules", () => {
    const coreKeys = keysForGroups(new Set(["core"]));
    expect(coreKeys.size).toBeGreaterThan(0);
    expect(coreKeys).toContain("system");
    expect(coreKeys).toContain("zsh");
    expect(coreKeys).toContain("shell");
  });

  test("keysForGroups returns correct module sets", () => {
    const codingKeys = keysForGroups(new Set(["coding"]));
    expect(codingKeys).toContain("tmux");
    expect(codingKeys).toContain("devtools");
    expect(codingKeys).toContain("github");
    expect(codingKeys).not.toContain("system"); // system is core

    const aiKeys = keysForGroups(new Set(["ai"]));
    expect(aiKeys).toContain("claude");
    expect(aiKeys.size).toBe(1);
  });
});

// ── ModuleSelect logic (dependency expansion) ──────────────────────────────

describe("ModuleSelect dependency expansion", () => {
  test("selecting a module auto-expands its dependencies", () => {
    const keys = new Set(["shell"]); // depends on zsh
    const resolved = resolveOrder(keys);
    const resolvedKeys = resolved.map((s) => s.key);
    expect(resolvedKeys).toContain("zsh");
    expect(resolvedKeys).toContain("shell");
  });

  test("deep dependency chain is fully expanded", () => {
    const keys = new Set(["firewall"]); // firewall -> ssh -> tailscale
    const resolved = resolveOrder(keys);
    const resolvedKeys = resolved.map((s) => s.key);
    expect(resolvedKeys).toContain("tailscale");
    expect(resolvedKeys).toContain("ssh");
    expect(resolvedKeys).toContain("firewall");
    expect(resolvedKeys.indexOf("tailscale")).toBeLessThan(resolvedKeys.indexOf("ssh"));
    expect(resolvedKeys.indexOf("ssh")).toBeLessThan(resolvedKeys.indexOf("firewall"));
  });

  test("claude depends on devtools", () => {
    const keys = new Set(["claude"]);
    const resolved = resolveOrder(keys);
    const resolvedKeys = resolved.map((s) => s.key);
    expect(resolvedKeys).toContain("devtools");
    expect(resolvedKeys).toContain("claude");
    expect(resolvedKeys.indexOf("devtools")).toBeLessThan(resolvedKeys.indexOf("claude"));
  });

  test("no duplicates when selecting module and its dependency", () => {
    const keys = new Set(["zsh", "shell"]);
    const resolved = resolveOrder(keys);
    const resolvedKeys = resolved.map((s) => s.key);
    const unique = new Set(resolvedKeys);
    expect(resolvedKeys.length).toBe(unique.size);
  });
});

// ── Platform filtering in module select ────────────────────────────────────

describe("ModuleSelect platform filtering", () => {
  test("linux-only modules are excluded on WSL", () => {
    const allKeys = new Set(MODULE_SPECS.map((s) => s.key));
    const resolved = resolveOrder(allKeys, "wsl");
    const resolvedKeys = new Set(resolved.map((s) => s.key));
    expect(resolvedKeys.has("timezone")).toBe(false);
    expect(resolvedKeys.has("ssh")).toBe(false);
    expect(resolvedKeys.has("firewall")).toBe(false);
    expect(resolvedKeys.has("gnome_terminal")).toBe(false);
  });

  test("cross-platform modules are available on WSL", () => {
    const allKeys = new Set(MODULE_SPECS.map((s) => s.key));
    const resolved = resolveOrder(allKeys, "wsl");
    const resolvedKeys = new Set(resolved.map((s) => s.key));
    expect(resolvedKeys.has("system")).toBe(true);
    expect(resolvedKeys.has("zsh")).toBe(true);
    expect(resolvedKeys.has("tmux")).toBe(true);
    expect(resolvedKeys.has("devtools")).toBe(true);
  });

  test("platform filter combined with key selection", () => {
    // Select network group modules on WSL — only tailscale should survive
    const networkKeys = keysForGroups(new Set(["network"]));
    const resolved = resolveOrder(networkKeys, "wsl");
    const resolvedKeys = resolved.map((s) => s.key);
    expect(resolvedKeys).toContain("tailscale");
    expect(resolvedKeys).not.toContain("ssh");
    expect(resolvedKeys).not.toContain("firewall");
  });
});

// ── Confirmation logic (module ordering) ────────────────────────────────────

describe("Confirmation module ordering", () => {
  test("modules are in dependency-safe order", () => {
    const keys = new Set(["shell", "claude", "firewall"]);
    const resolved = resolveOrder(keys, "linux");
    const resolvedKeys = resolved.map((s) => s.key);

    // Check all dependency constraints are met
    for (const spec of resolved) {
      const specIdx = resolvedKeys.indexOf(spec.key);
      for (const dep of spec.deps) {
        const depIdx = resolvedKeys.indexOf(dep);
        if (depIdx >= 0) {
          expect(depIdx).toBeLessThan(specIdx);
        }
      }
    }
  });

  test("grouping by group preserves all modules", () => {
    const keys = new Set(MODULE_SPECS.map((s) => s.key));
    const resolved = resolveOrder(keys, "linux");

    // Group by group (simulates Confirmation component logic)
    const byGroup = new Map<string, ModuleSpec[]>();
    for (const mod of resolved) {
      const list = byGroup.get(mod.group) ?? [];
      list.push(mod);
      byGroup.set(mod.group, list);
    }

    // All resolved modules should appear in exactly one group
    let total = 0;
    for (const mods of byGroup.values()) {
      total += mods.length;
    }
    expect(total).toBe(resolved.length);
  });
});

// ── Wizard flow state transitions ──────────────────────────────────────────

describe("wizard flow helpers", () => {
  test("hasExplicitFlags detects no-flag state", () => {
    // Simulates the logic in init.tsx
    function hasExplicitFlags(flags: {
      only: Set<string> | null;
      skip: Set<string>;
      group: Set<string> | null;
      config: string | null;
    }): boolean {
      return flags.only !== null || flags.group !== null || flags.skip.size > 0 || flags.config !== null;
    }

    expect(hasExplicitFlags({ only: null, skip: new Set(), group: null, config: null })).toBe(false);
    expect(hasExplicitFlags({ only: new Set(["zsh"]), skip: new Set(), group: null, config: null })).toBe(true);
    expect(hasExplicitFlags({ only: null, skip: new Set(["tmux"]), group: null, config: null })).toBe(true);
    expect(hasExplicitFlags({ only: null, skip: new Set(), group: new Set(["core"]), config: null })).toBe(true);
    expect(hasExplicitFlags({ only: null, skip: new Set(), group: null, config: "setup.yaml" })).toBe(true);
  });

  test("findAutoExpanded detects new dependencies", () => {
    // Simulates the logic in ModuleSelect
    function findAutoExpanded(selectedKeys: Set<string>): string[] {
      const resolved = resolveOrder(selectedKeys);
      return resolved.map((s) => s.key).filter((k) => !selectedKeys.has(k));
    }

    // shell depends on zsh — selecting shell without zsh should auto-expand
    expect(findAutoExpanded(new Set(["shell"]))).toContain("zsh");

    // Selecting both should expand nothing
    expect(findAutoExpanded(new Set(["shell", "zsh"]))).toEqual([]);

    // firewall -> ssh -> tailscale
    const expanded = findAutoExpanded(new Set(["firewall"]));
    expect(expanded).toContain("ssh");
    expect(expanded).toContain("tailscale");
  });
});
