/**
 * devlair upgrade — self-update + system/tool upgrades.
 *
 * 1. Self-update: check GitHub Releases for a newer binary, download and replace.
 * 2. Tool upgrades: run modules/upgrade.sh to update system packages and tools.
 * 3. Re-apply: re-run REAPPLY_KEYS modules to refresh configs.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { useApp } from "ink";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef, useState } from "react";

import { Logo } from "../components/Logo.js";
import { type ModuleRun, Progress } from "../components/Progress.js";
import type { UpgradeFlags } from "../lib/args.js";
import { resolveBrand } from "../lib/brand.js";
import { buildModuleContext } from "../lib/context.js";
import { REAPPLY_KEYS, resolveOrder } from "../lib/modules.js";
import { moduleScriptPath, resetModulesDirCache } from "../lib/paths.js";
import { detectPlatform, detectWslVersion } from "../lib/platform.js";
import { runModule } from "../lib/runner.js";
import { isWritableDir, resolveInstallTarget, resolveModulesTarget } from "../lib/self-update.js";
import { D_COMMENT, D_CYAN, D_FG, D_GREEN, D_ORANGE, D_PINK, D_PURPLE, D_RED } from "../lib/theme.js";
import type { Status } from "../lib/types.js";

type Phase = "self-update" | "tools" | "reapply" | "done";

interface SelfUpdateResult {
  status: "up-to-date" | "updated" | "skipped" | "error";
  detail: string;
  /** Where the new binary was installed — the re-exec target after an update. */
  installPath?: string;
}

