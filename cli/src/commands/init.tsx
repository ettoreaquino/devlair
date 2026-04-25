/**
 * devlair init — machine provisioning with optional interactive wizard.
 *
 * When CLI flags are provided (--only, --group, --skip, --config),
 * runs non-interactively. Otherwise launches the wizard:
 * group select -> module select -> confirmation -> execution.
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
import type { Group, ModuleSpec } from "../lib/modules.js";
import { moduleScriptPath } from "../lib/paths.js";
import { detectPlatform, detectWslVersion } from "../lib/platform.js";
import { runModule } from "../lib/runner.js";
import { selectModules } from "../lib/selection.js";
import { D_COMMENT, D_FG, D_PINK, D_PURPLE } from "../lib/theme.js";
import type { ModuleContext, Status } from "../lib/types.js";
import { Confirmation } from "../wizard/Confirmation.js";
import { GroupSelect } from "../wizard/GroupSelect.js";
import { ModuleSelect } from "../wizard/ModuleSelect.js";

type Phase = "wizard-groups" | "wizard-modules" | "wizard-confirm" | "running" | "done";

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

/** Returns true when the user provided explicit selection flags. */
function hasExplicitFlags(flags: InitFlags): boolean {
  return flags.only !== null || flags.group !== null || flags.skip.size > 0 || flags.config !== null;
}

// ── Execution engine (shared by wizard and non-interactive paths) ──────────

function useModuleExecution(specs: ModuleSpec[], context: ModuleContext, autoStart: boolean) {
  const { exit } = useApp();
  const exitRef = useRef(exit);

  const [modules, setModules] = useState<ModuleRun[]>([]);
  const [done, setDone] = useState(false);

  // Re-initialize module state whenever specs change
  // (wizard transitions from [] to the real selection).
  useEffect(() => {
    setModules(
      specs.map((s) => ({
        key: s.key,
        label: s.label,
        status: "pending" as const,
        detail: "",
        progressMsg: "",
      })),
    );
    setDone(false);
  }, [specs]);

  useEffect(() => {
    if (!autoStart || specs.length === 0) return;

    const abortController = new AbortController();

    async function run() {
      for (let i = 0; i < specs.length; i++) {
        if (abortController.signal.aborted) break;
        const spec = specs[i];

        setModules((prev) => prev.map((m, j) => (j === i ? { ...m, status: "running" } : m)));

        let finalStatus: Status = "fail";
        let finalDetail = "";

        try {
          const scriptPath = moduleScriptPath(spec.key);
          const iter = runModule(scriptPath, context, "run", { signal: abortController.signal });

          while (true) {
            const { value, done: iterDone } = await iter.next();
            if (iterDone) {
              finalStatus = value.status;
              break;
            }
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

        setModules((prev) =>
          prev.map((m, j) => (j === i ? { ...m, status: finalStatus, detail: finalDetail, progressMsg: "" } : m)),
        );
      }

      setDone(true);
      setTimeout(() => exitRef.current(), 0);
    }

    run();
    return () => {
      abortController.abort();
    };
  }, [specs, context, autoStart]);

  return { modules, done };
}

// ── Non-interactive init (flags provided) ──────────────────────────────────

function NonInteractiveInit({ flags }: { flags: InitFlags }) {
  const [initState] = useState(() => {
    const platform = detectPlatform();
    const wslVersion = detectWslVersion(platform);
    const profile = flags.config ? loadProfile(flags.config) : undefined;
    const config = profile?.config ?? {};
    const context = buildModuleContext(platform, wslVersion, config);
    const { selected, optional, platformSkipped } = selectModules(flags, platform);
    const skippedNames = platformSkipped.map((s) => s.key).join(", ");
    return { platform, context, selected, optional, platformSkipped, skippedNames, profile };
  });

  const { platform, context, selected, optional, skippedNames, profile } = initState;
  const { modules, done } = useModuleExecution(selected, context, true);

  return (
    <Box flexDirection="column">
      <InitHeader username={context.username} host={hostname()} platform={platform} profileName={profile?.name} />
      <PlatformSkipped names={skippedNames} />
      <Progress modules={modules} total={selected.length} />
      {done && <Summary modules={modules} />}
      {done && <OptionalHint specs={optional} />}
      <Text>{""}</Text>
    </Box>
  );
}

// ── Interactive wizard init (no flags) ─────────────────────────────────────

function WizardInit() {
  const { exit } = useApp();

  const [envState] = useState(() => {
    const platform = detectPlatform();
    const wslVersion = detectWslVersion(platform);
    const context = buildModuleContext(platform, wslVersion);
    return { platform, wslVersion, context };
  });

  const { platform, context } = envState;

  const [phase, setPhase] = useState<Phase>("wizard-groups");
  const [selectedGroups, setSelectedGroups] = useState<Set<Group>>(new Set());
  const [selectedModules, setSelectedModules] = useState<ModuleSpec[]>([]);

  const cancel = () => {
    exit();
  };

  // Execution state — only populated after wizard confirmation
  const { modules, done } = useModuleExecution(selectedModules, context, phase === "running" || phase === "done");

  return (
    <Box flexDirection="column">
      <InitHeader username={context.username} host={hostname()} platform={platform} />

      {phase === "wizard-groups" && (
        <GroupSelect
          onConfirm={(groups) => {
            setSelectedGroups(groups);
            setPhase("wizard-modules");
          }}
          onCancel={cancel}
        />
      )}

      {phase === "wizard-modules" && (
        <ModuleSelect
          groups={selectedGroups}
          platform={platform}
          onConfirm={(mods) => {
            setSelectedModules(mods);
            setPhase("wizard-confirm");
          }}
          onBack={() => setPhase("wizard-groups")}
          onCancel={cancel}
        />
      )}

      {phase === "wizard-confirm" && (
        <Confirmation
          modules={selectedModules}
          onConfirm={() => setPhase("running")}
          onBack={() => setPhase("wizard-modules")}
          onCancel={cancel}
        />
      )}

      {(phase === "running" || phase === "done") && (
        <>
          <Progress modules={modules} total={selectedModules.length} />
          {done && <Summary modules={modules} />}
        </>
      )}

      <Text>{""}</Text>
    </Box>
  );
}

// ── Exported view — decides wizard vs non-interactive ──────────────────────

export function InitView({ flags }: { flags: InitFlags }) {
  if (hasExplicitFlags(flags)) {
    return <NonInteractiveInit flags={flags} />;
  }
  return <WizardInit />;
}
