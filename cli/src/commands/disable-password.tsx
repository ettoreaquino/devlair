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
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
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
  if (!existsSync(authKeysPath) || statSync(authKeysPath).size === 0) {
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
  if (!existsSync(SSHD_CONF)) {
    return {
      ok: false,
      error: `${SSHD_CONF} not found. Run 'sudo devlair init --only ssh' first.`,
    };
  }

  const current = readFileSync(SSHD_CONF, "utf8");
  let updated = current.replace("PasswordAuthentication yes", "PasswordAuthentication no");
  if (!updated.includes("PasswordAuthentication no")) {
    updated += "\nPasswordAuthentication no\n";
  }
  writeFileSync(SSHD_CONF, updated, "utf8");

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

  // Bail conditions: non-linux platform, preflight failure.
  useEffect(() => {
    if (platform !== "linux" || (check && !check.ok)) {
      process.exitCode = 1;
      setTimeout(() => exit(), 0);
    }
  }, [platform, check, exit]);

  // Auto-apply when --yes was passed.
  useEffect(() => {
    if (!flags.yes || !check?.ok || phase !== "confirm") return;
    const res = applyHardening();
    setResult(res);
    if (!res.ok) process.exitCode = 1;
    setPhase("done");
    setTimeout(() => exit(), 0);
  }, [flags.yes, check, phase, exit]);

  useInput(
    (input, key) => {
      if (key.return || input === "y" || input === "Y") {
        const res = applyHardening();
        setResult(res);
        if (!res.ok) process.exitCode = 1;
        setPhase("done");
        setTimeout(() => exit(), 0);
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
