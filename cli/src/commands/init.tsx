/**
 * devlair init — machine provisioning with optional interactive wizard.
 *
 * When CLI flags are provided (--only, --group, --skip, --config),
 * runs non-interactively. Otherwise launches the wizard:
 * group select -> module select -> confirmation -> execution.
 */

import { hostname } from "node:os";
import { useApp, useInput } from "ink";
import { Box, Text } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";

import { Logo } from "../components/Logo.js";
import { type ModuleRun, Progress } from "../components/Progress.js";
import { OptionalHint, Summary } from "../components/Summary.js";
import type { InitFlags } from "../lib/args.js";
import { resolveBrand } from "../lib/brand.js";
import { buildModuleContext } from "../lib/context.js";
import { createInitLogDir, invokerOwnership, moduleLogPath } from "../lib/logs.js";
import type { Group, ModuleSpec } from "../lib/modules.js";
import { moduleScriptPath } from "../lib/paths.js";
import { detectPlatform, detectWslVersion } from "../lib/platform.js";
import { type Profile, ProfileError, loadProfile, resolveProfileKeys } from "../lib/profiles.js";
import { runModule } from "../lib/runner.js";
import { selectModules } from "../lib/selection.js";
import { pickStderrDetail } from "../lib/stderr.js";
import { D_COMMENT, D_FG, D_PINK, D_PURPLE, D_RED } from "../lib/theme.js";
import type { ModuleContext, Status } from "../lib/types.js";
import { Confirmation } from "../wizard/Confirmation.js";
import { GithubConfig, type GithubConfigValues } from "../wizard/GithubConfig.js";
import { GroupSelect } from "../wizard/GroupSelect.js";
import { ModuleSelect } from "../wizard/ModuleSelect.js";

type Phase = "wizard-groups" | "wizard-modules" | "wizard-confirm" | "wizard-github" | "running" | "done";

