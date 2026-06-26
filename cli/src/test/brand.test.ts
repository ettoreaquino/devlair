import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_BRAND, brandFilePath, resolveBrand } from "../lib/brand.js";

let root: string;
let counter = 0;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "devlair-brand-"));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A fresh empty home dir so each case is independent of the others. */
function freshHome(): string {
  const home = join(root, `h${counter++}`);
  mkdirSync(home, { recursive: true });
  return home;
}

function persist(home: string, brand: string): void {
  mkdirSync(join(home, ".devlair"), { recursive: true });
  writeFileSync(brandFilePath(home), `${brand}\n`);
}

describe("resolveBrand", () => {
  test("explicit flag wins", () => {
    expect(resolveBrand("serena", freshHome())).toBe("serena");
  });

  test("default when no flag and nothing persisted", () => {
    expect(resolveBrand(undefined, freshHome())).toBe(DEFAULT_BRAND);
  });

  test("reads the persisted brand when no flag is given", () => {
    const home = freshHome();
    persist(home, "acme corp");
    expect(resolveBrand(undefined, home)).toBe("acme corp");
  });

  test("flag overrides a persisted brand", () => {
    const home = freshHome();
    persist(home, "acme corp");
    expect(resolveBrand("override", home)).toBe("override");
  });

  test("blank/whitespace flag is ignored, falling back to persisted/default", () => {
    const home = freshHome();
    persist(home, "acme corp");
    expect(resolveBrand("   ", home)).toBe("acme corp");
    expect(resolveBrand("   ", freshHome())).toBe(DEFAULT_BRAND);
  });
});
