/**
 * Wizard step 3 — summary table of selected modules.
 * Press Enter to start execution, q to cancel.
 */

import { Box, Text, useInput } from "ink";
import type { Group } from "../lib/modules.js";
import type { ModuleSpec } from "../lib/modules.js";
import { D_COMMENT, D_CYAN, D_GREEN, D_PINK, D_PURPLE } from "../lib/theme.js";

export interface ConfirmationProps {
  modules: ModuleSpec[];
  onConfirm: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export function Confirmation({ modules, onConfirm, onBack, onCancel }: ConfirmationProps) {
  useInput((input, key) => {
    if (key.return) {
      onConfirm();
    } else if (key.escape || key.backspace || key.delete) {
      onBack();
    } else if (input === "q") {
      onCancel();
    }
  });

  // Group modules by their group for display
  const byGroup = new Map<Group, ModuleSpec[]>();
  for (const mod of modules) {
    const list = byGroup.get(mod.group) ?? [];
    list.push(mod);
    byGroup.set(mod.group, list);
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={D_PINK} bold>
          {"  "}Ready to provision
        </Text>
        <Text color={D_COMMENT}>
          {"  "}
          {modules.length} modules selected
        </Text>
      </Box>

      {[...byGroup.entries()].map(([group, specs]) => (
        <Box key={group} flexDirection="column">
          <Box>
            <Text color={D_CYAN} bold>
              {"    "}
              {group}
            </Text>
          </Box>
          {specs.map((spec, i) => (
            <Box key={spec.key}>
              <Text color={D_GREEN}>
                {"      "}
                {i === specs.length - 1 ? "└" : "├"}{" "}
              </Text>
              <Text>{spec.label}</Text>
              <Text color={D_COMMENT}> ({spec.key})</Text>
            </Box>
          ))}
        </Box>
      ))}

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text>{"  "}</Text>
          <Text color={D_PURPLE}>Press </Text>
          <Text color={D_GREEN} bold>
            Enter
          </Text>
          <Text color={D_PURPLE}> to start provisioning</Text>
        </Box>
        <Box>
          <Text>{"  "}</Text>
          <Text color={D_COMMENT}>esc = back, q = cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
