#!/usr/bin/env bun
import { Text, render } from "ink";
import pkg from "../package.json" with { type: "json" };
import { DoctorView } from "./commands/doctor.js";
import { InitView } from "./commands/init.js";
import { UpgradeView } from "./commands/upgrade.js";
import { Help } from "./components/Help.js";
import {
  type DoctorFlags,
  type InitFlags,
  type UpgradeFlags,
  parseDoctorFlags,
  parseInitFlags,
  parseUpgradeFlags,
} from "./lib/args.js";
import { elevateIfNeeded } from "./lib/elevate.js";
import { D_FG } from "./lib/theme.js";

const VERSION = pkg.version;

type Command =
  | { type: "version" }
  | { type: "help" }
  | { type: "init"; flags: InitFlags }
  | { type: "doctor"; flags: DoctorFlags }
  | { type: "upgrade"; flags: UpgradeFlags };

function parseCommand(args: string[]): Command {
  if (args.includes("--version") || args.includes("-V")) {
    return { type: "version" };
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
  return <Help version={VERSION} />;
}

async function main() {
  const command = parseCommand(process.argv.slice(2));

  if (command.type === "init" || command.type === "doctor" || command.type === "upgrade") {
    elevateIfNeeded();
    const { waitUntilExit } = render(<App command={command} />);
    await waitUntilExit();
  } else {
    const { unmount } = render(<App command={command} />);
    unmount();
  }
}

main();
