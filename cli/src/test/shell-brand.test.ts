import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { runModule } from "../lib/runner.js";
import type { ModuleContext } from "../lib/types.js";

const SHELL_MODULE = join(import.meta.dir, "../../modules/shell.sh");
// The module chowns files to USERNAME; use the real invoking user so the
// chown succeeds for the unprivileged test process (chowning own files to self).
const REAL_USER = userInfo({ encoding: "utf8" }).username;

let root: string;
let counter = 0;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "devlair-shell-"));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function freshHome(): string {
  const home = join(root, `h${counter++}`);
  mkdirSync(home, { recursive: true });
  return home;
}

async function runShell(home: string, config: Record<string, unknown>): Promise<void> {
  const context: ModuleContext = {
    username: REAL_USER,
    userHome: home,
    platform: "macos",
    wslVersion: null,
    config,
  };
  const iter = runModule(SHELL_MODULE, context, "run");
  while (true) {
    const { done } = await iter.next();
    if (done) return;
  }
}

describe("shell module brand persistence", () => {
  test("persists --brand to ~/.devlair/brand; banner reads the persisted file", async () => {
    const home = freshHome();
    await runShell(home, { brand: "serena" });

    expect(readFileSync(join(home, ".devlair", "brand"), "utf8").trim()).toBe("serena");

    const zshrc = readFileSync(join(home, ".zshrc"), "utf8");
    // The generated banner reads the brand at login from the persisted file.
    expect(zshrc).toContain(".devlair/brand");
  });

  test("no brand in context writes no brand file (banner falls back to default)", async () => {
    const home = freshHome();
    await runShell(home, {});

    expect(existsSync(join(home, ".devlair", "brand"))).toBe(false);
    const zshrc = readFileSync(join(home, ".zshrc"), "utf8");
    expect(zshrc).toContain(".devlair/brand"); // read logic present
    expect(zshrc).toContain("d e v l a i r"); // default fallback retained
  });
});

describe("shell module .zshrc alias refresh", () => {
  const MARKER = "# ── devlair aliases ─";

  test("refresh keeps a newline between the header and the aliases block", async () => {
    const home = freshHome();
    // Simulate a prior devlair-managed .zshrc: a zimfw header ending in the
    // `source` line, followed by an existing aliases block. The marker being
    // present forces shell.sh down the refresh path (the bug only triggered on
    // re-runs, never on first install).
    const seeded = `export ZIM_HOME="$HOME/.zim"
source "$ZIM_HOME/init.zsh"
${MARKER}──
alias stale="echo old"
`;
    writeFileSync(join(home, ".zshrc"), seeded);

    await runShell(home, {});

    const zshrc = readFileSync(join(home, ".zshrc"), "utf8");
    // Regression: the aliases header must not be glued onto the source line.
    expect(zshrc).not.toContain('init.zsh"#');
    expect(zshrc).toContain('source "$ZIM_HOME/init.zsh"\n');
    // The refreshed block is still present.
    expect(zshrc).toContain(MARKER);
  });
});
