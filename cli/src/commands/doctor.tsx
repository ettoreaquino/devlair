/**
 * devlair doctor — run all modules in check mode and display health status.
 *
 * Collects json_check events from each module, renders a health table,
 * and optionally re-runs failed modules with --fix.
 */

import { hostname } from "node:os";
import { useApp } from "ink";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef, useState } from "react";

import { Logo } from "../components/Logo.js";
import type { DoctorFlags } from "../lib/args.js";
import { buildModuleContext } from "../lib/context.js";
import { MODULE_SPECS, REAPPLY_KEYS, resolveOrder } from "../lib/modules.js";
import { moduleScriptPath } from "../lib/paths.js";
import { detectPlatform, detectWslVersion } from "../lib/platform.js";
import { runModule } from "../lib/runner.js";
import { D_COMMENT, D_FG, D_GREEN, D_ORANGE, D_PINK, D_PURPLE, D_RED } from "../lib/theme.js";
import type { ModuleContext, Status } from "../lib/types.js";

interface CheckRow {
  module: string;
  label: string;
  status: Status;
  detail: string;
  first: boolean;
}

type Phase = "checking" | "table" | "fixing" | "done";

const STATUS_ICON: Record<Status, { char: string; color: string }> = {
  ok: { char: "✓", color: D_GREEN },
  warn: { char: "⚠", color: D_ORANGE },
  skip: { char: "–", color: D_COMMENT },
  fail: { char: "✗", color: D_RED },
};

function DoctorHeader({ username, host, platform }: { username: string; host: string; platform: string }) {
  const suffix = platform === "wsl" ? " (WSL)" : platform === "macos" ? " (macOS)" : "";

  return (
    <Box flexDirection="column">
      <Logo />
      <Box marginBottom={1}>
        <Text>{"  "}</Text>
        <Text color={D_PURPLE} bold>
          devlair
        </Text>
        <Text color={D_PINK} bold>
          {"  doctor"}
        </Text>
        <Text color={D_COMMENT}>{"  Health check for "}</Text>
        <Text color={D_FG} bold>
          {username}
        </Text>
        <Text color={D_COMMENT}>
          {" "}
          on {host}
          {suffix}
        </Text>
      </Box>
    </Box>
  );
}

