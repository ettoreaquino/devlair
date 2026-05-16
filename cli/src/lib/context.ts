import { homedir, userInfo } from "node:os";
import type { ModuleContext, Platform } from "./types.js";

/**
 * Resolve the real user behind sudo. Returns [username, homeDir].
 * Falls back to the current OS user when not running under sudo.
 */
const VALID_USERNAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

function isSafeHome(path: string, username: string): boolean {
  return path === `/home/${username}` || path === `/Users/${username}`;
}

export function resolveInvokingUser(): [username: string, homeDir: string] {
  const sudoUser = process.env.SUDO_USER;
  if (sudoUser && sudoUser !== "root" && VALID_USERNAME_RE.test(sudoUser)) {
    // SUDO_HOME is non-standard; only honor it when it points to a conventional
    // user home for the same name. Otherwise derive /home/<user>.
    const claimed = process.env.SUDO_HOME;
    const home = claimed && isSafeHome(claimed, sudoUser) ? claimed : `/home/${sudoUser}`;
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