function InitHeader({
  username,
  host,
  platform,
  profileName,
  brand,
}: {
  username: string;
  host: string;
  platform: string;
  profileName?: string;
  brand: string;
}) {
  const suffix = platform === "wsl" ? " (WSL)" : platform === "macos" ? " (macOS)" : "";

  return (
    <Box flexDirection="column">
      <Logo brand={brand} />
      <Box marginBottom={1}>
        <Text>{"  "}</Text>
        <Text color={D_PURPLE} bold>
          {brand}
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
  const [logDir, setLogDir] = useState<string | null>(null);

  // Abort controller for the module currently waiting on an auth panel. Pressing
  // Enter aborts it, which tells runModule to send SIGUSR1 so the module stops
  // polling and continues instead of blocking forever.
  const authSkipRef = useRef<AbortController | null>(null);
  const awaitingAuth = modules.some((m) => m.authUrl);
  useInput(
    (_input, key) => {
      if (key.return) authSkipRef.current?.abort();
    },
    { isActive: awaitingAuth && process.stdin.isTTY === true },
  );

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
        progressHistory: [],
      })),
    );
    setDone(false);
  }, [specs]);

  useEffect(() => {
    if (!autoStart || specs.length === 0) return;

    const abortController = new AbortController();
    // Avoid creating empty dirs when the wizard is cancelled before running.
    let runLogDir: string | null = null;
    try {
      runLogDir = createInitLogDir(context.userHome);
      setLogDir(runLogDir);
    } catch {
      // Logging is best-effort — never block a run because we couldn't mkdir.
    }

    async function run() {
      for (let i = 0; i < specs.length; i++) {
        if (abortController.signal.aborted) break;
        const spec = specs[i];

        setModules((prev) => prev.map((m, j) => (j === i ? { ...m, status: "running" } : m)));

        let finalStatus: Status = "fail";
        let finalDetail = "";
        let resultEmitted = false;

        try {
          const scriptPath = moduleScriptPath(spec.key);
          const ownership = invokerOwnership();
          const skipController = new AbortController();
          authSkipRef.current = skipController;
          const iter = runModule(scriptPath, context, "run", {
            signal: abortController.signal,
            skipSignal: skipController.signal,
            logFile: runLogDir ? moduleLogPath(runLogDir, spec.key) : undefined,
            chownUidGid: ownership ?? undefined,
          });

          while (true) {
            const { value, done: iterDone } = await iter.next();
            if (iterDone) {
              // Only fall back to exit-code status when the module never emitted
              // a `result` event — otherwise we'd promote warn→ok on exit 0.
              if (!resultEmitted) finalStatus = value.status;
              if (!finalDetail && finalStatus !== "ok") {
                const picked = pickStderrDetail(value.stderr);
                if (picked) finalDetail = picked;
              }
              break;
            }
            if (value.type === "progress") {
              setModules((prev) =>
                prev.map((m, j) =>
                  j === i
                    ? {
                        ...m,
                        progressMsg: value.message,
                        // Only archive the previous message when it differs from
                        // the incoming one — modules sometimes emit the same step
                        // twice (e.g. devtools + brew_install both say "installing uv").
                        progressHistory:
                          m.progressMsg && m.progressMsg !== value.message
                            ? [...m.progressHistory, m.progressMsg]
                            : m.progressHistory,
                      }
                    : m,
                ),
              );
            } else if (value.type === "result") {
              finalStatus = value.status;
              finalDetail = value.detail;
              resultEmitted = true;
            } else if (value.type === "auth_url") {
              const authUrl = { url: value.url, message: value.message };
              setModules((prev) => prev.map((m, j) => (j === i ? { ...m, authUrl } : m)));
            }
          }
        } catch (err) {
          finalStatus = "fail";
          finalDetail = err instanceof Error ? err.message : String(err);
        }

        setModules((prev) =>
          prev.map((m, j) =>
            j === i
              ? {
                  ...m,
                  status: finalStatus,
                  detail: finalDetail,
                  progressMsg: "",
                  progressHistory: [],
                  authUrl: undefined,
                }
              : m,
          ),
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

  return { modules, done, logDir };
}

// ── Non-interactive init (flags provided) ──────────────────────────────────

interface InitState {
  platform: ReturnType<typeof detectPlatform>;
  context: ModuleContext;
  selected: ModuleSpec[];
  optional: ModuleSpec[];
  skippedNames: string;
  profile: Profile | null;
  brand: string;
}

function buildInitState(flags: InitFlags, profile: Profile | null): InitState {
  const platform = detectPlatform();
  const wslVersion = detectWslVersion(platform);
  const profileConfig = (profile?.config ?? {}) as Record<string, unknown>;
  const base = buildModuleContext(platform, wslVersion, profileConfig);
  // Resolve the brand (flag > persisted > default) and pipe it to the modules
  // so the shell module persists it and renders the login banner with it.
  const brand = resolveBrand(flags.brand, base.userHome);
  const config: Record<string, unknown> = { ...profileConfig, brand };
  const context: ModuleContext = { ...base, config };
  const profileSelection = profile ? resolveProfileKeys(profile) : undefined;
  const { selected, optional, platformSkipped } = selectModules(flags, platform, profileSelection);

  // Non-interactive mode cannot prompt — surface required config gaps up front
  // rather than letting the github module silently skip with exit 2.
  if (selected.some((m) => m.key === "github") && !config.github_email) {
    throw new ProfileError(
      "github module requires `config.github_email` in your --config setup.yaml, or run `devlair init` interactively.",
    );
  }

  return {
    platform,
    context,
    selected,
    optional,
    skippedNames: platformSkipped.map((s) => s.key).join(", "),
    profile,
    brand,
  };
}

function NonInteractiveInit({ flags }: { flags: InitFlags }) {
  const { exit } = useApp();
  const initial = (() => {
    if (flags.config) return { state: null, error: null };
    try {
      return { state: buildInitState(flags, null), error: null };
    } catch (err) {
      const msg = err instanceof ProfileError ? err.message : err instanceof Error ? err.message : String(err);
      return { state: null, error: msg };
    }
  })();
  const [initState, setInitState] = useState<InitState | null>(initial.state);
  const [error, setError] = useState<string | null>(initial.error);

  useEffect(() => {
    if (error !== null) {
      process.exitCode = 1;
      setTimeout(() => exit(), 0);
    }
  }, [error, exit]);

  useEffect(() => {
    if (initState !== null || error !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = flags.config ? await loadProfile(flags.config) : null;
        if (!cancelled) setInitState(buildInitState(flags, profile));
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ProfileError ? err.message : err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flags, initState, error]);

  if (error !== null) {
    return (
      <Box flexDirection="column">
        <Text color={D_RED}>{`  Profile error: ${error}`}</Text>
      </Box>
    );
  }
  if (initState === null) {
    return (
      <Box flexDirection="column">
        <Text color={D_COMMENT}>{"  Loading profile..."}</Text>
      </Box>
    );
  }
  return <NonInteractiveInitView state={initState} />;
}

function NonInteractiveInitView({ state }: { state: InitState }) {
  const { platform, context, selected, optional, skippedNames, profile, brand } = state;
  const { modules, done, logDir } = useModuleExecution(selected, context, true);

  return (
    <Box flexDirection="column">
      <InitHeader
        username={context.username}
        host={hostname()}
        platform={platform}
        profileName={profile?.name}
        brand={brand}
      />
      <PlatformSkipped names={skippedNames} />
      <Progress modules={modules} total={selected.length} />
      {done && <Summary modules={modules} logDir={logDir} />}
      {done && <OptionalHint specs={optional} />}
      <Text>{""}</Text>
    </Box>
  );
}

// ── Interactive wizard init (no flags) ─────────────────────────────────────

function WizardInit({ brand }: { brand?: string }) {
  const { exit } = useApp();

  const [envState] = useState(() => {
    const platform = detectPlatform();
    const wslVersion = detectWslVersion(platform);
    const base = buildModuleContext(platform, wslVersion);
    const resolvedBrand = resolveBrand(brand, base.userHome);
    const context: ModuleContext = { ...base, config: { ...base.config, brand: resolvedBrand } };
    return { platform, wslVersion, context, brand: resolvedBrand };
  });

  const { platform, context: baseContext } = envState;

  const [phase, setPhase] = useState<Phase>("wizard-groups");
  const [selectedGroups, setSelectedGroups] = useState<Set<Group>>(new Set());
  const [selectedModules, setSelectedModules] = useState<ModuleSpec[]>([]);
  const [extraConfig, setExtraConfig] = useState<Record<string, unknown>>({});

  const githubSelected = selectedModules.some((m) => m.key === "github");
  // Stable identity: useModuleExecution's run effect depends on `context`, so
  // recreating it on every render would abort the in-flight run on each setState.
  const context = useMemo<ModuleContext>(
    () => ({ ...baseContext, config: { ...baseContext.config, ...extraConfig } }),
    [baseContext, extraConfig],
  );

  const cancel = () => {
    exit();
  };

  // Execution state — only populated after wizard confirmation
  const { modules, done, logDir } = useModuleExecution(
    selectedModules,
    context,
    phase === "running" || phase === "done",
  );

  return (
    <Box flexDirection="column">
      <InitHeader username={context.username} host={hostname()} platform={platform} brand={envState.brand} />

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
          onConfirm={() => setPhase(githubSelected ? "wizard-github" : "running")}
          onBack={() => setPhase("wizard-modules")}
          onCancel={cancel}
        />
      )}

      {phase === "wizard-github" && (
        <GithubConfig
          onConfirm={(values: GithubConfigValues) => {
            setExtraConfig((prev) => ({
              ...prev,
              github_email: values.email,
              ...(values.name ? { github_name: values.name } : {}),
            }));
            setPhase("running");
          }}
          onBack={() => setPhase("wizard-confirm")}
          onCancel={cancel}
        />
      )}

      {(phase === "running" || phase === "done") && (
        <>
          <Progress modules={modules} total={selectedModules.length} />
          {done && <Summary modules={modules} logDir={logDir} />}
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
  return <WizardInit brand={flags.brand} />;
}
