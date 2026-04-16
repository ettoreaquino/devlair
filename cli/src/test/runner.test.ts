import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunResult, runModule } from "../lib/runner.js";
import type { ModuleContext, ModuleEvent, ModuleMode } from "../lib/types.js";

const LIB_PATH = join(import.meta.dir, "../../../modules/_lib.sh");

function ctx(overrides: Partial<ModuleContext> = {}): ModuleContext {
  return {
    username: "tester",
    userHome: "/home/tester",
    platform: "linux",
    wslVersion: null,
    config: {},
    ...overrides,
  };
}

async function collect(
  script: string,
  context: ModuleContext = ctx(),
  mode: ModuleMode = "run",
  options: Parameters<typeof runModule>[3] = {},
) {
  const events: ModuleEvent[] = [];
  const iter = runModule(script, context, mode, options);
  while (true) {
    const { value, done } = await iter.next();
    if (done) return { events, result: value };
    events.push(value);
  }
}

let tmpDir: string;

function writeScript(name: string, body: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}`, { mode: 0o755 });
  return path;
}

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "devlair-runner-"));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("runModule", () => {
  test("parses progress, install, and result events", async () => {
    const script = writeScript(
      "happy.sh",
      `source "${LIB_PATH}"
read_context
json_progress "starting" 10
json_install "uv" "astral.sh" true
json_result "ok" "done"
exit 0`,
    );

    const { events, result } = await collect(script);

    expect(events).toEqual([
      { type: "progress", message: "starting", percent: 10 },
      { type: "install", tool: "uv", source: "astral.sh", verified: true },
      { type: "result", status: "ok", detail: "done" },
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("ok");
    expect(result.timedOut).toBe(false);
  });

  test("emits check events in check mode", async () => {
    const script = writeScript(
      "check.sh",
      `source "${LIB_PATH}"
read_context
mode=\${1:-run}
if [[ "$mode" == "check" ]]; then
  json_check "zsh installed" "ok"
  json_check ".zimrc present" "fail" "missing"
fi
exit 0`,
    );

    const { events } = await collect(script, ctx(), "check");

    expect(events).toEqual([
      { type: "check", label: "zsh installed", status: "ok", detail: "" },
      { type: "check", label: ".zimrc present", status: "fail", detail: "missing" },
    ]);
  });

  test("maps exit code 1 to fail", async () => {
    const script = writeScript(
      "fail.sh",
      `source "${LIB_PATH}"
read_context
json_result "fail" "boom"
exit 1`,
    );
    const { result } = await collect(script);
    expect(result.exitCode).toBe(1);
    expect(result.status).toBe("fail");
  });

  test("maps exit code 2 to skip", async () => {
    const script = writeScript(
      "skip.sh",
      `source "${LIB_PATH}"
read_context
json_result "skip" "not applicable"
exit 2`,
    );
    const { result } = await collect(script);
    expect(result.exitCode).toBe(2);
    expect(result.status).toBe("skip");
  });

  test("delivers context via stdin", async () => {
    const script = writeScript(
      "ctx.sh",
      `source "${LIB_PATH}"
read_context
user=$(ctx_get username)
home=$(ctx_get userHome)
json_result "ok" "hello $user at $home"
exit 0`,
    );
    const { events } = await collect(script, ctx({ username: "alice", userHome: "/home/alice" }));
    expect(events).toContainEqual({
      type: "result",
      status: "ok",
      detail: "hello alice at /home/alice",
    });
  });

  test("drops malformed JSON lines without failing", async () => {
    const script = writeScript(
      "noisy.sh",
      `source "${LIB_PATH}"
read_context
echo "not json"
json_progress "ok"
echo "{broken"
json_result "ok" "done"
exit 0`,
    );
    const { events, result } = await collect(script);
    expect(events).toEqual([
      { type: "progress", message: "ok" },
      { type: "result", status: "ok", detail: "done" },
    ]);
    expect(result.status).toBe("ok");
  });

  test("captures stderr and streams via onStderr callback", async () => {
    const script = writeScript(
      "stderr.sh",
      `source "${LIB_PATH}"
read_context
echo "debug line 1" >&2
echo "debug line 2" >&2
json_result "ok" "done"
exit 0`,
    );
    const stderrLines: string[] = [];
    const { result } = await collect(script, ctx(), "run", { onStderr: (line) => stderrLines.push(line) });
    expect(stderrLines).toEqual(["debug line 1", "debug line 2"]);
    expect(result.stderr).toContain("debug line 1");
    expect(result.stderr).toContain("debug line 2");
  });

  test("timeout kills child and sets timedOut flag", async () => {
    const script = writeScript(
      "slow.sh",
      `source "${LIB_PATH}"
