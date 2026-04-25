/**
 * devlair upgrade — self-update + system/tool upgrades.
 *
 * 1. Self-update: check GitHub Releases for a newer binary, download and replace.
 * 2. Tool upgrades: run modules/upgrade.sh to update system packages and tools.
 * 3. Re-apply: re-run REAPPLY_KEYS modules to refresh configs.
 */

import { chmodSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { useApp } from "ink";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef, useState } from "react";

import { Logo } from "../components/Logo.js";
import { type ModuleRun, Progress } from "../components/Progress.js";
import type { UpgradeFlags } from "../lib/args.js";
import { buildModuleContext } from "../lib/context.js";
import { REAPPLY_KEYS, resolveOrder } from "../lib/modules.js";
import { moduleScriptPath } from "../lib/paths.js";
import { detectPlatform, detectWslVersion } from "../lib/platform.js";
import { runModule } from "../lib/runner.js";
import { D_COMMENT, D_CYAN, D_FG, D_GREEN, D_ORANGE, D_PINK, D_PURPLE, D_RED } from "../lib/theme.js";
import type { Status } from "../lib/types.js";

type Phase = "self-update" | "tools" | "reapply" | "done";

interface SelfUpdateResult {
  status: "up-to-date" | "updated" | "skipped" | "error";
  detail: string;
}

function UpgradeHeader({ username, host, platform }: { username: string; host: string; platform: string }) {
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
          {"  upgrade"}
        </Text>
        <Text color={D_COMMENT}>{"  Upgrading "}</Text>
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

function SelfUpdateStatus({ result }: { result: SelfUpdateResult | null }) {
  if (!result) return null;

  const colorMap = {
    "up-to-date": D_COMMENT,
    updated: D_GREEN,
    skipped: D_COMMENT,
    error: D_ORANGE,
  };

  return (
    <Box marginBottom={1}>
      <Text color={colorMap[result.status]}>
        {"  "}
        {result.detail}
      </Text>
    </Box>
  );
}

function ToolUpgradeStatus({ rows, running }: { rows: ToolCheckRow[]; running: string }) {
  return (
    <Box flexDirection="column">
      {rows.map((row) => {
        const icon = row.status === "ok" ? { char: "✓", color: D_GREEN } : { char: "✗", color: D_RED };
        return (
          <Box key={row.label}>
            <Text color={icon.color}>
              {"  "}
              {icon.char}
            </Text>
            <Text>
              {"  "}
              {row.label}
            </Text>
            {row.detail && <Text color={D_COMMENT}> {row.detail}</Text>}
          </Box>
        );
      })}
      {running && (
        <Box>
          <Text>{"  "}</Text>
          <Text color={D_PURPLE}>
            <Spinner type="dots" />
          </Text>
          <Text color={D_COMMENT}> {running}</Text>
        </Box>
      )}
    </Box>
  );
}

interface ToolCheckRow {
  label: string;
  status: Status;
  detail: string;
}

async function checkSelfUpdate(currentVersion: string): Promise<SelfUpdateResult> {
  if (currentVersion.includes("alpha") || currentVersion.includes("dev")) {
    return { status: "skipped", detail: "Dev/pre-release install — skipping self-update." };
  }

  try {
    const resp = await fetch("https://api.github.com/repos/ettoreaquino/devlair/releases/latest", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { tag_name: string };
    const latest = data.tag_name.replace(/^v/, "");

    if (latest === currentVersion) {
      return { status: "up-to-date", detail: `devlair ${currentVersion} is already up to date.` };
    }

    // Download the new binary
    const arch = process.arch === "x64" ? "x86_64" : "aarch64";
    const url = `https://github.com/ettoreaquino/devlair/releases/download/v${latest}/devlair-linux-${arch}`;

    const binResp = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "follow" });
    if (!binResp.ok) throw new Error(`Download failed: HTTP ${binResp.status}`);
    const buffer = Buffer.from(await binResp.arrayBuffer());

    // Write to /usr/local/bin/devlair
    const installPath = "/usr/local/bin/devlair";
    const tmpPath = join("/tmp", `devlair-update-${Date.now()}`);
    writeFileSync(tmpPath, buffer);
    chmodSync(tmpPath, 0o755);

    // Atomic replace
    renameSync(tmpPath, installPath);
    chmodSync(installPath, 0o755);

    return { status: "updated", detail: `devlair updated to v${latest}` };
  } catch (err) {
    return { status: "error", detail: `Could not check for updates: ${err instanceof Error ? err.message : err}` };
  }
}

