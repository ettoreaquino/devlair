/** Bordered summary panel with ok/warn/fail/skip counts. */

import { Box, Text } from "ink";
import type { ModuleSpec } from "../lib/modules.js";
import { D_COMMENT, D_CYAN, D_GREEN, D_ORANGE, D_PINK, D_PURPLE, D_RED } from "../lib/theme.js";
import type { ModuleRun } from "./Progress.js";

function countByStatus(modules: ModuleRun[]) {
  let ok = 0;
  let warn = 0;
  let fail = 0;
  let skip = 0;
  for (const m of modules) {
    if (m.status === "ok") ok++;
    else if (m.status === "warn") warn++;
    else if (m.status === "fail") fail++;
    else if (m.status === "skip") skip++;
  }
  return { ok, warn, fail, skip };
}

export function Summary({ modules }: { modules: ModuleRun[] }) {
  const { ok, warn, fail, skip } = countByStatus(modules);
  const borderColor = fail === 0 ? D_GREEN : D_RED;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="round" borderColor={borderColor} paddingX={2} flexDirection="column">
        <Text color={D_PINK} bold>
          Summary
        </Text>
        {ok > 0 && <Text color={D_GREEN}> {ok} ok</Text>}
        {warn > 0 && <Text color={D_ORANGE}> {warn} warnings</Text>}
        {fail > 0 && <Text color={D_RED}> {fail} failed</Text>}
        {skip > 0 && <Text color={D_COMMENT}> {skip} skipped</Text>}
      </Box>

      <Box marginTop={1}>
        {fail === 0 ? (
          <Text>
            {"  "}
            <Text color={D_GREEN}>Your lair is ready.</Text>
            {"  Restart your shell or run "}
            <Text color={D_CYAN}>exec zsh</Text>
          </Text>
        ) : (
          <Text>
            {"  "}
            <Text color={D_RED}>Some modules failed.</Text>
            {" Re-run with "}
            <Text color={D_CYAN}>--only</Text>
            {" to retry individual steps."}
          </Text>
        )}
      </Box>
    </Box>
  );
}

export function OptionalHint({ specs }: { specs: ModuleSpec[] }) {
  if (specs.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={D_PURPLE}>{"  "}Optional add-ins:</Text>
      {specs.map((s) => (
        <Box key={s.key}>
          <Text>{"    "}</Text>
          <Text color={D_CYAN}>devlair init --only {s.key.padEnd(16)}</Text>
          <Text color={D_COMMENT}>{s.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
