#!/usr/bin/env bun
import { Text, render } from "ink";
import pkg from "../package.json" with { type: "json" };
import { InitView } from "./commands/init.js";
import { Help } from "./components/Help.js";
import { type InitFlags, parseInitFlags } from "./lib/args.js";
import { elevateIfNeeded } from "./lib/elevate.js";
import { D_FG } from "./lib/theme.js";

const VERSION = pkg.version;

type Command = { type: "version" } | { type: "help" } | { type: "init"; flags: InitFlags };

function parseCommand(args: string[]): Command {
  if (args.includes("--version") || args.includes("-V")) {
    return { type: "version" };
  }
  const firstArg = args[0];
  if (firstArg === "init") {
    return { type: "init", flags: parseInitFlags(args.slice(1)) };
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
  return <Help version={VERSION} />;
}

async function main() {
  const command = parseCommand(process.argv.slice(2));

  if (command.type === "init") {
    elevateIfNeeded();
    const { waitUntilExit } = render(<App command={command} />);
    await waitUntilExit();
  } else {
    const { unmount } = render(<App command={command} />);
    unmount();
  }
}

main();