function CheckTable({ rows }: { rows: CheckRow[] }) {
  if (rows.length === 0) return null;

  const moduleWidth = Math.max(...rows.map((r) => r.module.length), 6);
  const labelWidth = Math.max(...rows.map((r) => r.label.length), 5);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={D_COMMENT} bold>
          {"  "}
          {"Module".padEnd(moduleWidth)}
          {"  "}
          {"Check".padEnd(labelWidth)}
          {"  "}
          {"Status"}
          {"  "}
          {"Detail"}
        </Text>
      </Box>
      {rows.map((row, i) => {
        const icon = STATUS_ICON[row.status];
        return (
          <Box key={`${row.module}-${row.label}-${i}`}>
            <Text>{"  "}</Text>
            <Text>{(row.first ? row.module : "").padEnd(moduleWidth)}</Text>
            <Text>{"  "}</Text>
            <Text>{row.label.padEnd(labelWidth)}</Text>
            <Text>{"  "}</Text>
            <Text color={icon.color}>
              {"  "}
              {icon.char}
              {"   "}
            </Text>
            <Text color={D_COMMENT}>{row.detail}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function CheckSummary({ rows }: { rows: CheckRow[] }) {
  let warn = 0;
  let fail = 0;
  for (const r of rows) {
    if (r.status === "warn") warn++;
    else if (r.status === "fail") fail++;
  }

  if (fail === 0 && warn === 0) {
    return (
      <Box marginTop={1}>
        <Text color={D_GREEN}>
          {"  "}All {rows.length} checks passed.
        </Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1} flexDirection="column">
      {fail > 0 && (
        <Text color={D_RED}>
          {"  "}
          {fail} checks failed.
        </Text>
      )}
      {warn > 0 && (
        <Text color={D_ORANGE}>
          {"  "}
          {warn} warnings.
        </Text>
      )}
    </Box>
  );
}

interface FixResult {
  module: string;
  status: "ok" | "fail" | "manual";
  detail: string;
}

function FixResults({ results }: { results: FixResult[] }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={D_PINK} bold>
        {"  "}Fix results
      </Text>
      {results.map((r) => {
        if (r.status === "manual") {
          return (
            <Box key={r.module}>
              <Text color={D_COMMENT}>
                {"  "}– {r.module} (manual fix required)
              </Text>
            </Box>
          );
        }
        const icon = r.status === "ok" ? STATUS_ICON.ok : STATUS_ICON.fail;
        return (
          <Box key={r.module}>
            <Text color={icon.color}>
              {"  "}
              {icon.char}
            </Text>
            <Text>
              {"  "}
              {r.module}
              {r.status === "ok" ? " re-applied" : ""}
            </Text>
            {r.status === "fail" && <Text color={D_COMMENT}>: {r.detail}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}

export function DoctorView({ flags }: { flags: DoctorFlags }) {
  const { exit } = useApp();
  const exitRef = useRef(exit);

  const [envState] = useState(() => {
    const platform = detectPlatform();
    const wslVersion = detectWslVersion(platform);
    const context = buildModuleContext(platform, wslVersion);
    return { platform, wslVersion, context };
  });

  const { platform, context } = envState;

  const [phase, setPhase] = useState<Phase>("checking");
  const [checkingModule, setCheckingModule] = useState("");
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [fixResults, setFixResults] = useState<FixResult[]>([]);

  // Phase 1: Run all modules in check mode
  useEffect(() => {
    const abortController = new AbortController();

    async function runChecks() {
      const specs = MODULE_SPECS.filter((s) => s.platforms.has(platform));
      const allRows: CheckRow[] = [];

      for (const spec of specs) {
        if (abortController.signal.aborted) break;
        setCheckingModule(spec.label);

        try {
          const scriptPath = moduleScriptPath(spec.key);
          const iter = runModule(scriptPath, context, "check", { signal: abortController.signal });

          let first = true;
          while (true) {
            const { value, done } = await iter.next();
            if (done) break;
            if (value.type === "check") {
              allRows.push({
                module: spec.label,
                label: value.label,
                status: value.status,
                detail: value.detail ?? "",
                first,
              });
              first = false;
            }
          }
        } catch {
          allRows.push({
            module: spec.label,
            label: "module check",
            status: "fail",
            detail: "check script error",
            first: true,
          });
        }
      }

      setRows(allRows);
      setCheckingModule("");

      // Decide next phase
      const failedKeys = new Set(
        allRows
          .filter((r) => r.status === "fail" || r.status === "warn")
          .map((r) => {
            const spec = specs.find((s) => s.label === r.module);
            return spec?.key ?? "";
          })
          .filter(Boolean),
      );

      if (flags.fix && failedKeys.size > 0) {
        setPhase("fixing");
        await runFixes(failedKeys, context, abortController.signal);
      } else {
        setPhase("done");
        setTimeout(() => exitRef.current(), 0);
      }
    }

    async function runFixes(failedKeys: Set<string>, ctx: ModuleContext, signal: AbortSignal) {
      const fixSpecs = resolveOrder(failedKeys, platform);
      const results: FixResult[] = [];

      for (const spec of fixSpecs) {
        if (signal.aborted) break;

        if (!REAPPLY_KEYS.has(spec.key)) {
          results.push({ module: spec.label, status: "manual", detail: "" });
          continue;
        }

        setCheckingModule(spec.label);

        try {
          const scriptPath = moduleScriptPath(spec.key);
          const iter = runModule(scriptPath, ctx, "run", { signal });

          while (true) {
            const { value, done } = await iter.next();
            if (done) {
              results.push({
                module: spec.label,
                status: value.status === "ok" ? "ok" : "fail",
                detail: value.status !== "ok" ? `exit ${value.exitCode}` : "",
              });
              break;
            }
          }
        } catch (err) {
          results.push({
            module: spec.label,
            status: "fail",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }

      setFixResults(results);
      setCheckingModule("");
      setPhase("done");
      setTimeout(() => exitRef.current(), 0);
    }

    runChecks();
    return () => {
      abortController.abort();
    };
  }, [platform, context, flags.fix]);

  return (
    <Box flexDirection="column">
      <DoctorHeader username={context.username} host={hostname()} platform={platform} />

      {phase === "checking" && (
        <Box>
          <Text>{"  "}</Text>
          <Text color={D_PURPLE}>
            <Spinner type="dots" />
          </Text>
          <Text color={D_COMMENT}> Checking {checkingModule}...</Text>
        </Box>
      )}

      {phase !== "checking" && <CheckTable rows={rows} />}
      {phase !== "checking" && <CheckSummary rows={rows} />}

      {phase === "fixing" && (
        <Box marginTop={1}>
          <Text>{"  "}</Text>
          <Text color={D_PURPLE}>
            <Spinner type="dots" />
          </Text>
          <Text color={D_COMMENT}> Fixing {checkingModule}...</Text>
        </Box>
      )}

      {fixResults.length > 0 && <FixResults results={fixResults} />}

      <Text>{""}</Text>
    </Box>
  );
}
