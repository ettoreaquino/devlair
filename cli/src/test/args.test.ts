import { describe, expect, test } from "bun:test";
import { parseInitFlags, parseUninstallFlags } from "../lib/args.js";

describe("parseInitFlags", () => {
  test("returns defaults when no flags", () => {
    const flags = parseInitFlags([]);
    expect(flags.only).toBeNull();
    expect(flags.skip).toEqual(new Set());
    expect(flags.group).toBeNull();
    expect(flags.config).toBeNull();
  });

  test("parses --only with comma-separated values", () => {
    const flags = parseInitFlags(["--only", "system,ssh,tmux"]);
    expect(flags.only).toEqual(new Set(["system", "ssh", "tmux"]));
  });

  test("parses --skip with comma-separated values", () => {
    const flags = parseInitFlags(["--skip", "devtools,claude"]);
    expect(flags.skip).toEqual(new Set(["devtools", "claude"]));
  });

  test("parses --group with comma-separated values", () => {
    const flags = parseInitFlags(["--group", "core,network"]);
    expect(flags.group).toEqual(new Set(["core", "network"]));
  });

  test("parses --config with a path", () => {
    const flags = parseInitFlags(["--config", "/tmp/setup.yaml"]);
    expect(flags.config).toBe("/tmp/setup.yaml");
  });

  test("parses multiple flags together", () => {
    const flags = parseInitFlags(["--group", "core", "--skip", "timezone", "--config", "my.yml"]);
    expect(flags.group).toEqual(new Set(["core"]));
    expect(flags.skip).toEqual(new Set(["timezone"]));
    expect(flags.config).toBe("my.yml");
    expect(flags.only).toBeNull();
  });

  test("parses single-value --only", () => {
    const flags = parseInitFlags(["--only", "system"]);
    expect(flags.only).toEqual(new Set(["system"]));
  });

  test("filters empty strings from comma-separated values", () => {
    const flags = parseInitFlags(["--only", "system,,ssh,"]);
    expect(flags.only).toEqual(new Set(["system", "ssh"]));
  });
});

describe("parseUninstallFlags", () => {
  test("defaults to interactive, packages removed, sensitive kept", () => {
    const f = parseUninstallFlags([]);
    expect(f.yes).toBe(false);
    expect(f.purge).toBe(false);
    expect(f.force).toBe(false);
    expect(f.keepPackages).toBe(false);
  });

  test("--yes / -y preselect keep (skip per-category prompts) but still confirm", () => {
    expect(parseUninstallFlags(["--yes"]).yes).toBe(true);
    expect(parseUninstallFlags(["-y"]).yes).toBe(true);
    expect(parseUninstallFlags(["--yes"]).force).toBe(false);
  });

  test("--purge preselects destroy (yes) but does not skip the confirm", () => {
    const f = parseUninstallFlags(["--purge"]);
    expect(f.purge).toBe(true);
    expect(f.yes).toBe(true);
    expect(f.force).toBe(false);
  });

  test("--force / -f is the only non-interactive escape hatch", () => {
    expect(parseUninstallFlags(["--force"]).force).toBe(true);
    expect(parseUninstallFlags(["-f"]).force).toBe(true);
    // --force alone keeps sensitive items (yes/purge unset).
    expect(parseUninstallFlags(["--force"]).yes).toBe(false);
    expect(parseUninstallFlags(["--force"]).purge).toBe(false);
  });

  test("--force --purge is non-interactive and destroys sensitive items", () => {
    const f = parseUninstallFlags(["--force", "--purge"]);
    expect(f.force).toBe(true);
    expect(f.purge).toBe(true);
    expect(f.yes).toBe(true);
  });

  test("--keep-packages is independent", () => {
    const f = parseUninstallFlags(["--keep-packages"]);
    expect(f.keepPackages).toBe(true);
    expect(f.yes).toBe(false);
    expect(f.purge).toBe(false);
    expect(f.force).toBe(false);
  });
});
