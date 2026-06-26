/**
 * devlair uninstall — reverse everything devlair installed and configured,
 * returning the machine to a state where a fresh install can run cleanly.
 *
 * Each module owns its own teardown (the `uninstall` mode in cli/modules/<key>.sh);
 * this command orchestrates them in reverse dependency order, then removes the
 * devlair-core artifacts (binary, share dir, ~/.devlair) that no module owns.
 *
 * Sensitive items (SSH keys, git identity, authorized_keys, tailscale auth) are
 * kept by default. Interactively, the user is asked per-category whether to
 * destroy each. `--yes` keeps all of them non-interactively; `--purge` destroys
 * all of them non-interactively.
 */

import { spawnSync } from "node:child_process";
import { existsSync, rmSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ModuleRun, Progress } from "../components/Progress.js";
import type { UninstallFlags } from "../lib/args.js";
import { buildModuleContext, resolveInvokingUser } from "../lib/context.js";
import { createInitLogDir, invokerOwnership, moduleLogPath } from "../lib/logs.js";
import { resolveTeardownOrder } from "../lib/modules.js";
import { moduleScriptPath } from "../lib/paths.js";
import { detectPlatform, detectWslVersion } from "../lib/platform.js";
import { runModule } from "../lib/runner.js";
import { D_COMMENT, D_FG, D_GREEN, D_ORANGE, D_PURPLE, D_RED } from "../lib/theme.js";
import type { ModuleContext, Status } from "../lib/types.js";

// ── Sensitive categories (default keep) ────────────────────────────────────

interface SensitiveCategory {
  /** Config key passed to module scripts (read via ctx_get_config). */
  configKey: string;
  label: string;
  /** What gets destroyed if the user opts in. */
  destroys: string;
  present: (home: string) => boolean;
}

function commandExists(cmd: string): boolean {
  return spawnSync("command", ["-v", cmd], { shell: "/bin/bash", stdio: "ignore" }).status === 0;
}

