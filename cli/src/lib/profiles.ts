/**
 * Setup profile loading, Zod validation, and remote fetching.
 *
 * Profiles are YAML documents (schema version 1) that declare which module
 * groups or modules to install, what to skip, and per-module config. They
 * can live on disk, at an HTTPS URL, or in a GitHub repo using the shorthand
 * `org/repo[@ref]:path/to/profile.yaml`.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { GROUPS, MODULE_SPECS, keysForGroups } from "./modules.js";

const MODULE_KEYS = MODULE_SPECS.map((s) => s.key) as [string, ...string[]];
const MODULE_KEY_SET = new Set<string>(MODULE_KEYS);
const GROUP_SET = new Set<string>(GROUPS);

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const GITHUB_SHORTHAND_RE = /^([\w.-]+)\/([\w.-]+)(?:@([\w./-]+))?:([\w./-]+)$/;

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileError";
  }
}

const moduleKeySchema = z.string().superRefine((k, ctx) => {
  if (!MODULE_KEY_SET.has(k)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown module '${k}'` });
  }
});

const groupSchema = z.string().superRefine((g, ctx) => {
  if (!GROUP_SET.has(g)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown group '${g}'` });
  }
});

const profileSchema = z
  .object({
    version: z.literal(1, { errorMap: () => ({ message: "Unsupported profile version (expected 1)" }) }),
    name: z.string().optional(),
    groups: z.array(groupSchema).optional(),
    modules: z.array(moduleKeySchema).optional(),
    skip: z.array(moduleKeySchema).optional(),
    config: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.modules !== undefined && data.groups !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "'modules' and 'groups' are mutually exclusive — use one or the other",
        path: ["modules"],
      });
    }
    if (data.config) {
      for (const key of Object.keys(data.config)) {
        if (!MODULE_KEY_SET.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown module '${key}' in config section`,
            path: ["config", key],
          });
        }
      }
    }
  });

export type Profile = z.infer<typeof profileSchema>;

export interface ProfileSelection {
  /** Explicit module set declared by the profile, or null if it specified neither modules nor groups. */
  want: Set<string> | null;
  /** Modules the profile asks to skip. Always defined (empty when absent). */
  skip: Set<string>;
}

/** Parse + validate a YAML string. Throws ProfileError with a readable message. */
export function parseProfile(text: string, sourceLabel = "profile"): Profile {
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    throw new ProfileError(`Invalid YAML in ${sourceLabel}: ${err instanceof Error ? err.message : err}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ProfileError(`${sourceLabel} must be a YAML mapping, got ${describe(raw)}`);
  }
  const result = profileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`)
      .join("; ");
    throw new ProfileError(`Invalid ${sourceLabel}: ${issues}`);
  }
  return result.data;
}

/** Derive (want, skip) from a validated profile. Mirrors Python's resolve_profile_keys. */
export function resolveProfileKeys(profile: Profile): ProfileSelection {
  let want: Set<string> | null = null;
  if (profile.modules) {
    want = new Set(profile.modules);
  } else if (profile.groups) {
    want = keysForGroups(new Set(profile.groups));
  }
  return { want, skip: new Set(profile.skip ?? []) };
}

export interface SourceClassification {
  kind: "file" | "url" | "github";
  /** Canonical URL for url/github sources. */
  url?: string;
  /** Local filesystem path for file sources. */
  path?: string;
}

/** Classify a --config argument as a local file, HTTPS URL, or GitHub shorthand. */
export function classifySource(source: string): SourceClassification {
  if (source.startsWith("http://")) {
    throw new ProfileError(`Refusing to load profile over plaintext http:// — use https:// (${source})`);
  }
  if (source.startsWith("https://")) {
    return { kind: "url", url: source };
  }
  const match = GITHUB_SHORTHAND_RE.exec(source);
  if (match) {
    const [, org, repo, ref, path] = match;
    if (path.split("/").some((seg) => seg === "..")) {
      throw new ProfileError(`GitHub shorthand path may not contain '..' segments: ${source}`);
    }
    const url = `https://raw.githubusercontent.com/${org}/${repo}/${ref ?? "HEAD"}/${path}`;
    return { kind: "github", url };
  }
  return { kind: "file", path: source };
}

function cacheDir(): string {
  return join(homedir(), ".devlair", "profiles");
}

function cachePath(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return join(cacheDir(), `${hash}.yaml`);
}

function cacheIsFresh(path: string, now: number): boolean {
  try {
    const stat = statSync(path);
    return now - stat.mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function readCached(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function writeCached(path: string, text: string): void {
  try {
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(path, text, "utf8");
  } catch {
    // Cache writes are best-effort.
  }
}

export type FetchLike = (input: string | URL | Request) => Promise<Response>;

export interface FetchOptions {
  /** Override fetch (mainly for tests). */
  fetchImpl?: FetchLike;
  /** Skip cache reads/writes (mainly for tests). */
  noCache?: boolean;
  /** Override clock (mainly for tests). */
  now?: () => number;
}

async function fetchRemote(url: string, opts: FetchOptions): Promise<string> {
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const now = opts.now ?? Date.now;
  const cache = cachePath(url);

  if (!opts.noCache && cacheIsFresh(cache, now())) {
    const cached = readCached(cache);
    if (cached !== null) return cached;
  }

  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      throw new ProfileError(`Failed to fetch profile (${response.status} ${response.statusText}): ${url}`);
    }
    const text = await response.text();
    if (!opts.noCache) writeCached(cache, text);
    return text;
  } catch (err) {
    if (err instanceof ProfileError) {
      // On HTTP error, fall back to stale cache if available.
      const stale = opts.noCache ? null : readCached(cache);
      if (stale !== null) return stale;
      throw err;
    }
    const stale = opts.noCache ? null : readCached(cache);
    if (stale !== null) return stale;
    throw new ProfileError(`Failed to fetch profile ${url}: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Load and validate a profile from any source — local path, HTTPS URL, or
 * GitHub shorthand `org/repo[@ref]:path`.
 */
export async function loadProfile(source: string, opts: FetchOptions = {}): Promise<Profile> {
  const classified = classifySource(source);
  let text: string;
  let label: string;

  if (classified.kind === "file") {
    label = classified.path as string;
    try {
      text = readFileSync(label, "utf8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const tag = (err as NodeJS.ErrnoException).code === "ENOENT" ? "not found" : "cannot read";
      throw new ProfileError(`Profile ${tag}: ${label}${tag === "cannot read" ? ` (${msg})` : ""}`);
    }
  } else {
    label = classified.url as string;
    text = await fetchRemote(label, opts);
  }

  return parseProfile(text, label);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "list";
  return typeof value;
}
