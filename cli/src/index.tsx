#!/usr/bin/env bun
import { Text, render } from "ink";
import pkg from "../package.json" with { type: "json" };
import { ClaudeView } from "./commands/claude.js";
import { DisablePasswordView } from "./commands/disable-password.js";
import { DoctorView } from "./commands/doctor.js";
import { InitView } from "./commands/init.js";
import { UninstallView } from "./commands/uninstall.js";
import { UpgradeView } from "./commands/upgrade.js";
import { Help } from "./components/Help.js";
import {
  type ClaudeFlags,
  type DisablePasswordFlags,
  type DoctorFlags,
  type InitFlags,
  type UninstallFlags,
  type UpgradeFlags,
  parseClaudeFlags,
  parseDisablePasswordFlags,
  parseDoctorFlags,
  parseInitFlags,
  parseUninstallFlags,
  parseUpgradeFlags,
} from "./lib/args.js";
import { elevateIfNeeded } from "./lib/elevate.js";
import { macOsPreFlight, macOsPurgeHomebrew } from "./lib/homebrew.js";
import { D_FG } from "./lib/theme.js";

const VERSION = pkg.version;

type Command =
  | { type: "version" }
  | { type: "help" }
  | { type: "init"; flags: InitFlags }
  | { type: "doctor"; flags: DoctorFlags }
  | { type: "upgrade"; flags: UpgradeFlags }
  | { type: "claude"; flags: ClaudeFlags }
  | { type: "disable-password"; flags: DisablePasswordFlags }
  | { type: "uninstall"; flags: UninstallFlags };

function parseCommand(args: string[]): Command {
  if (args.includes("--version") || args.includes("-V")) {
    return { type: "version" };
  }
  if (args.includes("--help") || args.includes("-h")) {
    return { type: "help" };
  }
  const firstArg = args[0];
  if (firstArg === "init") {
    return { type: "init", flags: parseInitFlags(args.slice(1)) };
  }
  if (firstArg === "doctor") {
    return { type: "doctor", flags: parseDoctorFlags(args.slice(1)) };
  }
  if (firstArg === "upgrade") {
    return { type: "upgrade", flags: parseUpgradeFlags(args.slice(1)) };
  }
  if (firstArg === "claude") {
    return { type: "claude", flags: parseClaudeFlags(args.slice(1)) };
  }
  if (firstArg === "disable-password") {
    return { type: "disable-password", flags: parseDisablePasswordFlags(args.slice(1)) };
  }
  if (firstArg === "uninstall") {
    return { type: "uninstall", flags: parseUninstallFlags(args.slice(1)) };
  }
  return { type: "help" };
}

function App({ command }: { command: Command }) {
  if (command.type === "version") {
    return <Text color={D_FG}>devlair {VERSION}</Text>;
  }
  if (command.type === "init") {
    return <InitView flags={command.flags} />;
  }
  if (command.type === "doctor") {
    return <DoctorView flags={command.flags} />;
  }
  if (command.type === "upgrade") {
    return <UpgradeView flags={command.flags} version={VERSION} />;
  }
  if (command.type === "claude") {
    return <ClaudeView flags={command.flags} />;
  }
  if (command.type === "disable-password") {
    return <DisablePasswordView flags={command.flags} />;
  }
  if (command.type === "uninstall") {
    return <UninstallView flags={command.flags} />;
  }
  return <Help version={VERSION} />;
}

const ELEVATED_COMMANDS = new Set(["init", "doctor", "upgrade", "disable-password", "uninstall"]);

async function main() {
  const command = parseCommand(process.argv.slice(2));

  if (ELEVATED_COMMANDS.has(command.type)) {
    elevateIfNeeded();
    // macOS: install Homebrew before Ink starts so the installer has full TTY
    // access for its sudo password prompt. All subsequent brew calls in modules
    // assume brew is on PATH — this is the single point of installation.
    // Skip for uninstall — we must never *install* Homebrew while tearing down.
    if (process.platform === "darwin") {
      if (command.type === "uninstall") {
        // `--purge` means "remove everything": tear Homebrew down too, pre-Ink
        // so the uninstaller has TTY access for its sudo prompt. Plain
        // uninstall leaves shared Homebrew untouched.
        if (command.flags.purge) macOsPurgeHomebrew();
      } else {
        macOsPreFlight();
      }
    }
  }

  if (command.type === "help" || command.type === "version") {
    const { unmount } = render(<App command={command} />);
    unmount();
  } else {
    const { waitUntilExit } = render(<App command={command} />);
    await waitUntilExit();
  }
}

main();
