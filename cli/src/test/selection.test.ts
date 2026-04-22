import { describe, expect, test } from "bun:test";
import type { InitFlags } from "../lib/args.js";
import { selectModules } from "../lib/selection.js";

function flags(overrides: Partial<InitFlags> = {}): InitFlags {
  return {
    only: null,
    skip: new Set(),
    group: null,
    config: null,
    ...overrides,
  };
}

describe("selectModules", () => {
  test("selects all default modules on linux with no flags", () => {
    const { selected, optional, platformSkipped } = selectModules(flags(), "linux");
    const keys = selected.map((s) => s.key);
    // Should include default-on modules
    expect(keys).toContain("system");
    expect(keys).toContain("zsh");
    expect(keys).toContain("devtools");
    // Should NOT include opt-in modules (they go to optional)
    expect(keys).not.toContain("rclone");
    expect(keys).not.toContain("claude");
    // Optional should contain opt-in modules
    const optKeys = optional.map((s) => s.key);
    expect(optKeys).toContain("rclone");
    expect(optKeys).toContain("claude");
    // No platform-skipped on linux
    expect(platformSkipped).toHaveLength(0);
  });

  test("filters linux-only modules on WSL", () => {
    const { selected, platformSkipped } = selectModules(flags(), "wsl");
    const keys = selected.map((s) => s.key);
    expect(keys).not.toContain("timezone");
    expect(keys).not.toContain("ssh");
    expect(keys).not.toContain("firewall");
    expect(keys).not.toContain("gnome_terminal");
    // Should still include cross-platform modules
    expect(keys).toContain("system");
    expect(keys).toContain("zsh");
    // Platform-skipped should list the excluded modules
    const skippedKeys = platformSkipped.map((s) => s.key);
    expect(skippedKeys).toContain("timezone");
    expect(skippedKeys).toContain("ssh");
  });

  test("--group narrows to specified groups", () => {
    const { selected } = selectModules(flags({ group: new Set(["core"]) }), "linux");
    const keys = selected.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["system", "timezone", "zsh", "shell"]));
    expect(keys).not.toContain("tmux");
    expect(keys).not.toContain("devtools");
  });

  test("--only selects specific modules with deps", () => {
    const { selected } = selectModules(flags({ only: new Set(["shell"]) }), "linux");
    const keys = selected.map((s) => s.key);
    // shell depends on zsh — should be auto-expanded
    expect(keys).toContain("zsh");
    expect(keys).toContain("shell");
    expect(keys).toHaveLength(2);
  });

  test("--only overrides default-off (opt-in modules)", () => {
    const { selected, optional } = selectModules(flags({ only: new Set(["claude"]) }), "linux");
    const keys = selected.map((s) => s.key);
    expect(keys).toContain("claude");
    expect(keys).toContain("devtools"); // dependency
    // When explicitly requested, nothing goes to optional
    expect(optional).toHaveLength(0);
  });

  test("--skip removes specified modules", () => {
    const { selected } = selectModules(flags({ group: new Set(["core"]), skip: new Set(["timezone"]) }), "linux");
    const keys = selected.map((s) => s.key);
    expect(keys).not.toContain("timezone");
    expect(keys).toContain("system");
  });

  test("preserves topological order", () => {
    const { selected } = selectModules(flags({ only: new Set(["firewall"]) }), "linux");
    const keys = selected.map((s) => s.key);
    // firewall → ssh → tailscale
    expect(keys.indexOf("tailscale")).toBeLessThan(keys.indexOf("ssh"));
    expect(keys.indexOf("ssh")).toBeLessThan(keys.indexOf("firewall"));
  });

  test("--only + --group intersects", () => {
    const { selected } = selectModules(flags({ group: new Set(["core"]), only: new Set(["system", "tmux"]) }), "linux");
    const keys = selected.map((s) => s.key);
    // Only "system" is in both core group AND the --only set
    expect(keys).toContain("system");
    expect(keys).not.toContain("tmux"); // tmux is coding, not core
  });
});
