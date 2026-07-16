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

  // The minimal-arrow prompt only wins if its PROMPT assignment runs AFTER the
  // dracula/zsh theme (sourced by init.zsh) sets its own. The prompt is built in
  // a precmd hook (so the git branch tracks cd/checkout), which runs on every
  // render — after init.zsh. Guards the template so the override can't be
  // silently dropped again (issue #272 follow-up).
  test("zshrc-header overrides PROMPT after sourcing init.zsh", () => {
    const header = readFileSync(join(import.meta.dir, "../../modules/configs/zshrc-header.sh"), "utf8");
    const initIdx = header.indexOf('source "$ZIM_HOME/init.zsh"');
    // PROMPT is assigned (inside the precmd builder) and registered as a precmd,
    // both after init.zsh so they win over the theme.
    expect(header).toMatch(/^\s*PROMPT=/m);
    expect(header.search(/^\s*PROMPT=/m)).toBeGreaterThan(initIdx);
    expect(header).toMatch(/precmd_functions\+=/);
    expect(header.search(/precmd_functions\+=/)).toBeGreaterThan(initIdx);
  });

  // A branch name is attacker-controlled (clone/cd into a hostile repo). The
  // prompt must NOT enable PROMPT_SUBST — with it, a branch like `$(rm -rf ~)`
  // is command-substituted on every render. Guards against reintroducing it.
  test("zshrc-header does not enable PROMPT_SUBST (branch-name RCE guard)", () => {
    const header = readFileSync(join(import.meta.dir, "../../modules/configs/zshrc-header.sh"), "utf8");
    expect(header).not.toMatch(/setopt\s+(\w+\s+)*prompt_subst/i);
  });

  // zsh.sh must RE-APPLY the header on every run (keyed off shell.sh's aliases
  // marker), not skip when .zshrc already contains "devlair" — otherwise a
  // template change never reaches a machine an older devlair provisioned, which
  // is exactly why the #273 prompt fix didn't land on upgrade.
  test("zsh.sh refreshes the managed header instead of skipping when managed", () => {
    const zsh = readFileSync(join(import.meta.dir, "../../modules/zsh.sh"), "utf8");
    expect(zsh).not.toContain('! grep -q "devlair" "$zshrc"');
    expect(zsh).toContain("aliases_marker");
  });
});
