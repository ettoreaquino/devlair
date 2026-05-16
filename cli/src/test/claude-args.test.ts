import { describe, expect, test } from "bun:test";
import { parseClaudeFlags, parseDisablePasswordFlags } from "../lib/args.js";

describe("parseClaudeFlags", () => {
  test("no args -> defaults", () => {
    const f = parseClaudeFlags([]);
    expect(f.plan).toBeNull();
    expect(f.toggle1m).toBeNull();
    expect(f.channels).toBe(false);
    expect(f.error).toBeNull();
  });

  test("--channels", () => {
    expect(parseClaudeFlags(["--channels"]).channels).toBe(true);
  });

  test("--plan valid", () => {
    const f = parseClaudeFlags(["--plan", "max20x"]);
    expect(f.plan).toBe("max20x");
    expect(f.error).toBeNull();
  });

  test("--plan invalid value", () => {
    const f = parseClaudeFlags(["--plan", "starter"]);
    expect(f.plan).toBeNull();
    expect(f.error).toMatch(/Unknown plan 'starter'/);
  });

  test("--plan missing value", () => {
    const f = parseClaudeFlags(["--plan"]);
    expect(f.error).toMatch(/Missing value for --plan/);
  });

  test("--1m on", () => {
    expect(parseClaudeFlags(["--1m", "on"]).toggle1m).toBe("on");
  });

  test("--1m off", () => {
    expect(parseClaudeFlags(["--1m", "off"]).toggle1m).toBe("off");
  });

  test("--1m invalid value", () => {
    const f = parseClaudeFlags(["--1m", "maybe"]);
    expect(f.toggle1m).toBeNull();
    expect(f.error).toMatch(/--1m requires 'on' or 'off'/);
  });
});

describe("parseDisablePasswordFlags", () => {
  test("no args", () => {
    expect(parseDisablePasswordFlags([]).yes).toBe(false);
  });

  test("--yes", () => {
    expect(parseDisablePasswordFlags(["--yes"]).yes).toBe(true);
  });

  test("-y short form", () => {
    expect(parseDisablePasswordFlags(["-y"]).yes).toBe(true);
  });
});
