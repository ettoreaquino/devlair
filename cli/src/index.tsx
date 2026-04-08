#!/usr/bin/env bun
import { Text, render } from "ink";
import pkg from "../package.json" with { type: "json" };
import { Help } from "./components/Help.js";
import { D_FG } from "./lib/theme.js";

const VERSION = pkg.version;

type Command = "version" | "help";

function parseCommand(args: string[]): Command {
  if (args.includes("--version") || args.includes("-V")) {
    return "version";
  }
  return "help";
}

function App({ command }: { command: Command }) {
  if (command === "version") {
    return <Text color={D_FG}>devlair {VERSION}</Text>;
  }
  return <Help version={VERSION} />;
}

function main() {
  const command = parseCommand(process.argv.slice(2));
  const { unmount } = render(<App command={command} />);
  unmount();
}

main();
