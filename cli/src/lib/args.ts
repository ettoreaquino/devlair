/** CLI flag parsing for all devlair v2 subcommands. */

export interface InitFlags {
  only: Set<string> | null;
  skip: Set<string>;
  group: Set<string> | null;
  config: string | null;
  brand: string | undefined;
}

export interface DoctorFlags {
  fix: boolean;
}

export interface UpgradeFlags {
  noSelf: boolean;
}

const SET_FLAGS = new Set(["--only", "--skip", "--group"]);
const STRING_FLAGS = new Set(["--config", "--brand"]);

/**
 * Parse init-specific flags from argv (after the "init" command is consumed).
 * Splits comma-separated values for --only, --skip, --group.
 */
export function parseInitFlags(args: readonly string[]): InitFlags {
  const flags: InitFlags = { only: null, skip: new Set(), group: null, config: null, brand: undefined };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (SET_FLAGS.has(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) {
        process.stderr.write(`Missing value for ${arg}\n`);
        continue;
      }
      const items = new Set(value.split(",").filter(Boolean));
      if (arg === "--only") flags.only = items;
      else if (arg === "--skip") flags.skip = items;
      else if (arg === "--group") flags.group = items;
    } else if (STRING_FLAGS.has(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) {
        process.stderr.write(`Missing value for ${arg}\n`);
        continue;
      }
      if (arg === "--config") flags.config = value;
      else if (arg === "--brand") flags.brand = value;
    } else if (arg.startsWith("--")) {
      process.stderr.write(`Unknown flag: ${arg}\nRun 'devlair init --help' for usage.\n`);
      process.exit(1);
    }
  }

  return flags;
}

/** Parse doctor-specific flags from argv. */
export function parseDoctorFlags(args: readonly string[]): DoctorFlags {
  return { fix: args.includes("--fix") };
}

/** Parse upgrade-specific flags from argv. */
export function parseUpgradeFlags(args: readonly string[]): UpgradeFlags {
  return { noSelf: args.includes("--no-self") };
}

export const VALID_CLAUDE_PLANS = ["pro", "max5x", "max20x"] as const;
export type ClaudePlan = (typeof VALID_CLAUDE_PLANS)[number];
export type ToggleValue = "on" | "off";

export interface ClaudeFlags {
  plan: ClaudePlan | null;
  toggle1m: ToggleValue | null;
  channels: boolean;
  error: string | null;
}

/** Parse claude-specific flags from argv (after the "claude" command). */
export function parseClaudeFlags(args: readonly string[]): ClaudeFlags {
  const flags: ClaudeFlags = { plan: null, toggle1m: null, channels: false, error: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--channels") {
      flags.channels = true;
    } else if (arg === "--plan") {
      const value = args[++i];
      if (!value || value.startsWith("--")) {
        flags.error = "Missing value for --plan";
        continue;
      }
      if (!(VALID_CLAUDE_PLANS as readonly string[]).includes(value)) {
        flags.error = `Unknown plan '${value}' — use one of: ${VALID_CLAUDE_PLANS.join(", ")}`;
        continue;
      }
      flags.plan = value as ClaudePlan;
    } else if (arg === "--1m") {
      const value = args[++i];
      if (value !== "on" && value !== "off") {
        flags.error = `--1m requires 'on' or 'off' (got ${value ?? "nothing"})`;
        continue;
      }
      flags.toggle1m = value;
    }
  }
  return flags;
}

export interface DisablePasswordFlags {
  /** Skip the interactive confirmation (CI / scripts). */
  yes: boolean;
}

export function parseDisablePasswordFlags(args: readonly string[]): DisablePasswordFlags {
  return { yes: args.includes("--yes") || args.includes("-y") };
}
