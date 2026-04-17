import { homedir, userInfo } from "node:os";
import type { ModuleContext, Platform } from "./types.js";

/**
 * Resolve the real user behind sudo. Returns [username, homeDir].
 * Falls back to the current OS user when not running under sudo.
 */
export function resolveInvokingUser(): [username: string, homeDir: string] {
  const sudoUser = process.env.SUDO_USER;
  if (sudoUser && sudoUser !== "root") {
    // Under sudo HOME points to root's home. SUDO_HOME is non-standard but
    // set by some wrappers; fall back to /home/<user> which covers Linux.
    const home = process.env.SUDO_HOME ?? `/home/${sudoUser}`;
    return [sudoUser, home];
  }
  const info = userInfo({ encoding: "utf8" });
  return [info.username, info.homedir || homedir()];
}

/** Build the ModuleContext that gets piped to module scripts via stdin. */
export function buildModuleContext(
  platform: Platform,
  wslVersion: 1 | 2 | null,
  config: Record<string, unknown> = {},
): ModuleContext {
  const [username, userHome] = resolveInvokingUser();
  return { username, userHome, platform, wslVersion, config };
}