export function UpgradeView({ flags, version }: { flags: UpgradeFlags; version: string }) {
  const { exit } = useApp();
  const exitRef = useRef(exit);

  const [envState] = useState(() => {
    const platform = detectPlatform();
    const wslVersion = detectWslVersion(platform);
    const context = buildModuleContext(platform, wslVersion);
    return { platform, wslVersion, context };
  });

  const { platform, context } = envState;

  const [phase, setPhase] = useState<Phase>(flags.noSelf ? "tools" : "self-update");
  const [selfResult, setSelfResult] = useState<SelfUpdateResult | null>(
    flags.noSelf ? { status: "skipped", detail: "" } : null,
  );
  const [toolRows, setToolRows] = useState<ToolCheckRow[]>([]);
  const [toolRunning, setToolRunning] = useState("");
  const [reapplyModules, setReapplyModules] = useState<ModuleRun[]>([]);

  // Phase 1: Self-update
  useEffect(() => {
    if (flags.noSelf) return;

    async function doSelfUpdate() {
      const result = await checkSelfUpdate(version);
      setSelfResult(result);

      if (result.status === "updated") {
        // Re-exec with --no-self so the new binary runs the rest
        const { execFileSync } = await import("node:child_process");
        try {
          execFileSync("/usr/local/bin/devlair", ["upgrade", "--no-self"], { stdio: "inherit" });
        } catch {
          // The new binary will handle output
        }
        exitRef.current();
        return;
      }

      setPhase("tools");
    }

    doSelfUpdate();
  }, [flags.noSelf, version]);

  // Phase 2: Tool upgrades via upgrade.sh
  useEffect(() => {
    if (phase !== "tools") return;

    const abortController = new AbortController();

    async function runToolUpgrades() {
      const scriptPath = moduleScriptPath("upgrade");

      try {
        const iter = runModule(scriptPath, context, "run", { signal: abortController.signal });

        while (true) {
          const { value, done } = await iter.next();
          if (done) break;
          if (value.type === "progress") {
            setToolRunning(value.message);
          } else if (value.type === "check") {
            setToolRows((prev) => [...prev, { label: value.label, status: value.status, detail: value.detail ?? "" }]);
            setToolRunning("");
          }
        }
      } catch (err) {
        setToolRows((prev) => [
          ...prev,
          {
            label: "upgrade script",
            status: "fail" as Status,
            detail: err instanceof Error ? err.message : String(err),
          },
        ]);
      }

      setToolRunning("");
      setPhase("reapply");
    }

    runToolUpgrades();
    return () => {
      abortController.abort();
    };
  }, [phase, context]);

  // Phase 3: Re-apply config modules
  useEffect(() => {
    if (phase !== "reapply") return;

    const reapplySpecs = resolveOrder(REAPPLY_KEYS, platform);

    setReapplyModules(
      reapplySpecs.map((s) => ({
        key: s.key,
        label: s.label,
        status: "pending" as const,
        detail: "",
        progressMsg: "",
      })),
    );

    const abortController = new AbortController();

    async function runReapply() {
      for (let i = 0; i < reapplySpecs.length; i++) {
        if (abortController.signal.aborted) break;
        const spec = reapplySpecs[i];

        setReapplyModules((prev) => prev.map((m, j) => (j === i ? { ...m, status: "running" } : m)));

        let finalStatus: Status = "fail";
        let finalDetail = "";

        try {
          const scriptPath = moduleScriptPath(spec.key);
          const iter = runModule(scriptPath, context, "run", { signal: abortController.signal });

          while (true) {
            const { value, done } = await iter.next();
            if (done) {
              finalStatus = value.status;
              break;
            }
            if (value.type === "progress") {
              setReapplyModules((prev) => prev.map((m, j) => (j === i ? { ...m, progressMsg: value.message } : m)));
            } else if (value.type === "result") {
              finalDetail = value.detail;
            }
          }
        } catch (err) {
          finalStatus = "fail";
          finalDetail = err instanceof Error ? err.message : String(err);
        }

        setReapplyModules((prev) =>
          prev.map((m, j) => (j === i ? { ...m, status: finalStatus, detail: finalDetail, progressMsg: "" } : m)),
        );
      }

      setPhase("done");
      setTimeout(() => exitRef.current(), 0);
    }

    runReapply();
    return () => {
      abortController.abort();
    };
  }, [phase, platform, context]);

  return (
    <Box flexDirection="column">
      <UpgradeHeader username={context.username} host={hostname()} platform={platform} />

      {phase === "self-update" && !selfResult && (
        <Box marginBottom={1}>
          <Text>{"  "}</Text>
          <Text color={D_PURPLE}>
            <Spinner type="dots" />
          </Text>
          <Text color={D_COMMENT}> Checking for devlair updates...</Text>
        </Box>
      )}

      <SelfUpdateStatus result={selfResult} />

      {toolRows.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={D_PINK} bold>
            {"  "}Tool upgrades
          </Text>
          <ToolUpgradeStatus rows={toolRows} running={toolRunning} />
        </Box>
      )}

      {phase === "tools" && toolRows.length === 0 && (
        <Box>
          <Text>{"  "}</Text>
          <Text color={D_PURPLE}>
            <Spinner type="dots" />
          </Text>
          <Text color={D_COMMENT}> Starting tool upgrades...</Text>
        </Box>
      )}

      {reapplyModules.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={D_PINK} bold>
            {"  "}Re-applying configs
          </Text>
          <Progress modules={reapplyModules} total={reapplyModules.length} />
        </Box>
      )}

      {phase === "done" && (
        <Box marginTop={1}>
          <Text color={D_GREEN}>{"  "}Upgrade complete.</Text>
          <Text color={D_COMMENT}>{"  "}Restart your shell or run </Text>
          <Text color={D_CYAN}>exec zsh</Text>
        </Box>
      )}

      <Text>{""}</Text>
    </Box>
  );
}
