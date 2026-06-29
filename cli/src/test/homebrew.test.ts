import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decidePreFlight } from "../lib/homebrew.js";

describe("decidePreFlight", () => {
  test("uses existing brew when installed (regardless of admin/tty)", () => {
    expect(decidePreFlight({ brewInstalled: true, isAdmin: false, hasTTY: false })).toEqual({
      kind: "use-existing",
    });
  });

  test("errors for a non-admin when brew is missing", () => {
    expect(decidePreFlight({ brewInstalled: false, isAdmin: false, hasTTY: true })).toEqual({
      kind: "error-non-admin",
    });
  });

  test("errors when admin but no interactive TTY to prompt for the password", () => {
    expect(decidePreFlight({ brewInstalled: false, isAdmin: true, hasTTY: false })).toEqual({
      kind: "error-no-tty",
    });
  });

  test("installs when admin with a TTY and brew is missing", () => {
    expect(decidePreFlight({ brewInstalled: false, isAdmin: true, hasTTY: true })).toEqual({
      kind: "install",
    });
  });
});

describe("managed zsh config", () => {
  // zimfw's `environment` module enables NO_CLOBBER, which breaks `>>` to a
  // nonexistent file (e.g. Homebrew's `... >> ~/.zprofile`). The header must
  // re-enable APPEND_CREATE so that pattern works on a clean machine.
  test("zshrc-header sets APPEND_CREATE after sourcing init.zsh", () => {
    const header = readFileSync(join(import.meta.dir, "../../modules/configs/zshrc-header.sh"), "utf8");
    expect(header).toContain("setopt APPEND_CREATE");
    expect(header.indexOf("setopt APPEND_CREATE")).toBeGreaterThan(header.indexOf('source "$ZIM_HOME/init.zsh"'));
  });
});