function UpgradeHeader({
  username,
  host,
  platform,
  brand,
}: {
  username: string;
  host: string;
  platform: string;
  brand: string;
}) {
  const suffix = platform === "wsl" ? " (WSL)" : platform === "macos" ? " (macOS)" : "";

  return (
    <Box flexDirection="column">
      <Logo brand={brand} />
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

/**
 * Refresh the on-disk modules tree to match the just-installed binary.
 *
 * The v2 shell modules ship as a separate `modules.tar.gz`, so a self-update
 * that only swaps the binary leaves the modules stale and Phase 3 re-applies
 * OLD configs. This downloads + checksum-verifies the release's modules tarball
 * and atomically swaps it into the resolved target dir. Best-effort: a failure
 * is reported (so the user knows configs may be stale) but does not abort the
 * upgrade — the binary is already updated.
 */
async function refreshModules(latest: string, platform: NodeJS.Platform): Promise<{ ok: boolean; detail: string }> {
  const base = `https://github.com/ettoreaquino/devlair/releases/download/v${latest}`;

  const [tarResp, sumResp] = await Promise.all([
    fetch(`${base}/modules.tar.gz`, { signal: AbortSignal.timeout(60_000), redirect: "follow" }),
    fetch(`${base}/checksums.txt`, { signal: AbortSignal.timeout(30_000), redirect: "follow" }),
  ]);
  if (!tarResp.ok) return { ok: false, detail: `modules download failed (HTTP ${tarResp.status})` };
  if (!sumResp.ok) return { ok: false, detail: `checksums download failed (HTTP ${sumResp.status})` };

  const tarBuf = Buffer.from(await tarResp.arrayBuffer());
  const checksums = await sumResp.text();

  // Verify SHA-256 before extracting — never run scripts from an unverified
  // archive (same guarantee install.sh's verify_checksum provides).
  const expected = checksums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] === "modules.tar.gz")?.[0];
  if (!expected) return { ok: false, detail: "modules checksum entry missing" };
  const actual = createHash("sha256").update(tarBuf).digest("hex");
  if (actual !== expected) return { ok: false, detail: "modules checksum mismatch — refusing to install" };

  const target = resolveModulesTarget({ platform, home: homedir() });
  const work = mkdtempSync(join(tmpdir(), "devlair-mods-"));
  try {
    const tarPath = join(work, "modules.tar.gz");
    const stage = join(work, "stage");
    writeFileSync(tarPath, tarBuf);
    mkdirSync(stage, { recursive: true });

    // --no-same-owner/-permissions: ignore uid/gid/mode from the archive so a
    // tampered tarball can't plant setuid bits; chmod below pins a safe mode.
    const tarOpts = ["--no-same-owner"];
    if (platform === "linux") tarOpts.push("--no-same-permissions");
    const extract = spawnSync("tar", ["-xzf", tarPath, "-C", stage, ...tarOpts]);
    if (extract.status !== 0) return { ok: false, detail: "modules extraction failed" };

    const staged = join(stage, "modules");
    if (!existsSync(join(staged, "_lib.sh"))) return { ok: false, detail: "modules archive malformed" };
    spawnSync("chmod", ["-R", "u=rwX,go=rX", staged]);

    const finalDir = join(target.dir, "modules");
    const backup = `${finalDir}.old`;
    const installDirect = (): boolean => {
      try {
        mkdirSync(target.dir, { recursive: true });
        rmSync(backup, { recursive: true, force: true });
        if (existsSync(finalDir)) renameSync(finalDir, backup);
        // tmp → target is likely cross-device (EXDEV on rename), so copy the tree.
        cpSync(staged, finalDir, { recursive: true });
        chmodSync(finalDir, 0o755);
        rmSync(backup, { recursive: true, force: true });
        return true;
      } catch {
        // Restore the previous tree if the swap failed partway.
        if (!existsSync(finalDir) && existsSync(backup)) {
          try {
            renameSync(backup, finalDir);
          } catch {
            /* leave the backup for manual recovery */
          }
        }
        return false;
      }
    };

    if (installDirect()) {
      resetModulesDirCache();
      return { ok: true, detail: target.allowSudo ? "modules refreshed" : "modules refreshed (~/.devlair/modules)" };
    }

    // Root-owned in-place refresh with no direct write permission (rare: an
    // unelevated Linux upgrade). Try a cached-credential sudo swap.
    if (target.allowSudo) {
      spawnSync("sudo", ["-n", "rm", "-rf", backup]);
      const moved = existsSync(finalDir) ? spawnSync("sudo", ["-n", "mv", finalDir, backup]).status === 0 : true;
      const copied = moved && spawnSync("sudo", ["-n", "cp", "-R", staged, finalDir]).status === 0;
      const chmod = copied && spawnSync("sudo", ["-n", "chmod", "755", finalDir]).status === 0;
      if (chmod) {
        spawnSync("sudo", ["-n", "rm", "-rf", backup]);
        resetModulesDirCache();
        return { ok: true, detail: "modules refreshed" };
      }
    }
    return { ok: false, detail: `could not write modules to ${finalDir}` };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
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
    if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error(`Invalid version format: ${latest}`);

    if (latest === currentVersion) {
      return { status: "up-to-date", detail: `devlair ${currentVersion} is already up to date.` };
    }

    // Download the new binary
    const detectedPlatform = detectPlatform();
    const os = detectedPlatform === "macos" ? "darwin" : "linux";
    const arch = process.arch === "x64" ? "x86_64" : "aarch64";
    const url = `https://github.com/ettoreaquino/devlair/releases/download/v${latest}/devlair-cli-${os}-${arch}`;

    const binResp = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "follow" });
    if (!binResp.ok) throw new Error(`Download failed: HTTP ${binResp.status}`);
    const buffer = Buffer.from(await binResp.arrayBuffer());

    // Decide where the new binary goes — prefer a user-owned location so the
    // install needs no root at all (see lib/self-update.ts).
    const target = resolveInstallTarget({
      platform: process.platform,
      execPath: process.execPath,
      home: homedir(),
      pathEnv: process.env.PATH ?? "",
      isWritableDir,
    });
    const targetDir = dirname(target.path);
    mkdirSync(targetDir, { recursive: true });

    // Stage the download inside the target directory so the final swap is an
    // atomic same-filesystem rename (a cross-device rename raises EACCES even
    // with permission — the root cause of the historical upgrade failures).
    const tmpPath = join(targetDir, `.devlair-update-${process.pid}`);
    writeFileSync(tmpPath, buffer, { mode: 0o755 });

    let installed = false;
    try {
      renameSync(tmpPath, target.path);
      chmodSync(target.path, 0o755);
      installed = true;
    } catch {
      // Direct write failed (root-owned legacy location). Try a privileged move
      // only when allowed and sudo credentials are already cached.
      if (target.allowSudo) {
        const mv = spawnSync("sudo", ["-n", "mv", tmpPath, target.path]);
        const ch = mv.status === 0 ? spawnSync("sudo", ["-n", "chmod", "755", target.path]) : null;
        installed = mv.status === 0 && ch?.status === 0;
      }
    }

    if (!installed) {
      rmSync(tmpPath, { force: true });
      return {
        status: "skipped",
        detail: `Update to v${latest} available — could not install to ${target.path}. Re-run \`devlair init\` then \`devlair upgrade\`, or reinstall.`,
      };
    }

    // Retire a shadowed legacy binary so `devlair --version` is unambiguous.
    // Best-effort: ~/.devlair/bin is ahead on PATH, so the new copy wins even if
    // the old root-owned one can't be removed without cached credentials.
    if (target.migrateFrom && target.migrateFrom !== target.path) {
      try {
        rmSync(target.migrateFrom, { force: true });
      } catch {
        spawnSync("sudo", ["-n", "rm", "-f", target.migrateFrom], { stdio: "ignore" });
      }
    }

    // Refresh the modules tree so Phase 3 re-applies configs from the NEW
    // release, not the stale on-disk copy that shipped with the old binary.
    const mods = await refreshModules(latest, process.platform);
    const modsNote = mods.ok ? `; ${mods.detail}` : `; modules NOT refreshed (${mods.detail}) — configs may be stale`;

    return {
      status: "updated",
      detail: `devlair updated to v${latest}${target.note ? ` — ${target.note}` : ""}${modsNote}`,
      installPath: target.path,
    };
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
    const brand = resolveBrand(undefined, context.userHome);
    return { platform, wslVersion, context, brand };
  });

  const { platform, context, brand } = envState;

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
        // Re-exec the freshly installed binary with --no-self so it runs the rest.
        const { execFileSync } = await import("node:child_process");
        const newBinary = result.installPath ?? process.execPath;
        try {
          execFileSync(newBinary, ["upgrade", "--no-self"], { stdio: "inherit" });
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
        progressHistory: [],
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
        let resultEmitted = false;

        try {
          const scriptPath = moduleScriptPath(spec.key);
          const iter = runModule(scriptPath, context, "run", { signal: abortController.signal });

          while (true) {
            const { value, done } = await iter.next();
            if (done) {
              if (!resultEmitted) finalStatus = value.status;
              break;
            }
            if (value.type === "progress") {
              setReapplyModules((prev) =>
                prev.map((m, j) =>
                  j === i
                    ? {
                        ...m,
                        progressMsg: value.message,
                        progressHistory: m.progressMsg ? [...m.progressHistory, m.progressMsg] : m.progressHistory,
                      }
                    : m,
                ),
              );
            } else if (value.type === "result") {
              finalStatus = value.status;
              finalDetail = value.detail;
              resultEmitted = true;
            }
          }
        } catch (err) {
          finalStatus = "fail";
          finalDetail = err instanceof Error ? err.message : String(err);
        }

        setReapplyModules((prev) =>
          prev.map((m, j) =>
            j === i ? { ...m, status: finalStatus, detail: finalDetail, progressMsg: "", progressHistory: [] } : m,
          ),
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
      <UpgradeHeader username={context.username} host={hostname()} platform={platform} brand={brand} />

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
