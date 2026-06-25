/**
 * devlair uninstall — remove everything devlair installed and configured.
 *
 * Removes (in order):
 *   - /usr/local/bin/devlair        binary
 *   - /usr/local/share/devlair/     module scripts
 *   - ~/.devlair/                   state, logs, helper scripts
 *   - ~/.zim/                       zimfw (installed by zsh module)
 *   - ~/.zimrc                      zsh module config
 *   - ~/.zshenv                     zsh module env (if devlair-managed)
 *   - ~/.zshrc  (devlair block)     strip from marker to EOF
 *   - ~/.tmux.conf                  tmux module config
 *   - ~/.tmux/plugins/              tmux plugin manager plugins
 */

import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import type { UninstallFlags } from "../lib/args.js";
import { resolveInvokingUser } from "../lib/context.js";
import { D_COMMENT, D_FG, D_GREEN, D_ORANGE, D_PURPLE, D_RED } from "../lib/theme.js";

const ZSHRC_MARKER = "# ── devlair aliases ─";
const ZSHENV_MARKER = "skip_global_compinit";

type ItemStatus = "pending" | "ok" | "skip" | "fail";

interface RemovalItem {
  label: string;
  path: string;
  type: "file" | "dir" | "zshrc-strip";
  /** True when the path needs root to remove (binary / modules dir). */
  privileged?: boolean;
  status: ItemStatus;
  detail: string;
}

function buildItems(userHome: string): RemovalItem[] {
  return [
    {
      label: "devlair binary",
      path: "/usr/local/bin/devlair",
      type: "file",
      privileged: true,
      status: "pending",
      detail: "",
    },
    {
      label: "devlair modules",
      path: "/usr/local/share/devlair",
      type: "dir",
      privileged: true,
      status: "pending",
      detail: "",
    },
    { label: "~/.devlair/", path: join(userHome, ".devlair"), type: "dir", status: "pending", detail: "" },
    { label: "~/.zim/", path: join(userHome, ".zim"), type: "dir", status: "pending", detail: "" },
    { label: "~/.zimrc", path: join(userHome, ".zimrc"), type: "file", status: "pending", detail: "" },
    { label: "~/.zshenv", path: join(userHome, ".zshenv"), type: "file", status: "pending", detail: "" },
    {
      label: "~/.zshrc (devlair block)",
      path: join(userHome, ".zshrc"),
      type: "zshrc-strip",
      status: "pending",
      detail: "",
    },
    { label: "~/.tmux.conf", path: join(userHome, ".tmux.conf"), type: "file", status: "pending", detail: "" },
    { label: "~/.tmux/plugins/", path: join(userHome, ".tmux", "plugins"), type: "dir", status: "pending", detail: "" },
  ];
}

function pathExists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function isDevlairZshenv(p: string): boolean {
  try {
    return readFileSync(p, "utf8").includes(ZSHENV_MARKER);
  } catch {
    return false;
  }
}

function hasDevlairZshrcBlock(p: string): boolean {
  try {
    return readFileSync(p, "utf8").includes(ZSHRC_MARKER);
  } catch {
    return false;
  }
}

