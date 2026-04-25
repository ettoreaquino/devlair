/**
 * Wizard step 1 — multi-select checkboxes for module groups.
 * Core is always selected and cannot be deselected.
 */

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { GROUPS, type Group, MODULE_SPECS } from "../lib/modules.js";
import { D_COMMENT, D_GREEN, D_PINK, D_PURPLE } from "../lib/theme.js";

const GROUP_DESCRIPTIONS: Record<Group, string> = {
  core: "System update, timezone, Zsh, shell aliases",
  network: "Tailscale, SSH, firewall + Fail2Ban",
  coding: "tmux, dev tools (Docker, Node, Python, etc.), GitHub SSH key",
  "cloud-sync": "rclone cloud sync",
  ai: "Claude Code AI assistant",
  desktop: "Gnome Terminal Dracula theme",
};

function moduleCountForGroup(group: Group): number {
  return MODULE_SPECS.filter((s) => s.group === group).length;
}

export interface GroupSelectProps {
  onConfirm: (groups: Set<Group>) => void;
  onCancel: () => void;
}

export function GroupSelect({ onConfirm, onCancel }: GroupSelectProps) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<Group>>(() => new Set(GROUPS));

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => (c > 0 ? c - 1 : GROUPS.length - 1));
    } else if (key.downArrow) {
      setCursor((c) => (c < GROUPS.length - 1 ? c + 1 : 0));
    } else if (input === " ") {
      const group = GROUPS[cursor];
      if (group === "core") return; // core cannot be deselected
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        return next;
      });
    } else if (key.return) {
      onConfirm(selected);
    } else if (input === "q") {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={D_PINK} bold>
          {"  "}Select module groups
        </Text>
        <Text color={D_COMMENT}> (space = toggle, enter = next, q = cancel)</Text>
      </Box>

      {GROUPS.map((group, i) => {
        const isCore = group === "core";
        const isSelected = selected.has(group);
        const isCursor = i === cursor;
        const count = moduleCountForGroup(group);

        const pointer = isCursor ? ">" : " ";
        const checkbox = isSelected ? "[x]" : "[ ]";
        const nameColor = isCore ? D_GREEN : isCursor ? D_PURPLE : undefined;

        return (
          <Box key={group}>
            <Text color={D_PURPLE}>{`  ${pointer} `}</Text>
            <Text color={isSelected ? D_GREEN : D_COMMENT}>{checkbox}</Text>
            <Text> </Text>
            <Text color={nameColor} bold={isCursor}>
              {group.padEnd(12)}
            </Text>
            <Text color={D_COMMENT}>
              {`(${count} modules) `}
              {GROUP_DESCRIPTIONS[group]}
            </Text>
            {isCore && <Text color={D_COMMENT}> (required)</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