function nonEmptyFile(path: string): boolean {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

const SENSITIVE: SensitiveCategory[] = [
  {
    configKey: "keep_github_key",
    label: "GitHub SSH key",
    destroys: "~/.ssh/id_ed25519_github + its ~/.ssh/config entry",
    present: (home) => existsSync(join(home, ".ssh", "id_ed25519_github")),
  },
  {
    configKey: "keep_git_identity",
    label: "git identity",
    destroys: "git config --global user.email / user.name / init.defaultBranch",
    present: (home) => existsSync(join(home, ".gitconfig")),
  },
  {
    configKey: "keep_authorized_keys",
    label: "~/.ssh/authorized_keys",
    destroys: "~/.ssh/authorized_keys (may contain keys devlair didn't add)",
    present: (home) => nonEmptyFile(join(home, ".ssh", "authorized_keys")),
  },
  {
    configKey: "keep_tailscale_auth",
    label: "Tailscale auth",
    destroys: "tailscale logout (drops this node from your tailnet)",
    present: () => commandExists("tailscale"),
  },
];

// ── devlair-core artifacts (owned by no module; removed last) ───────────────

interface CoreItem {
  label: string;
  path: string;
  privileged: boolean;
}

function coreItems(home: string): CoreItem[] {
  return [
    { label: "devlair binary", path: "/usr/local/bin/devlair", privileged: true },
    { label: "devlair modules", path: "/usr/local/share/devlair", privileged: true },
    { label: "~/.devlair/", path: join(home, ".devlair"), privileged: false },
  ];
}

function removePrivileged(p: string): boolean {
  try {
    if (statSync(p).isDirectory()) rmSync(p, { recursive: true, force: true });
    else unlinkSync(p);
    return true;
  } catch {
    return spawnSync("sudo", ["-n", "rm", "-rf", p], { stdio: "ignore" }).status === 0;
  }
}

function removeCoreItem(item: CoreItem): Status {
  if (!existsSync(item.path)) return "skip";
  if (item.privileged) return removePrivileged(item.path) ? "ok" : "fail";
  try {
    rmSync(item.path, { recursive: true, force: true });
    return "ok";
  } catch {
    return "fail";
  }
}

/** True when devlair appears to be installed at all. */
function anythingInstalled(home: string): boolean {
  return (
    existsSync("/usr/local/bin/devlair") ||
    existsSync(join(home, ".devlair")) ||
    existsSync(join(home, ".zim")) ||
    existsSync(join(home, ".tmux.conf"))
  );
}

const CORE_KEY = "__devlair_core__";

// ── Phases ──────────────────────────────────────────────────────────────────

type Phase = "prompt" | "confirm" | "running" | "done";

export function UninstallView({ flags }: { flags: UninstallFlags }) {
  const { exit } = useApp();
  const exitRef = useRef(exit);

  const [[username, userHome]] = useState(() => resolveInvokingUser());
  const [platform] = useState(() => detectPlatform());

  // Sensitive categories present on this machine, in order.
  const [categories] = useState(() => SENSITIVE.filter((c) => c.present(userHome)));
  // keep[i] === true means keep (default); false means destroy.
  const [keep, setKeep] = useState<boolean[]>(() => categories.map(() => !flags.purge));

  const installed = anythingInstalled(userHome);

  // --yes / --purge skip prompts; otherwise ask per present category, then confirm.
  const initialPhase: Phase = !installed
    ? "done"
    : flags.yes || flags.purge || categories.length === 0
      ? "confirm"
      : "prompt";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [promptIdx, setPromptIdx] = useState(0);
  const [aborted, setAborted] = useState(false);

  const teardown = useState(() => resolveTeardownOrder(platform))[0];

  const [modules, setModules] = useState<ModuleRun[]>(() =>
    [...teardown.map((s) => ({ key: s.key, label: s.label })), { key: CORE_KEY, label: "devlair files" }].map((m) => ({
      key: m.key,
      label: m.label,
      status: "pending" as const,
      detail: "",
      progressMsg: "",
      progressHistory: [],
    })),
  );

  const buildContext = useCallback((): ModuleContext => {
    const wslVersion = detectWslVersion(platform);
    const config: Record<string, string> = {
      // jq's `// empty` treats JSON false as empty, so pass strings, not booleans.
      remove_packages: flags.keepPackages ? "false" : "true",
    };
    categories.forEach((c, i) => {
      config[c.configKey] = keep[i] ? "true" : "false";
    });
    return buildModuleContext(platform, wslVersion, config);
  }, [platform, flags.keepPackages, categories, keep]);

  const runTeardown = useCallback(() => {
    setPhase("running");
    const context = buildContext();
    const abort = new AbortController();
    let logDir: string | null = null;
    try {
      logDir = createInitLogDir(userHome);
    } catch {
      // best-effort logging
    }

    (async () => {
      for (let i = 0; i < teardown.length; i++) {
        const spec = teardown[i];
        setModules((prev) => prev.map((m) => (m.key === spec.key ? { ...m, status: "running" } : m)));

        let status: Status = "fail";
        let detail = "";
        let resultEmitted = false;
        try {
          const ownership = invokerOwnership();
          const iter = runModule(moduleScriptPath(spec.key), context, "uninstall", {
            signal: abort.signal,
            logFile: logDir ? moduleLogPath(logDir, spec.key) : undefined,
            chownUidGid: ownership ?? undefined,
          });
          while (true) {
            const { value, done } = await iter.next();
            if (done) {
              if (!resultEmitted) status = value.status;
              break;
            }
            if (value.type === "progress") {
              setModules((prev) =>
                prev.map((m) =>
                  m.key === spec.key
                    ? {
                        ...m,
                        progressMsg: value.message,
                        progressHistory: m.progressMsg ? [...m.progressHistory, m.progressMsg] : m.progressHistory,
                      }
                    : m,
                ),
              );
            } else if (value.type === "result") {
              status = value.status;
              detail = value.detail;
              resultEmitted = true;
            }
          }
        } catch (err) {
          status = "fail";
          detail = err instanceof Error ? err.message : String(err);
        }

        setModules((prev) =>
          prev.map((m) => (m.key === spec.key ? { ...m, status, detail, progressMsg: "", progressHistory: [] } : m)),
        );
      }

      // devlair-core removal — runs after every module, last (modules read state
      // from ~/.devlair while they run).
      setModules((prev) => prev.map((m) => (m.key === CORE_KEY ? { ...m, status: "running" } : m)));
      const results = coreItems(userHome).map((item) => ({ item, status: removeCoreItem(item) }));
      const coreFail = results.some((r) => r.status === "fail");
      const coreRemoved = results.filter((r) => r.status === "ok").map((r) => r.item.label);
      setModules((prev) =>
        prev.map((m) =>
          m.key === CORE_KEY
            ? {
                ...m,
                status: coreFail ? "fail" : coreRemoved.length > 0 ? "ok" : "skip",
                detail: coreFail
                  ? "some files need root (try: sudo devlair uninstall)"
                  : coreRemoved.length > 0
                    ? `removed: ${coreRemoved.join(", ")}`
                    : "nothing to remove",
                progressMsg: "",
              }
            : m,
        ),
      );

      setPhase("done");
      if (coreFail) process.exitCode = 1;
      setTimeout(() => exitRef.current(), 0);
    })();

    return abort;
  }, [buildContext, teardown]);

  // Auto-start for non-interactive paths handled via initialPhase + this effect.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!installed && phase === "done") {
      setTimeout(() => exitRef.current(), 0);
      return;
    }
    if ((flags.yes || flags.purge) && phase === "confirm" && !startedRef.current) {
      startedRef.current = true;
      const abort = runTeardown();
      return () => abort.abort();
    }
  }, [flags.yes, flags.purge, phase, installed, runTeardown]);

  // Prompt-phase input: y = destroy, n/Enter = keep (default).
  useInput(
    (input, key) => {
      const destroy = input === "y" || input === "Y";
      const keepIt = key.return || input === "n" || input === "N";
      if (!destroy && !keepIt) return;
      setKeep((prev) => {
        const next = [...prev];
        next[promptIdx] = !destroy;
        return next;
      });
      const nextIdx = promptIdx + 1;
      if (nextIdx >= categories.length) setPhase("confirm");
      else setPromptIdx(nextIdx);
    },
    { isActive: phase === "prompt" },
  );

  // Confirm-phase input (interactive only).
  useInput(
    (input, key) => {
      if (key.return || input === "y" || input === "Y") {
        const abort = runTeardown();
        // Abort handler is wired through the component lifecycle via runTeardown's
        // own AbortController; nothing else to do here.
        void abort;
      } else if (key.escape || input === "n" || input === "N" || input === "q") {
        setAborted(true);
        setPhase("done");
        setTimeout(() => exitRef.current(), 0);
      }
    },
    { isActive: phase === "confirm" && !flags.yes && !flags.purge },
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={D_PURPLE} bold>
          {"  devlair"}
        </Text>
        <Text color={D_RED} bold>
          {"  uninstall"}
        </Text>
        <Text color={D_COMMENT}>{"  Removing devlair from "}</Text>
        <Text color={D_FG} bold>
          {username}
        </Text>
      </Box>

      {!installed && phase === "done" && (
        <Text color={D_COMMENT}>{"  Nothing to remove — devlair does not appear to be installed."}</Text>
      )}

      {phase === "prompt" && categories[promptIdx] && (
        <Box flexDirection="column">
          <Text color={D_ORANGE}>{"  Keep or destroy sensitive items? (default: keep)"}</Text>
          <Box marginTop={1}>
            <Text color={D_COMMENT}>{`  [${promptIdx + 1}/${categories.length}] `}</Text>
            <Text>{"Destroy "}</Text>
            <Text color={D_FG} bold>
              {categories[promptIdx].label}
            </Text>
            <Text color={D_COMMENT}>{"?  (y / N)"}</Text>
          </Box>
          <Text color={D_COMMENT}>{`        ${categories[promptIdx].destroys}`}</Text>
        </Box>
      )}

      {phase === "confirm" && !flags.yes && !flags.purge && (
        <Box flexDirection="column">
          <Text color={D_ORANGE}>{"  About to remove devlair, its tools, and configuration."}</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text color={D_COMMENT}>
              {"    packages: "}
              <Text color={D_FG}>{flags.keepPackages ? "kept" : "removed"}</Text>
            </Text>
            {categories.map((c, i) => (
              <Text key={c.configKey} color={D_COMMENT}>
                {"    "}
                {c.label}
                {": "}
                <Text color={keep[i] ? D_GREEN : D_RED}>{keep[i] ? "kept" : "destroyed"}</Text>
              </Text>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text color={D_PURPLE}>{"  Proceed? "}</Text>
            <Text color={D_COMMENT}>{"(y/N)"}</Text>
          </Box>
        </Box>
      )}

      {(phase === "running" || (phase === "done" && installed && !aborted)) && (
        <Progress modules={modules} total={modules.length} />
      )}

      {phase === "done" && !aborted && installed && (
        <Box marginTop={1} flexDirection="column">
          {modules.some((m) => m.status === "fail") ? (
            <Text color={D_ORANGE}>{"  Some items could not be removed. See errors above."}</Text>
          ) : (
            <>
              <Text color={D_GREEN}>{"  ✓ devlair uninstalled."}</Text>
              <Text color={D_COMMENT}>
                {
                  "  Fresh install: curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | bash"
                }
              </Text>
              <Text color={D_COMMENT}>{"  Open a new shell for the restored login shell to take effect."}</Text>
            </>
          )}
        </Box>
      )}

      {aborted && (
        <Box marginTop={1}>
          <Text color={D_COMMENT}>{"  Aborted."}</Text>
        </Box>
      )}
    </Box>
  );
}