function stripZshrcBlock(p: string): { ok: boolean; detail: string } {
  try {
    const content = readFileSync(p, "utf8");
    const idx = content.indexOf(ZSHRC_MARKER);
    if (idx === -1) return { ok: true, detail: "no devlair block found" };
    const before = content.slice(0, idx).trimEnd();
    writeFileSync(p, before ? `${before}\n` : "", "utf8");
    return { ok: true, detail: "block removed" };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

function removePrivileged(p: string): { ok: boolean; detail: string } {
  // Try direct removal first; fall back to sudo -n (non-interactive, uses cached creds).
  try {
    const stat = statSync(p);
    if (stat.isDirectory()) {
      rmSync(p, { recursive: true, force: true });
    } else {
      unlinkSync(p);
    }
    return { ok: true, detail: "removed" };
  } catch {
    const r = spawnSync("sudo", ["-n", "rm", "-rf", p], { stdio: "ignore" });
    if (r.status === 0) return { ok: true, detail: "removed" };
    return { ok: false, detail: "permission denied (try: sudo devlair uninstall)" };
  }
}

function removeItem(item: RemovalItem): Pick<RemovalItem, "status" | "detail"> {
  if (!pathExists(item.path)) {
    return { status: "skip", detail: "not found" };
  }

  if (item.type === "zshrc-strip") {
    if (!hasDevlairZshrcBlock(item.path)) {
      return { status: "skip", detail: "no devlair block" };
    }
    const r = stripZshrcBlock(item.path);
    return { status: r.ok ? "ok" : "fail", detail: r.detail };
  }

  if (item.type === "file" && item.path.endsWith(".zshenv") && !isDevlairZshenv(item.path)) {
    return { status: "skip", detail: "not devlair-managed" };
  }

  if (item.privileged) {
    const r = removePrivileged(item.path);
    return { status: r.ok ? "ok" : "fail", detail: r.detail };
  }

  try {
    if (item.type === "dir") {
      rmSync(item.path, { recursive: true, force: true });
    } else {
      unlinkSync(item.path);
    }
    return { status: "ok", detail: "removed" };
  } catch (err) {
    return { status: "fail", detail: (err as Error).message };
  }
}

function statusIcon(status: ItemStatus): { char: string; color: string } {
  switch (status) {
    case "ok":
      return { char: "✓", color: D_GREEN };
    case "skip":
      return { char: "–", color: D_COMMENT };
    case "fail":
      return { char: "✗", color: D_RED };
    default:
      return { char: " ", color: D_COMMENT };
  }
}

type Phase = "confirm" | "running" | "done";

export function UninstallView({ flags }: { flags: UninstallFlags }) {
  const { exit } = useApp();
  const [[username, userHome]] = useState(() => resolveInvokingUser());
  const [phase, setPhase] = useState<Phase>("confirm");
  const [items, setItems] = useState<RemovalItem[]>(() => buildItems(userHome));
  const [aborted, setAborted] = useState(false);

  const runRemoval = useCallback(() => {
    setPhase("running");

    // Run synchronously then update state in one batch — avoids partial renders
    // while the (fast) fs operations complete.
    const results = items.map((item) => {
      const update = removeItem(item);
      return { ...item, ...update };
    });

    setItems(results);
    setPhase("done");

    const anyFail = results.some((r) => r.status === "fail");
    if (anyFail) process.exitCode = 1;
    setTimeout(() => exit(), 0);
  }, [items, exit]);

  // Auto-run when --yes is passed
  useEffect(() => {
    if (flags.yes && phase === "confirm") runRemoval();
  }, [flags.yes, phase, runRemoval]);

  useInput(
    (input, key) => {
      if (key.return || input === "y" || input === "Y") {
        runRemoval();
      } else if (key.escape || input === "n" || input === "N" || input === "q") {
        setAborted(true);
        setPhase("done");
        setTimeout(() => exit(), 0);
      }
    },
    { isActive: phase === "confirm" && !flags.yes },
  );

  const presentItems = items.filter((item) => {
    if (!pathExists(item.path)) return false;
    if (item.type === "zshrc-strip") return hasDevlairZshrcBlock(item.path);
    if (item.type === "file" && item.path.endsWith(".zshenv")) return isDevlairZshenv(item.path);
    return true;
  });

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

      {phase === "confirm" && (
        <Box flexDirection="column">
          {presentItems.length === 0 ? (
            <Box marginBottom={1}>
              <Text color={D_COMMENT}>{"  Nothing to remove — devlair does not appear to be installed."}</Text>
            </Box>
          ) : (
            <Box flexDirection="column" marginBottom={1}>
              <Text color={D_ORANGE}>{"  The following will be permanently deleted:"}</Text>
              {presentItems.map((item) => (
                <Text key={item.path} color={D_COMMENT}>
                  {"    · "}
                  <Text color={D_FG}>{item.label}</Text>
                </Text>
              ))}
            </Box>
          )}

          {presentItems.length > 0 && !flags.yes && (
            <Box>
              <Text>{"  "}</Text>
              <Text color={D_PURPLE}>Remove everything listed above? </Text>
              <Text color={D_COMMENT}>(y/N)</Text>
            </Box>
          )}
        </Box>
      )}

      {(phase === "running" || phase === "done") && (
        <Box flexDirection="column">
          {items.map((item) => {
            if (item.status === "pending") return null;
            const icon = statusIcon(item.status);
            return (
              <Box key={item.path}>
                <Text color={icon.color}>
                  {"  "}
                  {icon.char}
                </Text>
                <Text>
                  {"  "}
                  {item.label}
                </Text>
                {item.detail && (
                  <Text color={D_COMMENT}>
                    {"  "}
                    {item.detail}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {phase === "done" && !aborted && (
        <Box marginTop={1} flexDirection="column">
          {items.some((r) => r.status === "fail") ? (
            <Text color={D_ORANGE}>{"  Some items could not be removed. See errors above."}</Text>
          ) : (
            <>
              <Text color={D_GREEN}>{"  ✓ devlair uninstalled."}</Text>
              <Text color={D_COMMENT}>
                {
                  "  Run the installer again for a clean install: curl -fsSL https://raw.githubusercontent.com/ettoreaquino/devlair/main/install.sh | bash"
                }
              </Text>
            </>
          )}
        </Box>
      )}

      {aborted && (
        <Box marginTop={1}>
          <Text color={D_COMMENT}>{"  Aborted."}</Text>
        </Box>
      )}

      <Text>{""}</Text>
    </Box>
  );
}
