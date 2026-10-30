import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pins from "../../modules/pins.json" with { type: "json" };
import { downloadPinned } from "../lib/homebrew.js";

const MODULES_DIR = join(import.meta.dir, "../../modules");

function moduleSources(): Array<[string, string]> {
  const dirs = [MODULES_DIR, join(MODULES_DIR, "configs")];
  return dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".sh") || f.endsWith(".zsh"))
      .map((f): [string, string] => [f, readFileSync(join(dir, f), "utf8")]),
  );
}

describe("installer pins", () => {
  test("every pin has an https URL on an immutable ref and a SHA-256", () => {
    for (const [tool, pin] of Object.entries(pins)) {
      expect(pin.url, tool).toStartWith("https://");
      expect(pin.url, tool).not.toMatch(/\/(HEAD|master|main|latest)\//);
      expect(pin.sha256, tool).toMatch(/^[0-9a-f]{64}$/);
      // Only claude.ai/install.sh has no versioned URL; its version stays empty.
      if (tool !== "claude") expect(pin.url, tool).toContain(pin.version);
    }
  });

  test("every download_pinned call names a pinned tool", () => {
    const used = new Set<string>();
    for (const [, src] of moduleSources()) {
      for (const m of src.matchAll(/download_pinned ([a-z-]+)/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const tool of used) expect(Object.keys(pins), tool).toContain(tool);
  });

  test("modules never run an unverified download", () => {
    for (const [file, src] of moduleSources()) {
      expect(src, file).not.toContain("download_script");
      expect(src, file).not.toContain("releases/latest");
      expect(src, file).not.toMatch(/curl[^\n]*\|\s*(ba|z)?sh\b/);
    }
  });
});

describe("downloadPinned (Homebrew pre-flight)", () => {
  let dir: string;
  let url: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "devlair-pin-fixture-"));
    const fixture = join(dir, "fixture.sh");
    writeFileSync(fixture, "echo brew\n");
    url = `file://${fixture}`;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("returns the file when the SHA-256 matches", () => {
    const sha256 = new Bun.CryptoHasher("sha256").update("echo brew\n").digest("hex");
    expect(readFileSync(downloadPinned({ url, sha256 }), "utf8")).toBe("echo brew\n");
  });

  test("throws on a tampered script", () => {
    expect(() => downloadPinned({ url, sha256: "0".repeat(64) })).toThrow(/checksum mismatch/);
  });
});
