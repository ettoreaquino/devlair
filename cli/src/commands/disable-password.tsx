/**
 * devlair disable-password — flips SSH to key-only auth.
 *
 * Verifies the invoking user has at least one public key in
 * ~/.ssh/authorized_keys, prompts for confirmation, then rewrites
 * /etc/ssh/sshd_config.d/99-hardened.conf and restarts sshd.
 *
 * Linux-only: WSL has no systemctl-managed sshd; macOS uses launchd.
 */

import { spawnSync } from "node:child_process";
import { closeSync, constants as fsConstants, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import type { DisablePasswordFlags } from "../lib/args.js";
import { resolveInvokingUser } from "../lib/context.js";
import { detectPlatform } from "../lib/platform.js";
import { D_COMMENT, D_FG, D_GREEN, D_ORANGE, D_PURPLE, D_RED } from "../lib/theme.js";

const SSHD_CONF = "/etc/ssh/sshd_config.d/99-hardened.conf";

interface Preflight {
  ok: boolean;
  /** Number of public keys in authorized_keys (only set when ok). */
  keyCount?: number;
  /** Path checked, surfaced in error messages. */
  authKeysPath: string;
  /** Reason for failure when ok=false. */
  reason?: string;
  username: string;
}

function countAuthorizedKeys(path: string): number {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#");
    }).length;
}

function preflight(): Preflight {
  const [username, userHome] = resolveInvokingUser();
  const authKeysPath = join(userHome, ".ssh", "authorized_keys");
  let size = 0;
  try {
    size = statSync(authKeysPath).size;
  } catch {
    size = 0;
  }
  if (size === 0) {
    return {
      ok: false,
      authKeysPath,
      username,
      reason: `No public key found. Add one to ${authKeysPath} before disabling password auth.`,
    };
  }
  return { ok: true, authKeysPath, username, keyCount: countAuthorizedKeys(authKeysPath) };
}

interface ApplyResult {
  ok: boolean;
  error?: string;
}

function applyHardening(): ApplyResult {
  // Open with O_NOFOLLOW so a swapped-in symlink (e.g. → /etc/sudoers) fails
  // with ELOOP instead of redirecting our root-privileged write.
  let fd: number;
  try {
    fd = openSync(SSHD_CONF, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, error: `${SSHD_CONF} not found. Run 'sudo devlair init --only ssh' first.` };
    }
    if (code === "ELOOP") {
      return { ok: false, error: `${SSHD_CONF} is a symlink — refusing to write. Inspect the file manually.` };
    }
    return { ok: false, error: `Cannot read ${SSHD_CONF}: ${(err as Error).message}` };
  }
  const current = readFileSync(fd, "utf8");
  closeSync(fd);

  let updated = current.replace(/^[ \t]*PasswordAuthentication[ \t]+.*$/gm, "PasswordAuthentication no");
  if (!/^[ \t]*PasswordAuthentication[ \t]+no\b/m.test(updated)) {
    updated += "\nPasswordAuthentication no\n";
  }

  try {
    const writeFd = openSync(SSHD_CONF, fsConstants.O_WRONLY | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW);
    writeFileSync(writeFd, updated, "utf8");
    closeSync(writeFd);
  } catch (err) {
    return { ok: false, error: `Cannot write ${SSHD_CONF}: ${(err as Error).message}` };
  }

  const restart = spawnSync("systemctl", ["restart", "ssh"], { stdio: "ignore" });
  if (restart.status !== 0) {
    return { ok: false, error: "systemctl restart ssh failed — file written but sshd may still accept passwords." };
  }
  return { ok: true };
}

type Phase = "confirm" | "done";

export interface DisablePasswordViewProps {
  flags: DisablePasswordFlags;
}

export function DisablePasswordView({ flags }: DisablePasswordViewProps) {
  const { exit } = useApp();
  const [platform] = useState(() => detectPlatform());
  const [check] = useState(() => (platform === "linux" ? preflight() : null));
  const [phase, setPhase] = useState<Phase>("confirm");
  const [result, setResult] = useState<ApplyResult | null>(null);
  const aborted = phase === "done" && result === null;

  const runApply = useCallback(() => {
    const res = applyHardening();
    setResult(res);
    if (!res.ok) process.exitCode = 1;
    setPhase("done");
    setTimeout(() => exit(), 0);
  }, [exit]);

  useEffect(() => {
    if (platform !== "linux" || (check && !check.ok)) {
      process.exitCode = 1;
      setTimeout(() => exit(), 0);
    }
  }, [platform, check, exit]);

  useEffect(() => {
    if (flags.yes && check?.ok && phase === "confirm") runApply();
  }, [flags.yes, check, phase, runApply]);

  useInput(
    (input, key) => {
      if (key.return || input === "y" || input === "Y") {
        runApply();
      } else if (key.escape || input === "n" || input === "N" || input === "q") {
        setPhase("done");
        setTimeout(() => exit(), 0);
      }
    },
    { isActive: phase === "confirm" && check?.ok === true && !flags.yes },
  );

  if (platform !== "linux") {
    return (
      <Box flexDirection="column">
        <Text color={D_RED}>{`  disable-password is Linux-only (current platform: ${platform}).`}</Text>
        <Text color={D_COMMENT}>{"  WSL uses Windows SSH; macOS uses launchd."}</Text>
      </Box>
    );
  }

  if (!check || !check.ok) {
    return (
      <Box flexDirection="column">
        <Header />
        <Box marginTop={1}>
          <Text color={D_RED}>{`  ${check?.reason ?? "Preflight failed."}`}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header />
      <Box marginTop={1} flexDirection="column">
        <Text>
          {"  "}
          <Text color={D_GREEN}>{check.keyCount}</Text>
          <Text color={D_COMMENT}>{" public key(s) found for "}</Text>
          <Text color={D_FG} bold>
            {check.username}
          </Text>
          <Text color={D_COMMENT}>{` at ${check.authKeysPath}`}</Text>
        </Text>
        <Text color={D_COMMENT}>{`  Updates ${SSHD_CONF} and sets PasswordAuthentication no.`}</Text>
        <Text color={D_ORANGE}>{"  Make sure you can log in with your SSH key before continuing."}</Text>
      </Box>

      {phase === "confirm" && !flags.yes && (
        <Box marginTop={1}>
          <Text>{"  "}</Text>
          <Text color={D_PURPLE}>Disable SSH password authentication? </Text>
          <Text color={D_COMMENT}>(y/N)</Text>
        </Box>
      )}

      {phase === "done" && result?.ok && (
        <Box marginTop={1} flexDirection="column">
          <Text color={D_GREEN}>{"  ✓ Password authentication disabled."}</Text>
          <Text color={D_COMMENT}>{"  SSH now requires a key to log in."}</Text>
        </Box>
      )}

      {phase === "done" && result && !result.ok && (
        <Box marginTop={1}>
          <Text color={D_RED}>{`  ${result.error}`}</Text>
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

function Header() {
  return (
    <Box>
      <Text color={D_PURPLE} bold>
        {"  devlair"}
      </Text>
      <Text bold color={D_FG}>
        {"  disable-password"}
      </Text>
      <Text color={D_COMMENT}>{"  Hardening SSH authentication"}</Text>
    </Box>
  );
}
