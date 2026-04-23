import { Box, Text } from "ink";
import { D_COMMENT, D_CYAN, D_PINK, D_PURPLE } from "../lib/theme.js";
import { Logo } from "./Logo.js";

interface HelpEntry {
  cmd: string;
  desc: string;
}

interface HelpSection {
  title: string;
  entries: HelpEntry[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Setup & Health",
    entries: [
      { cmd: "init [--only MOD] [--skip MOD] [--group GRP] [--config FILE]", desc: "Set up this machine from scratch" },
      { cmd: "doctor [--fix]", desc: "Check system health & fix drift" },
      { cmd: "upgrade [--no-self]", desc: "Upgrade tools & re-apply configs" },
      { cmd: "disable-password", desc: "Lock SSH to key-only auth" },
    ],
  },
  {
    title: "Cloud & Filesystem",
    entries: [
      { cmd: "sync [--add|--remove|--now]", desc: "Manage rclone folder syncs" },
      { cmd: "filesystem", desc: "AI-guided folder structure design" },
    ],
  },
  {
    title: "AI Agents & Channels",
    entries: [{ cmd: "claude [--plan TIER] [--1m on|off]", desc: "Usage dashboard & config" }],
  },
  {
    title: "tmux Sessions",
    entries: [
      { cmd: "t", desc: "Start/attach default 'dev' session" },
      { cmd: "tmx <name>", desc: "Attach to a named session" },
      { cmd: "tmx new --name N", desc: "Create a plain session" },
      { cmd: "tmx new --name N --claude", desc: "Session with Claude Code" },
      { cmd: "tmx new --name N --claude-telegram", desc: "Create Telegram channel" },
      { cmd: "Ctrl+A  y", desc: "Claude Code popup (any session)" },
    ],
  },
];

const CMD_WIDTH = Math.max(...HELP_SECTIONS.flatMap((s) => s.entries.map((e) => e.cmd.length)));

export function Help({ version }: { version: string }) {
  return (
    <Box flexDirection="column">
      <Logo />
      <Text color={D_COMMENT}>
        {"  "}v{version}
      </Text>

      {HELP_SECTIONS.map((section) => (
        <Box key={section.title} flexDirection="column" marginTop={1}>
          <Text color={D_PINK}>
            {"  "}
            {section.title}
          </Text>
          {section.entries.map((entry) => (
            <Text key={entry.cmd}>
              {"    "}
              <Text color={D_PURPLE}>{entry.cmd.padEnd(CMD_WIDTH)}</Text>
              {"  "}
              <Text color={D_COMMENT}>{entry.desc}</Text>
            </Text>
          ))}
        </Box>
      ))}

      <Box marginTop={1}>
        <Text>
          {"  "}
          <Text color={D_COMMENT}>Options: </Text>
          <Text color={D_CYAN}>--version</Text>
          <Text color={D_COMMENT}> -v Show version </Text>
          <Text color={D_CYAN}>--help</Text>
          <Text color={D_COMMENT}> Show this screen</Text>
        </Text>
      </Box>
      <Text>{""}</Text>
    </Box>
  );
}
