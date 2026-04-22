/** Per-module progress lines with spinner for the running module. */

import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { D_COMMENT, D_GREEN, D_ORANGE, D_PINK, D_PURPLE, D_RED } from "../lib/theme.js";
import type { Status } from "../lib/types.js";

export type ModuleRunStatus = Status | "pending" | "running";

export interface ModuleRun {
  key: string;
  label: string;
  status: ModuleRunStatus;
  detail: string;
  progressMsg: string;
}

const STATUS_ICON: Record<string, { char: string; color: string }> = {
  ok: { char: "✓", color: D_GREEN },
  warn: { char: "⚠", color: D_ORANGE },
  skip: { char: "–", color: D_COMMENT },
  fail: { char: "✗", color: D_RED },
};

function ModuleLine({ mod, index, total }: { mod: ModuleRun; index: number; total: number }) {
  const counter = `[${index + 1}/${total}]`;

  if (mod.status === "running") {
    return (
      <Box>
        <Text>{"  "}</Text>
        <Text color={D_COMMENT}>{counter}</Text>
        <Text> </Text>
        <Text color={D_PINK}>{mod.label}</Text>
        <Text> </Text>
        <Text color={D_PURPLE}>
          <Spinner type="dots" />
        </Text>
        {mod.progressMsg ? <Text color={D_COMMENT}> {mod.progressMsg}</Text> : null}
      </Box>
    );
  }

  const icon = STATUS_ICON[mod.status];
  if (!icon) return null;

  return (
    <Box>
      <Text>{"  "}</Text>
      <Text color={icon.color}>{icon.char}</Text>
      <Text>{"  "}</Text>
      <Text color={D_COMMENT}>{counter}</Text>
      <Text> </Text>
      <Text>{mod.label}</Text>
      {mod.detail ? (
        <Text color={D_COMMENT}>
          {"  "}
          {mod.detail}
        </Text>
      ) : null}
    </Box>
  );
}

export function Progress({ modules, total }: { modules: ModuleRun[]; total: number }) {
  // Only show completed modules + the currently running one
  const visible = modules.filter((m) => m.status !== "pending");

  return (
    <Box flexDirection="column">
      {visible.map((mod, i) => (
        <ModuleLine key={mod.key} mod={mod} index={i} total={total} />
      ))}
    </Box>
  );
}
