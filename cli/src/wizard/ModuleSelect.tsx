/**
 * Wizard step 2 — per-module toggles within selected groups.
 * Shows dependency auto-expansion warnings and platform compatibility.
 */

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { type Group, MODULE_SPECS, type ModuleSpec, resolveOrder } from "../lib/modules.js";
import { D_COMMENT, D_CYAN, D_GREEN, D_ORANGE, D_PINK, D_PURPLE } from "../lib/theme.js";
import type { Platform } from "../lib/types.js";

export interface ModuleSelectProps {
  groups: Set<Group>;
  platform: Platform;
  onConfirm: (modules: ModuleSpec[]) => void;
  onBack: () => void;
  onCancel: () => void;
}

interface ModuleRow {
  spec: ModuleSpec;
  platformOk: boolean;
}

/**
 * Given a set of selected module keys, expand dependencies and return
 * any keys that were auto-added (not in the original set).
 */
function findAutoExpanded(selectedKeys: Set<string>): string[] {
  const resolved = resolveOrder(selectedKeys);
  return resolved.map((s) => s.key).filter((k) => !selectedKeys.has(k));
}

export function ModuleSelect({ groups, platform, onConfirm, onBack, onCancel }: ModuleSelectProps) {
  // Build the list of modules for the selected groups (once — groups/platform are stable)
  const [rows] = useState<ModuleRow[]>(() =>
    MODULE_SPECS.filter((s) => groups.has(s.group)).map((s) => ({
      spec: s,
      platformOk: s.platforms.has(platform),
    })),
  );

  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => {
    // Default: select all platform-compatible modules in selected groups
    return new Set(rows.filter((r) => r.platformOk).map((r) => r.spec.key));
  });
  const [depWarning, setDepWarning] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => (c > 0 ? c - 1 : rows.length - 1));
    } else if (key.downArrow) {
      setCursor((c) => (c < rows.length - 1 ? c + 1 : 0));
    } else if (input === " ") {
      const row = rows[cursor];
      if (!row.platformOk) return; // can't toggle platform-incompatible modules

      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(row.spec.key)) {
          next.delete(row.spec.key);
          setDepWarning(null);
        } else {
          next.add(row.spec.key);
          // Check if this triggers dependency auto-expansion
          const autoExpanded = findAutoExpanded(next);
          if (autoExpanded.length > 0) {
            for (const k of autoExpanded) next.add(k);
            setDepWarning(`Auto-added dependencies: ${autoExpanded.join(", ")}`);
          } else {
            setDepWarning(null);
          }
        }
        return next;
      });
    } else if (key.return) {
      const finalModules = resolveOrder(selected, platform);
      onConfirm(finalModules);
    } else if (key.escape || key.backspace || key.delete) {
      onBack();
    } else if (input === "q") {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={D_PINK} bold>
          {"  "}Select modules
        </Text>
        <Text color={D_COMMENT}> (space = toggle, enter = confirm, esc = back, q = cancel)</Text>
      </Box>

      {rows.map((row, i) => {
        const showGroupHeader = i === 0 || row.spec.group !== rows[i - 1].spec.group;

        const isCursor = i === cursor;
        const isSelected = selected.has(row.spec.key);
        const pointer = isCursor ? ">" : " ";

        let checkbox: string;
        let checkColor: string;
        if (!row.platformOk) {
          checkbox = "[-]";
          checkColor = D_COMMENT;
        } else {
          checkbox = isSelected ? "[x]" : "[ ]";
          checkColor = isSelected ? D_GREEN : D_COMMENT;
        }

        const nameColor = !row.platformOk ? D_COMMENT : isCursor ? D_PURPLE : undefined;

        return (
          <Box key={row.spec.key} flexDirection="column">
            {showGroupHeader && (
              <Box marginTop={i > 0 ? 1 : 0}>
                <Text color={D_CYAN} bold>
                  {"    "}
                  {row.spec.group}
                </Text>
              </Box>
            )}
            <Box>
              <Text color={D_PURPLE}>{`  ${pointer} `}</Text>
              <Text color={checkColor}>{checkbox}</Text>
              <Text> </Text>
              <Text color={nameColor} bold={isCursor}>
                {row.spec.key.padEnd(16)}
              </Text>
              <Text color={row.platformOk ? undefined : D_COMMENT}>{row.spec.label}</Text>
              {!row.platformOk && <Text color={D_COMMENT}> (not available on {platform})</Text>}
              {row.spec.deps.length > 0 && row.platformOk && (
                <Text color={D_COMMENT}> (requires: {row.spec.deps.join(", ")})</Text>
              )}
            </Box>
          </Box>
        );
      })}

      {depWarning && (
        <Box marginTop={1}>
          <Text color={D_ORANGE}>
            {"  "}⚠ {depWarning}
          </Text>
        </Box>
      )}
    </Box>
  );
}
