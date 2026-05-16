import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJson, updateJson } from "../lib/jsonConfig.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "devlair-jsonconfig-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("readJson", () => {
  test("returns {} for missing file", () => {
    expect(readJson(join(tmpDir, "missing.json"))).toEqual({});
  });

  test("returns parsed contents", () => {
    const path = join(tmpDir, "ok.json");
    writeFileSync(path, JSON.stringify({ a: 1, b: "two" }));
    expect(readJson(path)).toEqual({ a: 1, b: "two" });
  });

  test("returns {} for corrupt JSON", () => {
    const path = join(tmpDir, "bad.json");
    writeFileSync(path, "{ this is not json");
    expect(readJson(path)).toEqual({});
  });

  test("returns {} for non-object JSON", () => {
    const path = join(tmpDir, "list.json");
    writeFileSync(path, "[1, 2, 3]");
    expect(readJson(path)).toEqual({});
  });
});

describe("updateJson", () => {
  test("creates file with parent dir", () => {
    const path = join(tmpDir, "nested", "deep", "config.json");
    updateJson(path, { model: "sonnet" });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ model: "sonnet" });
  });

  test("merges with existing keys", () => {
    const path = join(tmpDir, "merge.json");
    writeFileSync(path, JSON.stringify({ a: 1, model: "old" }));
    updateJson(path, { model: "opus[1m]", b: 2 });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ a: 1, model: "opus[1m]", b: 2 });
  });

  test("overwrites corrupt files cleanly", () => {
    const path = join(tmpDir, "broken.json");
    writeFileSync(path, "garbage");
    updateJson(path, { model: "sonnet" });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ model: "sonnet" });
  });

  test("writes trailing newline", () => {
    const path = join(tmpDir, "newline.json");
    updateJson(path, { x: 1 });
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });
});
