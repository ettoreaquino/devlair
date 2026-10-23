# devlair

A CLI tool for provisioning and managing development machines on Linux, WSL and macOS. The CLI is Bun + TypeScript + Ink (`cli/src`), shipped as a compiled single-file binary. Setup logic lives in bash modules (`cli/modules/*.sh`) that the CLI runs and streams JSON events from.

## Hard rules

- **Never approve PRs.** Claude may review and post comments (`event=COMMENT`) but must never submit approvals (`event=APPROVE`) or merge PRs. Only the human maintainer approves and merges.
- **Never force-push to main.**

## Dev commands

```bash
cd cli
bun install                         # install dependencies
bun test                            # run tests
bun run lint                        # biome check src/
bun run format:fix                  # auto-format
bun run typecheck                   # tsc --noEmit
bun run dev -- --help               # run the CLI locally
bun run compile                     # build the single-file binary
pre-commit install --hook-type commit-msg  # one-time setup (from repo root)
```

## Architecture

```
cli/
  src/
    index.tsx      # entrypoint, argument dispatch
    commands/      # init, doctor, upgrade, uninstall, claude, disable-password
    components/    # Ink UI: Logo, Help, Progress, Summary
    wizard/        # interactive init: GroupSelect, ModuleSelect, GithubConfig, Confirmation
    lib/           # modules (MODULE_SPECS), runner, profiles, selection, platform, theme, logs, self-update
    test/          # bun test suites
  modules/
    _lib.sh        # shared helpers sourced by every module
    <name>.sh      # one script per module, plus upgrade.sh
    configs/       # files modules install (zshrc header, tmux.conf, sshd template, fail2ban jail, ...)
assets/
  logo.svg         # brand mark (dark background)
  logo-light.svg   # brand mark (light background)
install.sh         # curl installer with checksum verification
```

## Module pattern

Every module is a bash script in `cli/modules/` that sources `_lib.sh`, reads a JSON context from stdin and dispatches on a mode argument (`run`, `check`, `uninstall`):

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"
read_context
PLATFORM=$(ctx_get platform)
MODE=${1:-run}

do_run()       { json_progress "doing x" 50; json_result "ok" "what happened"; }  # idempotent
do_check()     { json_check "what" "ok" "detail"; }                              # used by doctor
do_uninstall() { json_result "skip" "nothing to undo"; exit 2; }                 # exit 2 = skip

case "$MODE" in
  run) do_run ;; check) do_check ;; uninstall) do_uninstall ;;
  *) json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
