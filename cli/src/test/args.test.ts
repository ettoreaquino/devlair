import { describe, expect, test } from "bun:test";
import { parseInitFlags } from "../lib/args.js";

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
    const flags = parseInitFlags(["--skip", "rclone,claude"]);
    expect(flags.skip).toEqual(new Set(["rclone", "claude"]));
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
