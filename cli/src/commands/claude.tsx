/**
 * devlair claude — Claude Code config helpers.
 *
 * Implements --plan, --1m on|off, --channels, and a default short status.
 * The v1 usage dashboard (transcript parsing, plan-budget bars) is
 * intentionally not ported; v1 should be used for that view.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Box, Text, useApp } from "ink";
import { useEffect, useState } from "react";
import { type ClaudeFlags, VALID_CLAUDE_PLANS } from "../lib/args.js";
import { readJson, updateJson } from "../lib/jsonConfig.js";
import { D_COMMENT, D_FG, D_GREEN, D_ORANGE, D_PINK, D_PURPLE, D_RED } from "../lib/theme.js";

const SETTINGS_FILE = join(homedir(), ".claude", "settings.json");
const DEVLAIR_CONFIG = join(homedir(), ".claude", "devlair-config.json");
const TELEGRAM_WRAPPER = join(homedir(), ".devlair", "bin", "claude-telegram");
const TELEGRAM_ENV = join(homedir(), ".claude", "channels", "telegram", ".env");

const DEFAULT_PLAN = "max5x";

interface AllowedPlugin {
  plugin?: string;
  marketplace?: string;
}

interface ChannelStatus {
  channelsEnabled: boolean;
  allowedPlugins: AllowedPlugin[];
  pluginInstalled: boolean;
  wrapperExists: boolean;
  bunOk: boolean;
  tokenConfigured: boolean;
}

interface StatusSnapshot {
  plan: string;
  model: string;
}

interface ClaudeViewState {
  /** When set, render this message and exit successfully. */
  applied?: AppliedAction;
  channels?: ChannelStatus;
  status?: StatusSnapshot;
  error?: string;
}

type AppliedAction = { kind: "plan"; plan: string } | { kind: "1m-on" } | { kind: "1m-off" };

function commandExists(cmd: string): boolean {
  return spawnSync("command", ["-v", cmd], { shell: "/bin/bash", stdio: "ignore" }).status === 0;
}

function telegramPluginInstalled(): boolean {
  if (!commandExists("claude")) return false;
  const result = spawnSync("claude", ["plugin", "list", "--json"], { encoding: "utf8" });
  if (result.status !== 0) return false;
  try {
    const plugins = JSON.parse(result.stdout) as Array<{ name?: string; marketplace?: string }>;
    return plugins.some((p) => p.name === "telegram" && p.marketplace === "claude-plugins-official");
  } catch {
    return false;
  }
}

function gatherChannelStatus(): ChannelStatus {
  const settings = readJson(SETTINGS_FILE);
  return {
    channelsEnabled: settings.channelsEnabled === true,
    allowedPlugins: Array.isArray(settings.allowedChannelPlugins)
      ? (settings.allowedChannelPlugins as AllowedPlugin[])
      : [],
    pluginInstalled: telegramPluginInstalled(),
    wrapperExists: existsSync(TELEGRAM_WRAPPER),
    bunOk: existsSync(join(homedir(), ".bun", "bin", "bun")) || commandExists("bun"),
    tokenConfigured: existsSync(TELEGRAM_ENV),
  };
}

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
  if (flags.channels) return { channels: gatherChannelStatus() };
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
  if (state.channels) return <ChannelsPanel status={state.channels} />;
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
        <Text color={D_COMMENT}>
          {"  devlair claude --channels                    show channel configuration status"}
        </Text>
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

function ChannelsPanel({ status }: { status: ChannelStatus }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={D_PURPLE} bold>
          {"  devlair"}
        </Text>
        <Text color={D_PINK} bold>
          {"  channels"}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <StatusLine label="channelsEnabled" ok={status.channelsEnabled} fix="run sudo devlair init --only claude" />
        {status.allowedPlugins.length > 0 ? (
          <Box flexDirection="column">
            <Text color={D_COMMENT}>{"  allowed plugins:"}</Text>
            {status.allowedPlugins.map((p) => (
              <Text key={`${p.marketplace ?? "?"}/${p.plugin ?? "?"}`}>
                {"    "}
                <Text color={D_FG}>{p.plugin ?? "?"}</Text>
                <Text color={D_COMMENT}>{` @ ${p.marketplace ?? "?"}`}</Text>
              </Text>
            ))}
          </Box>
        ) : (
          <StatusLine label="allowed plugins" ok={false} fix="run sudo devlair init --only claude" />
        )}
        <StatusLine label="telegram plugin" ok={status.pluginInstalled} fix="run sudo devlair init --only claude" />
        <StatusLine
          label="claude-telegram wrapper"
          ok={status.wrapperExists}
          fix="run sudo devlair init --only claude"
        />
        <StatusLine label="bun" ok={status.bunOk} fix="run sudo devlair init --only devtools" />
        {status.tokenConfigured ? (
          <StatusLine label="telegram token" ok={true} fix="" />
        ) : (
          <Box>
            <Text color={D_ORANGE}>{"  ○"}</Text>
            <Text>{"  telegram token  "}</Text>
            <Text color={D_ORANGE}>not set</Text>
            <Text color={D_COMMENT}>{"  — see step 1 below"}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={D_COMMENT}>{"  Setup (one-time):"}</Text>
        <Text color={D_COMMENT}>
          {"    1. Create a bot: Telegram → "}
          <Text color={D_FG}>@BotFather</Text>
          {" → "}
          <Text color={D_FG}>/newbot</Text>
          {" → copy token"}
        </Text>
        <Text color={D_COMMENT}>{"    2. In any Claude Code session, configure your token:"}</Text>
        <Text>
          {"         "}
          <Text color={D_FG}>/telegram:configure &lt;token&gt;</Text>
        </Text>
        <Text color={D_COMMENT}>{"    3. Launch with channels:"}</Text>
        <Text>
          {"         "}
          <Text color={D_FG}>claude-telegram</Text>
        </Text>
        <Text color={D_COMMENT}>{"    4. Pair: message your bot → reply contains a code → in Claude Code:"}</Text>
        <Text>
          {"         "}
          <Text color={D_FG}>/telegram:access pair &lt;code&gt;</Text>
        </Text>
        <Text>
          {"         "}
          <Text color={D_FG}>/telegram:access policy allowlist</Text>
        </Text>
      </Box>
    </Box>
  );
}

function StatusLine({ label, ok, fix }: { label: string; ok: boolean; fix: string }) {
  if (ok) {
    return (
      <Box>
        <Text color={D_GREEN}>{"  ●"}</Text>
        <Text>{`  ${label}  `}</Text>
        <Text color={D_GREEN}>ok</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color={D_RED}>{"  ○"}</Text>
      <Text>{`  ${label}  `}</Text>
      <Text color={D_RED}>missing</Text>
      {fix && <Text color={D_COMMENT}>{`  — ${fix}`}</Text>}
    </Box>
  );
}