```

Protocol: stdout carries JSON Lines events only (`json_progress`, `json_result`, `json_check`, `json_install`, `json_auth_url`); everything else goes to stderr, which the runner tees to a per-run log under `~/.devlair/logs/`. Per-module config comes from `ctx_get_config <key>`. Use the `_lib.sh` helpers (`cmd_exists`, `apt_install`, `brew_install`, `run_as`, `run_shell_as`, `download_script`, `update_json`, `cfg_bool`, `rm_user_path`, ...) instead of re-implementing them.

Module groups and dependencies are defined in `cli/src/lib/modules.ts` via `MODULE_SPECS` (listed in dependency order; `validateDag()` enforces it):

| Group | Modules | Key dependencies |
|-------|---------|-----------------|
| core | homebrew§, system, timezone*, zsh, shell | system/zsh → homebrew, shell → zsh |
| network | tailscale†, ssh*, firewall* | ssh → tailscale, firewall → ssh |
| coding | tmux, devtools, github | tmux/devtools → homebrew |
| ai | claude‡, chrome‡ | claude → devtools |
| desktop | gnome_terminal*, macos_terminal§ | — |

\* = Linux-only. § = macOS-only. † = default on Linux only (opt-in on WSL). ‡ = always opt-in (not run by default). Use `devlair init --group core,network` to run only specific groups. Dependencies are auto-expanded. Explicit `--only` or `--group` overrides opt-in defaults.

## Platform support

Platform detection is in `cli/src/lib/platform.ts` (`detectPlatform()`, `detectWslVersion()`). Each `ModuleSpec` has a `platforms` set (default `linux`, `wsl`) and an optional `defaultOn` set. Incompatible modules are skipped automatically:

- **timezone** — `timedatectl` unavailable in WSL
- **ssh** — `systemctl restart ssh` unavailable in WSL
- **firewall** — `ufw` + `fail2ban` unavailable in WSL
- **gnome_terminal** — GNOME desktop not present in WSL or macOS
- **homebrew**, **macos_terminal** — macOS only

Docker on WSL and macOS: devtools does not install Docker; install Docker Desktop separately (with WSL integration enabled on Windows).

`resolveOrder(keys, platform)` filters incompatible modules. The `init`, `upgrade`, `doctor` and `uninstall` commands detect the platform automatically. Changes to `cli/modules/*.sh` must not regress the macOS path; check both root and non-root branches.

## Setup profiles

`devlair init --config path/to/setup.yaml` loads a YAML profile to control module selection and per-module configuration. Profile parsing and validation (zod) is in `cli/src/lib/profiles.ts`; selection merging is in `cli/src/lib/selection.ts`.

Schema (version 1):
- `version: 1` — required
- `name: string` — optional, shown in init header
- `groups: [list]` — groups to include (core, network, coding, ai, desktop)
- `modules: [list]` — explicit module keys (overrides groups when set)
- `skip: [list]` — modules to exclude
- `config: {mapping}` — per-module config, keyed by module name

Precedence: CLI flags (`--only`, `--group`, `--skip`) override profile selection. `--skip` is always additive with profile `skip`.

## Security hardening

Tool installs follow a download-then-execute pattern instead of piping curl to shell. This prevents partial script execution on network failure and allows inspection.

- **install.sh** — SHA-256 checksum verification of the devlair binary against `checksums.txt` published with each release
- **AWS CLI v2** — GPG signature verification using AWS's published public key (devtools)
- **Docker, gh, Chrome** — installed via apt with GPG-signed keyrings
- **fzf** — installed via git clone (git provides integrity)
- **uv, pyenv, nvm, Claude Code** — `download_script` to a temp file, then execute (no pipe)

Per-run logs are written to `~/.devlair/logs/<command>-<timestamp>/` (directory 0700, files 0600, last 10 runs kept), owned by the invoking user under sudo.

## Conventions

- **Colors:** Dracula palette via `cli/src/lib/theme.ts` (`D_PURPLE`, `D_PINK`, ...). Purple = primary, Pink = accent, Cyan = info, Green = success, Orange = warning, Red = error, Comment gray = muted.
- **Output:** Ink components in `cli/src/components/`; modules never print to stdout except JSON events.
- **Lint/format:** Biome (`cli/biome.json`) — 2-space indent, double quotes, 120-column lines.
- **Commits:** Conventional Commits — `feat(scope):`, `fix(scope):`, `docs:`, `refactor:`. Enforced by commit-msg hook.
- **Branches:** GitHub Flow — `feat/name`, `fix/name` branches, PR to main, squash merge. Branches auto-delete on merge. Never push to a branch after its PR merges, because the push recreates it on origin. The weekly `stale-branches.yml` workflow deletes merged or closed branches whose tip still matches the PR head, and lists the rest for manual review.

## Quality gates

Every commit and PR must pass these gates:

| Gate | Local | CI (PR) | Blocks |
|------|-------|---------|--------|
| Biome lint (`bun run lint`) | manual | ✓ | merge |
| Typecheck (`bun run typecheck`) | manual | ✓ | merge |
| Unit tests (`bun test`) | manual | ✓ | merge |
| Conventional Commits | ✓ (commit-msg hook) | ✓ | commit + merge |

Setup: `pre-commit install --hook-type commit-msg`

## Dependency updates

Renovate (Mend-hosted GitHub App, config in `renovate.json`) keeps `cli/package.json`, GitHub Actions digests and the `bun-version` pins in workflows current, and opens `[SECURITY]` PRs for OSV-listed vulnerabilities in Bun dependencies (Dependabot cannot do this for `bun.lock`).

- Minor, patch, pin and digest updates are set to automerge, but branch protection still requires one human approval, so the maintainer approves and Renovate merges once checks are green.
- Major updates do not open PRs until approved in the Dependency Dashboard issue.
- Commit prefixes: `fix(deps)` for runtime deps (triggers a patch release), `chore(deps)` for dev deps, `chore(ci)` for actions.
- Do not hand-edit Renovate branches except to fix a broken update; Renovate stops updating a branch it detects was modified.

## Release process

Releases are automated via [release-please](https://github.com/googleapis/release-please). **Never tag manually.**

1. Branch from main: `git checkout -b feat/my-feature`
2. Open PR with `Closes #N` in the body to link the issue
3. Add the PR to the **devlair roadmap** project board and set status to **In Progress**
4. Get CI green (lint, test, commit-messages)
5. **Human reviews and approves the PR** — Claude must never approve or merge PRs
6. Squash merge to main — branch auto-deletes, linked issue auto-closes
7. Release-please auto-creates/updates a "Release PR" with version bump + CHANGELOG
8. When ready to ship: merge the Release PR → auto-tags, creates GitHub Release, CI builds binaries

Version bumps are determined from Conventional Commits: `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE` → major.

**Important:** Every PR must reference the issue it addresses using `Closes #N` in the PR body. This ensures GitHub automatically closes the issue on merge and maintains traceability between issues, PRs, and the project board.

## PR review automation

Every PR runs through a fan-out review pipeline that ends with a single structured comment. A `PostToolUse` hook in `.claude/settings.json` fires after `gh pr create` and tells the main session to invoke the `/review-pr` slash command (defined in `.claude/commands/review-pr.md`). The command is a thin orchestrator that spawns four code reviewers in parallel, then runs two post-review agents sequentially. You can also invoke it manually: `/review-pr 78`.

**Code reviewers** — fan out in a single tool-use block so they run in parallel; each gets its own context window, focused tool allowlist, and per-reviewer model:

- `pr-reuse-reviewer` (sonnet) — flags new code that duplicates existing utilities or helpers
- `pr-quality-reviewer` (sonnet) — redundant state, copy-paste, leaky abstractions, useless comments
- `pr-efficiency-reviewer` (haiku) — redundant work, missed concurrency, hot-path bloat, memory leaks
- `pr-security-reviewer` (sonnet) — injection, secrets, privilege, supply-chain, network, container, data

**Post-review agents** — strictly sequential (the README sync must see the post-fix tree):

- `pr-fix-applier` (sonnet) — applies the unambiguous findings, runs gates, commits, pushes. Reports `applied`/`declined`/`failed` for the final comment.
- `pr-readme-updater` (sonnet) — syncs `README.md` against the post-fix working tree. Edits directly, commits as a separate `docs(readme):` commit, pushes. No code gates (README is markdown).

Each subagent returns a compact JSON object, keeping the main context small.

**Pipeline steps** (in `/review-pr`):

1. Gather PR context (`gh pr view`, `gh pr diff`).
2. Fan out the four code reviewers in parallel.
3. Run test-plan verification inline in the working tree (`bun test`, `bun run lint`, `bun run typecheck`); update PR body checkboxes.
4. Invoke `pr-fix-applier` with the reviewer JSON. It edits, gates, commits, and pushes. If a gate fails, it reverts that edit and surfaces the failure.
5. Invoke `pr-readme-updater` with the post-fix branch diff. It edits `README.md` only within its declared scope (command, install and behavior sections for PRs touching `cli/src/` or `cli/modules/`) and commits separately.
6. Post one PR comment: Code Review + Auto-applied fixes (crediting each reviewer) + README sync + Test plan verification.

**Manual invocation:** Run `/review-pr` (auto-detects current branch's PR) or `/review-pr #66` for a specific PR.

**Hard rules:** never `gh pr review --approve`, only `gh pr comment`; never force-push to main. `pr-fix-applier` and `pr-readme-updater` inherit both rules and additionally must never widen the diff into files the PR did not touch.

**Files:**
- `/review-pr` — orchestrator slash command (`.claude/commands/review-pr.md`)
- Reviewers — `.claude/agents/pr-{reuse,quality,efficiency,security}-reviewer.md`
- Post-review agents — `.claude/agents/pr-fix-applier.md`, `.claude/agents/pr-readme-updater.md`
- `/pr` — PR creation with issue linking and board management (`.claude/commands/pr.md`)
- `/board` — project board visibility (`.claude/skills/board.md`)
- `/board-reconcile` — audit + repair board drift; idempotent (`.claude/commands/board-reconcile.md`)

## Project board

All work is tracked on the **devlair roadmap** project (GitHub Projects #2). The board has three columns: **Todo**, **In Progress**, **Done**.

Workflow:
1. **When starting work on an issue/epic:** `/pr` sets the issue to **In Progress** automatically (both for newly created and pre-existing issues).
2. **When opening a PR:** `/pr` adds the PR to the board as **In Progress** and sets its `Type` field from the conventional-commit prefix.
3. **When the PR merges:** GitHub Projects automation moves both the PR and the auto-closed issue to **Done**. **Do not edit Status manually** except via `/board-reconcile --fix`.
4. **Epics** stay **In Progress** until all child tasks/PRs are merged, then move to **Done** (manual — epics have no closing PR).

### Automation source-of-truth

The following Projects v2 built-in workflows are enabled in the project's **Settings → Workflows**:

| Workflow | Effect |
|---|---|
| Auto-add to project (filter: `repo:ettoreaquino/devlair is:issue,pr -title:"chore(main): release"`) | New issues/PRs land on the board automatically; release-please bot PRs are excluded so they don't inflate Deployment Frequency |
| Item closed → Status: Done | Covers `Closes #N` auto-closes |
| Item reopened → Status: In Progress | Reverses the above |
| Pull request merged → Status: Done | Direct merge transition |

If a workflow is disabled or a bypass occurs (manual `gh issue create`, web-UI creation outside the filter, etc.), `/board-reconcile` catches it.

### Reconciliation

- `/board-reconcile` (alias `/board-reconcile --dry-run`) — audit only, prints a drift table.
- `/board-reconcile --fix` — apply repairs. Every repair is set-to-desired-state, so re-running immediately after a successful pass reports zero drift.
- `/pr` runs `/board-reconcile --dry-run --scope=this-pr` at end of flow as a per-PR sanity check.
- Run `/board-reconcile --fix` weekly (use `/loop 7d /board-reconcile --fix` or `/schedule`).

### DORA metrics

Mapping each metric to a board/API query (all measurable today; field IDs documented below):

| Metric | Query |
|---|---|
| **Deployment Frequency** | Merged PRs per window where `Type ≠ chore` (release-please excluded by board filter; explicit `Type` filter excludes the rare chore PR that did get added). |
| **Lead Time for Changes** | `mergedAt(PR) − createdAt(linked issue)` per merged non-chore PR. Average / median over the window. |
| **Change Failure Rate** | `count(Incident=Yes issues closed in window) / count(non-chore merged PRs in window)`. Set `Incident=Yes` manually when a bug is a regression from a prior deploy. |
| **MTTR** | `closedAt(Incident=Yes issue) − mergedAt(introducing PR)` per incident. |

### CLI commands for board management

Use `/pr` and `/board-reconcile` for routine work. Raw `gh` is only needed for one-off ops:

```bash
# Add an item (idempotent — no-op if already present)
gh project item-add 2 --owner ettoreaquino --url <URL>

# Update a field (always pass --limit 500 when looking up the item ID)
ITEM_ID=$(gh project item-list 2 --owner ettoreaquino --limit 500 --format json \
  --jq '.items[] | select(.content.number == <N>) | .id')
gh project item-edit --project-id PVT_kwHOAI_A384BTyaU \
  --id "$ITEM_ID" \
  --field-id <FIELD_ID> \
  --single-select-option-id <OPTION_ID>
```

### Field reference

```
Project ID:     PVT_kwHOAI_A384BTyaU

Status field:   PVTSSF_lAHOAI_A384BTyaUzhA-6Fg
  Todo:         f75ad846
  In Progress:  47fc9ee4
  Done:         98236657

Type field:     PVTSSF_lAHOAI_A384BTyaUzhTNn1g       (DORA: slice Deployment Frequency)
  feat:         fb49f55e
  fix:          8a8822f4
  chore:        e4a0286c
  docs:         229100de
  refactor:     428d2abe

Incident field: PVTSSF_lAHOAI_A384BTyaUzhTNn2A       (DORA: Change Failure Rate, MTTR)
  No:           2c582288
  Yes:          12d9b2e2
```

## Evolution context

- **v1.x** = original Python CLI (Typer + Rich, PyInstaller binary). Retired; its source was removed in #310. Old binaries stay downloadable from past GitHub releases.
- **v2.x** = TypeScript + Ink rewrite with Python modules ported to the new runner.
- **v3.x** (current) = Bun + TypeScript + Ink CLI driving bash modules over a JSON Lines protocol. Interactive wizard, setup.yaml profiles, module groups, Linux/WSL/macOS, enterprise onboarding.
