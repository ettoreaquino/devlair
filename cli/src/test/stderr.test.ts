import { describe, expect, test } from "bun:test";
import { pickStderrDetail } from "../lib/stderr.js";

describe("pickStderrDetail", () => {
  test("returns empty string for blank stderr", () => {
    expect(pickStderrDetail("")).toBe("");
    expect(pickStderrDetail("   \n\n  ")).toBe("");
  });

  test("prefers first E: line over apt meta-summary", () => {
    const stderr = [
      "Setting up openssh-server (1:9.2p1-2ubuntu3) ...",
      "E: Could not execute systemctl",
      "Errors were encountered while processing:",
      "  openssh-server",
      "E: Sub-process /usr/bin/dpkg returned an error code (1)",
    ].join("\n");

    expect(pickStderrDetail(stderr)).toBe("E: Could not execute systemctl");
  });

  test("picks first E: line when multiple E: lines exist (root cause first)", () => {
    const stderr = [
      "E: installed openssh-server package post-installation script subprocess returned error exit status 1",
      "E: Sub-process /usr/bin/dpkg returned an error code (1)",
    ].join("\n");

    expect(pickStderrDetail(stderr)).toBe(
      "E: installed openssh-server package post-installation script subprocess returned error exit status 1",
    );
  });

  test("falls back to last meaningful line for dpkg non-E: errors", () => {
    const stderr = [
      "dpkg: error processing package broken-pkg (--configure):",
      " subprocess installed post-installation script returned error exit status 1",
      "Errors were encountered while processing:",
      " broken-pkg",
    ].join("\n");

    expect(pickStderrDetail(stderr)).toBe("broken-pkg");
  });

  test("falls back to last meaningful line for generic command-not-found", () => {
    const stderr = "/bin/sh: 1: timedatectl: not found";
    expect(pickStderrDetail(stderr)).toBe("/bin/sh: 1: timedatectl: not found");
  });

  test("skips separator-only lines when falling back", () => {
    const stderr = ["something went wrong", "---", "..."].join("\n");
    expect(pickStderrDetail(stderr)).toBe("something went wrong");
  });

  test("truncates lines longer than 120 characters", () => {
    const long = `E: ${"x".repeat(200)}`;
    const result = pickStderrDetail(long);
    expect(result.length).toBe(120);
    expect(result.endsWith("…")).toBe(true);
  });

  test("preserves short lines unchanged", () => {
    expect(pickStderrDetail("E: Permission denied")).toBe("E: Permission denied");
  });
});
