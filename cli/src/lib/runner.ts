// Spawns module shell scripts and parses the JSON Lines protocol.
//
// Contract (see modules/_lib.sh):
//   - Child reads a single JSON object from stdin (ModuleContext).
//   - Child writes JSON Lines to stdout, one ModuleEvent per line.
//   - Exit codes: 0 = ok, 1 = fail, 2 = skip.
//   - stderr is buffered and surfaced to callers opting into verbose output.

import { spawn } from "node:child_process";
import type { ModuleContext, ModuleEvent, ModuleMode, Status } from "./types.js";
import { ModuleExitCode } from "./types.js";

export interface RunOptions {
  /** Kill the child with SIGTERM after this many milliseconds. */
  timeoutMs?: number;
  /** Abort signal — triggers SIGTERM on the child when aborted. */
  signal?: AbortSignal;
  /** Invoked for each stderr line (no trailing newline). */
  onStderr?: (line: string) => void;
  /** Override the bash executable (defaults to "bash"). Useful for tests. */
  bashPath?: string;
}

export interface RunResult {
  exitCode: number;
  status: Status;
  /** Full accumulated stderr. */
  stderr: string;
  /** True when the run ended because of a timeout. */
  timedOut: boolean;
}

function statusFromExitCode(code: number): Status {
  if (code === ModuleExitCode.Success) return "ok";
  if (code === ModuleExitCode.Skip) return "skip";
  return "fail";
}

function isStatus(value: unknown): value is Status {
  return value === "ok" || value === "warn" || value === "skip" || value === "fail";
}

function isModuleEvent(value: unknown): value is ModuleEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case "progress":
      return typeof v.message === "string" && (v.percent === undefined || typeof v.percent === "number");
    case "result":
      return isStatus(v.status) && typeof v.detail === "string";
    case "check":
      return (
        typeof v.label === "string" && isStatus(v.status) && (v.detail === undefined || typeof v.detail === "string")
      );
    case "install":
      return typeof v.tool === "string" && typeof v.source === "string" && typeof v.verified === "boolean";
    default:
      return false;
  }
}

function parseEventLine(line: string): ModuleEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isModuleEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Run a module script, yielding each parsed event. The generator's return value
 * is a RunResult summarizing the exit code, derived status, and captured stderr.
 *
 * Malformed JSON lines are silently dropped — modules may emit arbitrary noise
 * to stdout (e.g. tool output before suppression is wired up), and we treat
 * only well-formed protocol events as meaningful.
 */
export async function* runModule(
  scriptPath: string,
  context: ModuleContext,
  mode: ModuleMode,
  options: RunOptions = {},
): AsyncGenerator<ModuleEvent, RunResult> {
  // `detached: true` puts the child in its own process group so we can kill
  // the entire tree on abort/timeout. Without this, grandchildren (e.g. a
  // sleeping curl/apt inside the script) inherit stdout and keep our pipe
  // open long after bash itself has been signalled.
  const child = spawn(options.bashPath ?? "bash", [scriptPath, mode], {
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });

  const killTree = (sig: NodeJS.Signals = "SIGTERM") => {
    if (child.pid === undefined) return;
    try {
      process.kill(-child.pid, sig);
    } catch {
      // Process group may already be gone — fine.
    }
  };

  let timedOut = false;
  const timeoutId =
    options.timeoutMs !== undefined
      ? setTimeout(() => {
          timedOut = true;
          killTree("SIGTERM");
        }, options.timeoutMs)
      : undefined;

  const abortHandler = () => killTree("SIGTERM");
  if (options.signal) {
    if (options.signal.aborted) {
      abortHandler();
    } else {
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }
  }

  const closePromise = new Promise<number>((resolve, reject) => {
    child.on("close", (code) => resolve(code ?? ModuleExitCode.Failure));
    child.on("error", reject);
  });

  let stderrBuf = "";
  let stderrCarry = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrBuf += chunk;
    if (!options.onStderr) return;
    stderrCarry += chunk;
    const lines = stderrCarry.split("\n");
    stderrCarry = lines.pop() ?? "";
    for (const line of lines) options.onStderr(line);
  });

  // Close stdin so `read_context` in the child sees EOF.
  child.stdin.write(`${JSON.stringify(context)}\n`);
  child.stdin.end();

  let exited = false;
  try {
    child.stdout.setEncoding("utf8");
    let carry = "";
    for await (const chunk of child.stdout as AsyncIterable<string>) {
      carry += chunk;
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseEventLine(line);
        if (event) yield event;
      }
    }
    if (carry) {
      const event = parseEventLine(carry);
      if (event) yield event;
    }

    const exitCode = await closePromise;
    exited = true;
    if (stderrCarry && options.onStderr) options.onStderr(stderrCarry);

    return {
      exitCode,
      status: timedOut ? "fail" : statusFromExitCode(exitCode),
      stderr: stderrBuf,
      timedOut,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortHandler);
    // If the consumer abandoned the generator (early return / thrown error),
    // kill the process group so detached children don't linger.
    if (!exited) killTree("SIGTERM");
  }
}