read_context
json_progress "starting"
sleep 10
json_result "ok" "finished"
exit 0`,
    );
    const { result } = await collect(script, ctx(), "run", { timeoutMs: 200 });
    expect(result.timedOut).toBe(true);
    expect(result.status).toBe("fail");
  });

  test("abort signal kills child", async () => {
    const script = writeScript(
      "abortable.sh",
      `source "${LIB_PATH}"
read_context
json_progress "started"
sleep 10
exit 0`,
    );
    const controller = new AbortController();
    const iter = runModule(script, ctx(), "run", { signal: controller.signal });
    const first = await iter.next();
    expect(first.done).toBe(false);
    controller.abort();
    let final: IteratorResult<ModuleEvent, RunResult>;
    do {
      final = await iter.next();
    } while (!final.done);
    expect(final.value.status).toBe("fail");
  });

  test("passes mode argument to the script", async () => {
    const script = writeScript(
      "mode.sh",
      `source "${LIB_PATH}"
read_context
json_result "ok" "mode=\${1:-none}"
exit 0`,
    );
    const { events: runEvents } = await collect(script, ctx(), "run");
    const { events: checkEvents } = await collect(script, ctx(), "check");
    expect(runEvents).toContainEqual({ type: "result", status: "ok", detail: "mode=run" });
    expect(checkEvents).toContainEqual({ type: "result", status: "ok", detail: "mode=check" });
  });
});

describe("_lib.sh json helpers", () => {
  function runLibScript(body: string): { stdout: string; code: number } {
    const scriptPath = join(tmpDir, `lib-${Math.random().toString(36).slice(2)}.sh`);
    writeFileSync(scriptPath, `#!/usr/bin/env bash\nsource "${LIB_PATH}"\n${body}`, { mode: 0o755 });
    const out = spawnSync("bash", [scriptPath], { encoding: "utf8", input: "{}" });
    return { stdout: out.stdout, code: out.status ?? -1 };
  }

  test("json_escape handles quotes, newlines, tabs, and backslashes", () => {
    const { stdout } = runLibScript(String.raw`
input='He said "hi"
line2	tab\back'
json_escape "$input"
`);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toBe('He said "hi"\nline2\ttab\\back');
  });

  test("json_progress with and without percent", () => {
    const { stdout } = runLibScript(`json_progress "hello"
json_progress "halfway" 50`);
    const lines = stdout
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ type: "progress", message: "hello" });
    expect(lines[1]).toEqual({ type: "progress", message: "halfway", percent: 50 });
  });

  test("json_result requires valid JSON", () => {
    const { stdout } = runLibScript(`json_result "ok" "14 packages installed"`);
    expect(JSON.parse(stdout.trim())).toEqual({
      type: "result",
      status: "ok",
      detail: "14 packages installed",
    });
  });

  test("json_check with and without detail", () => {
    const { stdout } = runLibScript(`json_check "zsh" "ok"
json_check "zimrc" "fail" "missing"`);
    const lines = stdout
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ type: "check", label: "zsh", status: "ok", detail: "" });
    expect(lines[1]).toEqual({ type: "check", label: "zimrc", status: "fail", detail: "missing" });
  });

  test("json_install default verified is false", () => {
    const { stdout } = runLibScript(`json_install "uv" "astral.sh"
json_install "awscli" "aws.amazon.com" true`);
    const lines = stdout
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ type: "install", tool: "uv", source: "astral.sh", verified: false });
    expect(lines[1]).toEqual({ type: "install", tool: "awscli", source: "aws.amazon.com", verified: true });
  });

  test("ctx_get reads top-level keys from context", () => {
    const scriptPath = join(tmpDir, "ctx-get.sh");
    writeFileSync(
      scriptPath,
      `#!/usr/bin/env bash\nsource "${LIB_PATH}"\nread_context\necho "user=$(ctx_get username)"\necho "home=$(ctx_get userHome)"\necho "missing=$(ctx_get nope)"\n`,
      { mode: 0o755 },
    );
    const out = spawnSync("bash", [scriptPath], {
      encoding: "utf8",
      input: JSON.stringify({ username: "bob", userHome: "/home/bob" }),
    });
    expect(out.stdout).toBe("user=bob\nhome=/home/bob\nmissing=\n");
  });
});
