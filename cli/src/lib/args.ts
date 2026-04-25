/** CLI flag parsing for init, doctor, and upgrade commands. */

export interface InitFlags {
  only: Set<string> | null;
  skip: Set<string>;
  group: Set<string> | null;
  config: string | null;
}

export interface DoctorFlags {
  fix: boolean;
}

export interface UpgradeFlags {
  noSelf: boolean;
}

const SET_FLAGS = new Set(["--only", "--skip", "--group"]);
const STRING_FLAGS = new Set(["--config"]);

/**
 * Parse init-specific flags from argv (after the "init" command is consumed).
 * Splits comma-separated values for --only, --skip, --group.
 */
export function parseInitFlags(args: readonly string[]): InitFlags {
  const flags: InitFlags = { only: null, skip: new Set(), group: null, config: null };

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
