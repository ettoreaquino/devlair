#!/usr/bin/env bun
import { Box, Text, render } from "ink";
import pkg from "../package.json" with { type: "json" };
import { D_COMMENT, D_FG, D_PINK, D_PURPLE } from "./lib/theme.js";

const VERSION = pkg.version;

const COMMANDS = [
  { name: "init", desc: "Provision this machine (interactive wizard or declarative)" },
  { name: "doctor", desc: "Health-check installed modules" },
  { name: "upgrade", desc: "Upgrade system, tools, and devlair itself" },
] as const;

function App({ command }: { command: string | null }) {
  if (command === "version") {
    return <Text color={D_FG}>devlair {VERSION}</Text>;
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color={D_PURPLE} bold>
          devlair
        </Text>
        <Text color={D_COMMENT}> v{VERSION}</Text>
      </Box>

      <Text color={D_PINK}>Dev machine provisioning CLI</Text>
      <Text color={D_COMMENT}>TypeScript + Ink rewrite — coming soon</Text>

      <Box marginTop={1} flexDirection="column">
        <Text color={D_FG} bold>
          Commands:
        </Text>
        {COMMANDS.map((c) => (
          <Text key={c.name}>
            <Text color={D_PURPLE}>{c.name}</Text>
            <Text color={D_COMMENT}> {c.desc}</Text>
          </Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={D_COMMENT}>
          Run <Text color={D_PINK}>devlair {"<command>"} --help</Text> for details
        </Text>
      </Box>
    </Box>
  );
}

function main() {
  const args = process.argv.slice(2);

  let command: string | null = null;
  if (args.includes("--version") || args.includes("-V")) {
    command = "version";
  }

  const { unmount } = render(<App command={command} />);
  // Ink renders then exits for static output
  unmount();
}

main();
