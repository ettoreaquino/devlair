/**
 * devlair claude — Claude Code config helpers.
 *
 * Implements --plan, --1m on|off, and a default short status.
 * The v1 usage dashboard (transcript parsing, plan-budget bars) is
 * intentionally not ported; v1 should be used for that view.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { Box, Text, useApp } from "ink";
import { useEffect, useState } from "react";
import { type ClaudeFlags, VALID_CLAUDE_PLANS } from "../lib/args.js";
import { readJson, updateJson } from "../lib/jsonConfig.js";
import { D_COMMENT, D_FG, D_GREEN, D_PINK, D_PURPLE, D_RED } from "../lib/theme.js";

const SETTINGS_FILE = join(homedir(), ".claude", "settings.json");
const DEVLAIR_CONFIG = join(homedir(), ".claude", "devlair-config.json");

const DEFAULT_PLAN = "max5x";

interface StatusSnapshot {
  plan: string;
  model: string;
}

interface ClaudeViewState {
  /** When set, render this message and exit successfully. */
  applied?: AppliedAction;
  status?: StatusSnapshot;
  error?: string;
}

type AppliedAction = { kind: "plan"; plan: string } | { kind: "1m-on" } | { kind: "1m-off" };

function readStatusSnapshot(): StatusSnapshot {
  const planRaw = readJson(DEVLAIR_CONFIG).claude_plan;
  const plan =
    typeof planRaw === "string" && (VALID_CLAUDE_PLANS as readonly string[]).includes(planRaw) ? planRaw : DEFAULT_PLAN;
  const modelRaw = readJson(SETTINGS_FILE).model;
  return { plan, model: typeof modelRaw === "string" ? modelRaw : "(unset)" };
}

function runCommand(flags: ClaudeFlags): ClaudeViewState {
  if (flags.error) return { error: flags.error };
  if (flags.plan) {
    updateJson(DEVLAIR_CONFIG, { claude_plan: flags.plan });
    return { applied: { kind: "plan", plan: flags.plan } };
  }
  if (flags.toggle1m === "on") {
    updateJson(SETTINGS_FILE, { model: "opus[1m]" });
    return { applied: { kind: "1m-on" } };
  }
  if (flags.toggle1m === "off") {
    updateJson(SETTINGS_FILE, { model: "sonnet" });
    return { applied: { kind: "1m-off" } };
  }
  return { status: readStatusSnapshot() };
}

export interface ClaudeViewProps {
  flags: ClaudeFlags;
}

export function ClaudeView({ flags }: ClaudeViewProps) {
  const { exit } = useApp();
  const [state] = useState<ClaudeViewState>(() => runCommand(flags));

  useEffect(() => {
    if (state.error) process.exitCode = 1;
    setTimeout(() => exit(), 0);
  }, [state, exit]);

  if (state.error) {
    return (
      <Box flexDirection="column">
        <Text color={D_RED}>{`  ${state.error}`}</Text>
      </Box>
    );
  }
  if (state.applied) return <AppliedView action={state.applied} />;
  if (state.status) return <StatusPanel snapshot={state.status} />;
  return null;
}

function AppliedView({ action }: { action: AppliedAction }) {
  if (action.kind === "plan") {
    return (
      <Text>
        {"  "}
        <Text color={D_GREEN}>✓</Text>
        <Text>{"  Plan set to "}</Text>
        <Text bold>{action.plan}</Text>
      </Text>
    );
  }
  if (action.kind === "1m-on") {
    return (
      <Box flexDirection="column">
        <Text>
          {"  "}
          <Text color={D_GREEN}>✓</Text>
          <Text>{"  1M context enabled — model set to "}</Text>
          <Text bold>opus[1m]</Text>
        </Text>
        <Text color={D_COMMENT}>{"  Revert with: devlair claude --1m off"}</Text>
      </Box>
    );
  }
  return (
    <Text>
      {"  "}
      <Text color={D_GREEN}>✓</Text>
      <Text>{"  1M context disabled — model reset to "}</Text>
      <Text bold>sonnet</Text>
    </Text>
  );
}

function StatusPanel({ snapshot }: { snapshot: StatusSnapshot }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={D_PURPLE} bold>
          {"  devlair"}
        </Text>
        <Text color={D_PINK} bold>
          {"  claude"}
        </Text>
        <Text color={D_COMMENT}>{`  ${snapshot.plan}`}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Row label="plan" value={snapshot.plan} />
        <Row label="model" value={snapshot.model} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={D_COMMENT}>{"  Usage dashboard is not available in v2. Run v1 devlair claude to see it."}</Text>
        <Text color={D_COMMENT}>
          {"  devlair claude --plan "}
          <Text color={D_FG}>{VALID_CLAUDE_PLANS.join("|")}</Text>
          {"   set subscription tier"}
        </Text>
        <Text color={D_COMMENT}>{"  devlair claude --1m on|off                   toggle 1M-token context"}</Text>
      </Box>
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text color={D_COMMENT}>{`  ${label.padEnd(8)}`}</Text>
      <Text color={D_FG} bold>
        {value}
      </Text>
    </Box>
  );
}
