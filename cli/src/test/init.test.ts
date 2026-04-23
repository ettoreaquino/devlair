/**
 * Integration test for the init execution loop.
 * Uses mock shell scripts that speak the JSON Lines protocol.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runModule } from "../lib/runner.js";
import type { ModuleContext, ModuleEvent, Status } from "../lib/types.js";

const LIB_PATH = join(import.meta.dir, "../../../modules/_lib.sh");

let tmpDir: string;

function ctx(): ModuleContext {
  return {
    username: "tester",
    userHome: "/home/tester",
    platform: "linux",
    wslVersion: null,
    config: {},
  };
}

function writeScript(name: string, body: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, `#!/usr/bin/env bash\nsource "${LIB_PATH}"\nread_context\n${body}`, { mode: 0o755 });
  return path;
}

async function collect(script: string, context: ModuleContext = ctx()) {
  const events: ModuleEvent[] = [];
  const iter = runModule(script, context, "run");
  while (true) {
    const { value, done } = await iter.next();
    if (done) return { events, result: value };
    events.push(value);
  }
}

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "devlair-init-"));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("init execution loop", () => {
  test("successful module emits progress and result events", async () => {
    const script = writeScript(
      "ok.sh",
      `json_progress "installing packages"
json_install "git" "apt" true
json_result "ok" "3 packages installed"
exit 0`,
    );
    const { events, result } = await collect(script);

    expect(result.status).toBe("ok");
    expect(result.exitCode).toBe(0);
    expect(events).toContainEqual({ type: "progress", message: "installing packages" });
    expect(events).toContainEqual({ type: "install", tool: "git", source: "apt", verified: true });
    expect(events).toContainEqual({ type: "result", status: "ok", detail: "3 packages installed" });
  });

  test("skipped module returns exit code 2", async () => {
    const script = writeScript(
      "skip.sh",
      `json_result "skip" "not applicable on this platform"
exit 2`,
    );
    const { result } = await collect(script);
    expect(result.status).toBe("skip");
    expect(result.exitCode).toBe(2);
  });

  test("failed module returns exit code 1", async () => {
    const script = writeScript(
      "fail.sh",
      `json_progress "trying"
json_result "fail" "apt-get failed"
exit 1`,
    );
    const { events, result } = await collect(script);
    expect(result.status).toBe("fail");
    expect(events).toContainEqual({ type: "progress", message: "trying" });
  });

  test("sequential execution of multiple mock modules", async () => {
    const scripts = [
      writeScript("seq-ok.sh", 'json_result "ok" "done"\nexit 0'),
      writeScript("seq-skip.sh", 'json_result "skip" "n/a"\nexit 2'),
      writeScript("seq-fail.sh", 'json_result "fail" "error"\nexit 1'),
    ];

    const results: { status: Status; detail: string }[] = [];
    for (const script of scripts) {
      const { events, result } = await collect(script);
      const resultEvent = events.find((e) => e.type === "result");
      results.push({
        status: result.status,
        detail: resultEvent?.type === "result" ? resultEvent.detail : "",
      });
    }

    expect(results).toEqual([
      { status: "ok", detail: "done" },
      { status: "skip", detail: "n/a" },
      { status: "fail", detail: "error" },
    ]);
  });

  test("context is delivered to the module", async () => {
    const script = writeScript(
      "ctx-check.sh",
      `user=$(ctx_get username)
platform=$(ctx_get platform)
json_result "ok" "user=$user platform=$platform"
exit 0`,
    );
    const { events } = await collect(script, ctx());
    expect(events).toContainEqual({
      type: "result",
      status: "ok",
      detail: "user=tester platform=linux",
    });
  });
});
