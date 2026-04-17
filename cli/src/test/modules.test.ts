import { describe, expect, test } from "bun:test";
import { GROUPS, MODULE_SPECS, REAPPLY_KEYS, keysForGroups, resolveOrder, validateDag } from "../lib/modules.js";

describe("MODULE_SPECS", () => {
  test("has 14 modules", () => {
    expect(MODULE_SPECS).toHaveLength(14);
  });

  test("all keys are unique", () => {
    const keys = MODULE_SPECS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("all groups are valid", () => {
    const groupSet = new Set<string>(GROUPS);
    for (const s of MODULE_SPECS) {
      expect(groupSet.has(s.group)).toBe(true);
    }
  });
});

describe("validateDag", () => {
  test("succeeds on the real MODULE_SPECS (already validated on import)", () => {
    expect(() => validateDag()).not.toThrow();
  });
});

describe("REAPPLY_KEYS", () => {
  test("matches modules with reapply=true", () => {
    const expected = new Set(MODULE_SPECS.filter((s) => s.reapply).map((s) => s.key));
    expect(REAPPLY_KEYS).toEqual(expected);
  });

  test("includes known reapply modules", () => {
    for (const key of ["zsh", "tmux", "devtools", "shell", "gnome_terminal", "claude", "claw"]) {
      expect(REAPPLY_KEYS.has(key)).toBe(true);
    }
  });
});

describe("keysForGroups", () => {
  test("returns core modules", () => {
    const keys = keysForGroups(new Set(["core"]));
    expect(keys).toEqual(new Set(["system", "timezone", "zsh", "shell"]));
  });

  test("returns network modules", () => {
    const keys = keysForGroups(new Set(["network"]));
    expect(keys).toEqual(new Set(["tailscale", "ssh", "firewall"]));
  });

  test("returns multiple groups", () => {
    const keys = keysForGroups(new Set(["core", "coding"]));
    expect(keys).toEqual(new Set(["system", "timezone", "zsh", "shell", "tmux", "devtools", "github"]));
  });

  test("returns empty set for unknown group", () => {
    expect(keysForGroups(new Set(["nonexistent"]))).toEqual(new Set());
  });
});

describe("resolveOrder", () => {
  test("returns all 14 modules when no keys are specified", () => {
    const specs = resolveOrder();
    expect(specs).toHaveLength(14);
  });

  test("preserves topological order", () => {
    const specs = resolveOrder();
    const keys = specs.map((s) => s.key);
    // Dependencies must appear before dependents
    expect(keys.indexOf("tailscale")).toBeLessThan(keys.indexOf("ssh"));
    expect(keys.indexOf("ssh")).toBeLessThan(keys.indexOf("firewall"));
    expect(keys.indexOf("zsh")).toBeLessThan(keys.indexOf("shell"));
    expect(keys.indexOf("devtools")).toBeLessThan(keys.indexOf("claude"));
    expect(keys.indexOf("devtools")).toBeLessThan(keys.indexOf("claw"));
  });

  test("auto-expands dependencies", () => {
    // Requesting just "shell" should pull in "zsh" as a dependency
    const specs = resolveOrder(new Set(["shell"]));
    const keys = specs.map((s) => s.key);
    expect(keys).toContain("zsh");
    expect(keys).toContain("shell");
    expect(keys.indexOf("zsh")).toBeLessThan(keys.indexOf("shell"));
  });

  test("auto-expands transitive dependencies", () => {
    // "firewall" depends on "ssh" which depends on "tailscale"
    const specs = resolveOrder(new Set(["firewall"]));
    const keys = specs.map((s) => s.key);
    expect(keys).toContain("tailscale");
    expect(keys).toContain("ssh");
    expect(keys).toContain("firewall");
  });

  test("filters by platform", () => {
    const wslSpecs = resolveOrder(undefined, "wsl");
    const wslKeys = wslSpecs.map((s) => s.key);
    // Linux-only modules should be excluded on WSL
    expect(wslKeys).not.toContain("timezone");
    expect(wslKeys).not.toContain("ssh");
    expect(wslKeys).not.toContain("firewall");
    expect(wslKeys).not.toContain("gnome_terminal");
    // Cross-platform modules should still be present
    expect(wslKeys).toContain("system");
    expect(wslKeys).toContain("zsh");
    expect(wslKeys).toContain("devtools");
  });

  test("combines keys + platform filter", () => {
    // Request firewall on WSL — firewall is linux-only, so result should be empty
    // even though dependencies would be pulled in
    const specs = resolveOrder(new Set(["firewall"]), "wsl");
    const keys = specs.map((s) => s.key);
    expect(keys).not.toContain("firewall");
    expect(keys).not.toContain("ssh");
    // tailscale is linux+wsl, so it stays (it was pulled in as a transitive dep)
    expect(keys).toContain("tailscale");
  });

  test("handles empty keys set", () => {
    const specs = resolveOrder(new Set());
    expect(specs).toHaveLength(0);
  });

  test("produces identical ordering to Python version", () => {
    // The Python MODULE_SPECS order is the canonical topological sort.
    const expectedOrder = [
      "system",
      "timezone",
      "tailscale",
      "ssh",
      "firewall",
      "zsh",
      "tmux",
      "devtools",
      "rclone",
      "github",
      "shell",
      "gnome_terminal",
      "claude",
      "claw",
    ];
    const actualOrder = resolveOrder().map((s) => s.key);
    expect(actualOrder).toEqual(expectedOrder);
  });
});
