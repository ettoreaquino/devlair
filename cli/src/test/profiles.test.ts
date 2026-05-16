import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfileError, classifySource, loadProfile, parseProfile, resolveProfileKeys } from "../lib/profiles.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "devlair-profiles-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeProfile(filename: string, body: string): string {
  const path = join(tmpDir, filename);
  writeFileSync(path, body);
  return path;
}

describe("parseProfile", () => {
  test("accepts minimal valid profile", () => {
    expect(parseProfile("version: 1\n")).toEqual({ version: 1 });
  });

  test("accepts full profile", () => {
    const body = `
version: 1
name: full
groups: [core, coding]
skip: [system]
config:
  github:
    email: a@b.com
`;
    const data = parseProfile(body);
    expect(data.name).toBe("full");
    expect(data.groups).toEqual(["core", "coding"]);
    expect(data.skip).toEqual(["system"]);
    expect(data.config?.github).toEqual({ email: "a@b.com" });
  });

  test("rejects missing version", () => {
    expect(() => parseProfile("name: x\n")).toThrow(/Unsupported profile version/);
  });

  test("rejects wrong version", () => {
    expect(() => parseProfile("version: 2\n")).toThrow(/expected 1/);
  });

  test("rejects unknown group", () => {
    expect(() => parseProfile("version: 1\ngroups: [core, bogus]\n")).toThrow(/Unknown group 'bogus'/);
  });

  test("rejects unknown module", () => {
    expect(() => parseProfile("version: 1\nmodules: [system, bogus]\n")).toThrow(/Unknown module 'bogus'/);
  });

  test("rejects unknown module in skip", () => {
    expect(() => parseProfile("version: 1\nskip: [bogus]\n")).toThrow(/Unknown module 'bogus'/);
  });

  test("rejects unknown module in config", () => {
    expect(() => parseProfile("version: 1\nconfig:\n  bogus: {}\n")).toThrow(/Unknown module 'bogus' in config/);
  });

  test("rejects modules + groups together", () => {
    expect(() => parseProfile("version: 1\nmodules: [system]\ngroups: [core]\n")).toThrow(/mutually exclusive/);
  });

  test("rejects non-mapping YAML", () => {
    expect(() => parseProfile("- a\n- b\n")).toThrow(/must be a YAML mapping/);
  });

  test("rejects invalid YAML", () => {
    expect(() => parseProfile(":\n  - :\n  invalid: [\n")).toThrow(/Invalid YAML/);
  });

  test("rejects name as non-string", () => {
    expect(() => parseProfile("version: 1\nname: 123\n")).toThrow();
  });
});

describe("resolveProfileKeys", () => {
  test("modules become explicit want set", () => {
    const { want, skip } = resolveProfileKeys(parseProfile("version: 1\nmodules: [system, zsh]\n"));
    expect(want).toEqual(new Set(["system", "zsh"]));
    expect(skip).toEqual(new Set());
  });

  test("groups expand to module keys", () => {
    const { want } = resolveProfileKeys(parseProfile("version: 1\ngroups: [core]\n"));
    expect(want).toEqual(new Set(["system", "timezone", "zsh", "shell"]));
  });

  test("no selection returns null want", () => {
    const { want, skip } = resolveProfileKeys(parseProfile("version: 1\n"));
    expect(want).toBeNull();
    expect(skip).toEqual(new Set());
  });

  test("skip is preserved", () => {
    const { skip } = resolveProfileKeys(parseProfile("version: 1\nskip: [system, tmux]\n"));
    expect(skip).toEqual(new Set(["system", "tmux"]));
  });
});

describe("classifySource", () => {
  test("https URL", () => {
    const c = classifySource("https://example.com/p.yaml");
    expect(c.kind).toBe("url");
    expect(c.url).toBe("https://example.com/p.yaml");
  });

  test("rejects plaintext http URL", () => {
    expect(() => classifySource("http://example.com/p.yaml")).toThrow(ProfileError);
  });

  test("rejects GitHub shorthand with .. segments", () => {
    expect(() => classifySource("acme/profiles:../etc/passwd")).toThrow(ProfileError);
  });

  test("GitHub shorthand with default ref", () => {
    const c = classifySource("acme/profiles:dev.yaml");
    expect(c.kind).toBe("github");
    expect(c.url).toBe("https://raw.githubusercontent.com/acme/profiles/HEAD/dev.yaml");
  });

  test("GitHub shorthand with explicit ref", () => {
    const c = classifySource("acme/profiles@v1.2.0:nested/dev.yaml");
    expect(c.kind).toBe("github");
    expect(c.url).toBe("https://raw.githubusercontent.com/acme/profiles/v1.2.0/nested/dev.yaml");
  });

  test("local relative path", () => {
    const c = classifySource("./setup.yaml");
    expect(c.kind).toBe("file");
    expect(c.path).toBe("./setup.yaml");
  });

  test("local absolute path", () => {
    const c = classifySource("/tmp/setup.yaml");
    expect(c.kind).toBe("file");
  });
});

describe("loadProfile", () => {
  test("reads local file", async () => {
    const path = writeProfile("p.yaml", "version: 1\nname: local\n");
    const profile = await loadProfile(path);
    expect(profile.name).toBe("local");
  });

  test("missing local file raises ProfileError", async () => {
    await expect(loadProfile(join(tmpDir, "missing.yaml"))).rejects.toBeInstanceOf(ProfileError);
  });

  test("fetches via HTTPS URL using injected fetch", async () => {
    const fakeFetch = async () => new Response("version: 1\nname: remote\n", { status: 200, statusText: "OK" });
    const profile = await loadProfile("https://example.test/p.yaml", { fetchImpl: fakeFetch, noCache: true });
    expect(profile.name).toBe("remote");
  });

  test("resolves GitHub shorthand to raw.githubusercontent URL", async () => {
    let requested = "";
    const fakeFetch = async (input: RequestInfo | URL) => {
      requested = typeof input === "string" ? input : input.toString();
      return new Response("version: 1\n", { status: 200 });
    };
    await loadProfile("acme/profiles:dev.yaml", { fetchImpl: fakeFetch, noCache: true });
    expect(requested).toBe("https://raw.githubusercontent.com/acme/profiles/HEAD/dev.yaml");
  });

  test("non-2xx response raises ProfileError", async () => {
    const fakeFetch = async () => new Response("nope", { status: 404, statusText: "Not Found" });
    await expect(
      loadProfile("https://example.test/missing.yaml", { fetchImpl: fakeFetch, noCache: true }),
    ).rejects.toThrow(/404/);
  });

  test("invalid remote YAML raises ProfileError", async () => {
    const fakeFetch = async () => new Response("version: 99\n", { status: 200 });
    await expect(loadProfile("https://example.test/bad.yaml", { fetchImpl: fakeFetch, noCache: true })).rejects.toThrow(
      /Unsupported profile version/,
    );
  });
});
