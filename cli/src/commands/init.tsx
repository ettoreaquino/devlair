/**
 * devlair init — non-interactive machine provisioning.
 *
 * Resolves module order from CLI flags, executes each module sequentially
 * via the shell runner, and renders live progress with Ink.
 */

import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { useApp } from "ink";
import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";
import YAML from "yaml";

import { Logo } from "../components/Logo.js";
import { type ModuleRun, Progress } from "../components/Progress.js";
import { OptionalHint, Summary } from "../components/Summary.js";
import type { InitFlags } from "../lib/args.js";
import { buildModuleContext } from "../lib/context.js";
import { moduleScriptPath } from "../lib/paths.js";
import { detectPlatform, detectWslVersion } from "../lib/platform.js";
import { runModule } from "../lib/runner.js";
import { selectModules } from "../lib/selection.js";
import { D_COMMENT, D_FG, D_PINK, D_PURPLE } from "../lib/theme.js";
import type { Status } from "../lib/types.js";

type Phase = "running" | "done";

interface ProfileData {
  name?: string;
  config?: Record<string, unknown>;
}

function loadProfile(path: string): ProfileData {
  try {
    const raw = readFileSync(path, "utf8");
    const data = YAML.parse(raw) as Record<string, unknown>;
    return {
      name: typeof data.name === "string" ? data.name : undefined,
      config: typeof data.config === "object" && data.config !== null ? (data.config as Record<string, unknown>) : {},
    };
  } catch (err) {
    process.stderr.write(`Profile error: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
}

function InitHeader({
  username,
  host,
  platform,
  profileName,
}: {
  username: string;
  host: string;
  platform: string;
  profileName?: string;
}) {
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
          {"  init"}
        </Text>
        <Text color={D_COMMENT}>{"  Configuring lair for "}</Text>
        <Text color={D_FG} bold>
          {username}
        </Text>
        <Text color={D_COMMENT}>
          {" "}
          on {host}
          {suffix}
        </Text>
        {profileName && (
          <Text color={D_COMMENT}>
            {"  profile: "}
            <Text bold>{profileName}</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}

function PlatformSkipped({ names }: { names: string }) {
  if (!names) return null;
  return (
    <Box marginBottom={1}>
      <Text color={D_COMMENT}>
        {"  "}Skipping on this platform: {names}
      </Text>
    </Box>
  );
}

export function InitView({ flags }: { flags: InitFlags }) {
  const { exit } = useApp();

  const platform = detectPlatform();
  const wslVersion = detectWslVersion(platform);
  const profile = flags.config ? loadProfile(flags.config) : undefined;
  const config = profile?.config ?? {};
  const context = buildModuleContext(platform, wslVersion, config);

  const { selected, optional, platformSkipped } = selectModules(flags, platform);

  // Capture stable values in refs so the effect dep array stays honest
  const contextRef = useRef(context);
  const selectedRef = useRef(selected);
  const exitRef = useRef(exit);

  const [modules, setModules] = useState<ModuleRun[]>(() =>
    selected.map((s) => ({
      key: s.key,
      label: s.label,
      status: "pending" as const,
      detail: "",
      progressMsg: "",
    })),
  );
  const [phase, setPhase] = useState<Phase>("running");

  useEffect(() => {
    let cancelled = false;
    const specs = selectedRef.current;
    const ctx = contextRef.current;

    async function run() {
      for (let i = 0; i < specs.length; i++) {
        if (cancelled) break;
        const spec = specs[i];

        // Mark as running
        setModules((prev) => prev.map((m, j) => (j === i ? { ...m, status: "running" } : m)));

        let finalStatus: Status = "fail";
        let finalDetail = "";

        try {
          const scriptPath = moduleScriptPath(spec.key);
          const iter = runModule(scriptPath, ctx, "run");

          while (true) {
            const { value, done } = await iter.next();
            if (done) {
              finalStatus = value.status;
              break;
            }
            // Update progress message for the running module
            if (value.type === "progress") {
              setModules((prev) => prev.map((m, j) => (j === i ? { ...m, progressMsg: value.message } : m)));
            } else if (value.type === "result") {
              finalDetail = value.detail;
            }
          }
        } catch (err) {
          finalStatus = "fail";
          finalDetail = err instanceof Error ? err.message : String(err);
        }

        // Mark with final status
        setModules((prev) =>
          prev.map((m, j) => (j === i ? { ...m, status: finalStatus, detail: finalDetail, progressMsg: "" } : m)),
        );
      }

      setPhase("done");
      // Give Ink one more render cycle before exiting
      setTimeout(() => exitRef.current(), 0);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const skippedNames = platformSkipped.map((s) => s.key).join(", ");

  return (
    <Box flexDirection="column">
      <InitHeader username={context.username} host={hostname()} platform={platform} profileName={profile?.name} />
      <PlatformSkipped names={skippedNames} />
      <Progress modules={modules} total={selected.length} />
      {phase === "done" && <Summary modules={modules} />}
      {phase === "done" && <OptionalHint specs={optional} />}
      <Text>{""}</Text>
    </Box>
  );
}
