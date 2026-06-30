import { describe, expect, test } from "bun:test";
import {
  GROUPS,
  MODULE_SPECS,
  REAPPLY_KEYS,
  keysForGroups,
  resolveOrder,
  resolveTeardownOrder,
  validateDag,
} from "../lib/modules.js";

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
    for (const key of ["zsh", "tmux", "devtools", "shell", "gnome_terminal", "macos_terminal", "claude"]) {
      expect(REAPPLY_KEYS.has(key)).toBe(true);
    }
  });
});

describe("keysForGroups", () => {
  test("returns core modules", () => {
    const keys = keysForGroups(new Set(["core"]));
    expect(keys).toEqual(new Set(["system", "timezone", "homebrew", "zsh", "shell"]));
  });

  test("returns network modules", () => {
    const keys = keysForGroups(new Set(["network"]));
    expect(keys).toEqual(new Set(["tailscale", "ssh", "firewall"]));
  });

  test("returns multiple groups", () => {
    const keys = keysForGroups(new Set(["core", "coding"]));
    expect(keys).toEqual(new Set(["system", "timezone", "homebrew", "zsh", "shell", "tmux", "devtools", "github"]));
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

  test("filters by platform: wsl", () => {
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

  test("filters by platform: macos", () => {
    const macosSpecs = resolveOrder(undefined, "macos");
    const macosKeys = macosSpecs.map((s) => s.key);
    expect(macosKeys).toContain("system");
    expect(macosKeys).toContain("homebrew");
    expect(macosKeys).toContain("zsh");
    expect(macosKeys).toContain("devtools");
    // Linux-only modules are excluded on macOS
    expect(macosKeys).not.toContain("ssh");
    expect(macosKeys).not.toContain("timezone");
    expect(macosKeys).not.toContain("firewall");
    expect(macosKeys).not.toContain("gnome_terminal");
    // macOS-only modules are present
    expect(macosKeys).toContain("macos_terminal");
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

  test("produces correct topological ordering", () => {
    const expectedOrder = [
      "homebrew",
      "system",
      "timezone",
      "tailscale",
      "ssh",
      "firewall",
      "zsh",
      "tmux",
      "devtools",
      "github",
      "shell",
      "gnome_terminal",
      "macos_terminal",
      "claude",
    ];
    const actualOrder = resolveOrder().map((s) => s.key);
    expect(actualOrder).toEqual(expectedOrder);
  });
});

describe("resolveTeardownOrder", () => {
  test("is the exact reverse of the install order", () => {
    const install = resolveOrder().map((s) => s.key);
    const teardown = resolveTeardownOrder().map((s) => s.key);
    expect(teardown).toEqual([...install].reverse());
  });

  test("removes dependents before their dependencies", () => {
    const order = resolveTeardownOrder().map((s) => s.key);
    // firewall → ssh → tailscale, and shell → zsh
    expect(order.indexOf("firewall")).toBeLessThan(order.indexOf("ssh"));
    expect(order.indexOf("ssh")).toBeLessThan(order.indexOf("tailscale"));
    expect(order.indexOf("shell")).toBeLessThan(order.indexOf("zsh"));
    expect(order.indexOf("claude")).toBeLessThan(order.indexOf("devtools"));
  });

  test("filters by platform", () => {
    const macos = resolveTeardownOrder("macos").map((s) => s.key);
    expect(macos).not.toContain("firewall");
    expect(macos).not.toContain("ssh");
    expect(macos).toContain("homebrew");
  });
});
