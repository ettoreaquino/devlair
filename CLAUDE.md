# devlair

A CLI tool for provisioning and managing development machines. Currently Python (Typer + Rich), evolving to TypeScript + Ink in v2.

## Hard rules

- **Never approve PRs.** Claude may review and post comments (`event=COMMENT`) but must never submit approvals (`event=APPROVE`) or merge PRs. Only the human maintainer approves and merges.
- **Never force-push to main.**

## Dev commands

```bash
uv sync --group dev                 # install dependencies
uv run pytest tests/unit/           # run tests
uv run ruff check devlair/ tests/   # lint
uv run ruff format devlair/ tests/  # auto-format
uv run python -m devlair.cli --help # test CLI locally
pre-commit install && pre-commit install --hook-type commit-msg  # one-time setup
```

## Architecture

```
devlair/
  cli.py           # Typer CLI entrypoint, logo, grouped help screen
  console.py       # Rich console + Dracula color tokens (D_PURPLE, D_PINK, etc.)
  context.py       # SetupContext dataclass, ModuleResult, CheckItem, JSON helpers
  runner.py        # subprocess helpers (run, run_as, apt_install, cmd_exists, verify_checksum)
  modules/         # 13 init modules — each has LABEL, run(ctx), check()
  features/        # doctor, upgrade, disable-password, filesystem, claude, sync, audit
assets/
  logo.svg         # brand mark (dark background)
  logo-light.svg   # brand mark (light background)
```

## Module pattern

Every module in `devlair/modules/` follows this interface:

```python
LABEL = "Human-readable name"

def run(ctx: SetupContext) -> ModuleResult:
    # Idempotent setup logic
    return ModuleResult(status="ok", detail="what happened")

def check() -> list[CheckItem]:
    # Health checks (used by devlair doctor)
    return [CheckItem(label="what", status="ok")]
```

Module groups and dependencies are defined in `devlair/modules/__init__.py` via `MODULE_SPECS`:

| Group | Modules | Key dependencies |
|-------|---------|-----------------|
| core | system, timezone*, zsh, shell | shell → zsh |
| network | tailscale†, ssh*, firewall* | ssh → tailscale, firewall → ssh |
| coding | tmux, devtools, github | — |
| cloud-sync | rclone‡ | — |
| ai | claude‡ | claude → devtools |
| desktop | gnome_terminal* | — |

\* = Linux-only (auto-skipped on WSL). † = opt-in on WSL. ‡ = always opt-in (not run by default). Use `devlair init --group core,network` to run only specific groups. Dependencies are auto-expanded. Explicit `--only` or `--group` overrides opt-in defaults.

## Platform support

Platform detection is in `devlair/context.py` (`detect_platform()`, `detect_wsl_version()`). Each `ModuleSpec` has a `platforms` field (default `{"linux", "wsl"}`). Modules with `platforms={"linux"}` are auto-skipped on WSL:

- **timezone** — `timedatectl` unavailable in WSL
- **ssh** — `systemctl restart ssh` unavailable in WSL
- **firewall** — `ufw` + `fail2ban` unavailable in WSL
- **gnome_terminal** — GNOME desktop not present in WSL

Docker on WSL: `devlair init` requires Docker Desktop for Windows with WSL integration enabled. The devtools module skips apt-based Docker installation on WSL and init aborts early if `docker` is not on PATH.

`resolve_order()` accepts an optional `platform` parameter to filter incompatible modules. The `init`, `upgrade`, and `doctor` commands detect the platform automatically.

## Setup profiles

`devlair init --config path/to/setup.yaml` loads a YAML profile to control module selection and per-module configuration. Profile loading and validation is in `devlair/features/profile.py`.

Schema (version 1):
- `version: 1` — required
- `name: string` — optional, shown in init header
- `groups: [list]` — groups to include (core, network, coding, cloud-sync, ai, desktop)
- `modules: [list]` — explicit module keys (overrides groups when set)
- `skip: [list]` — modules to exclude
- `config: {mapping}` — per-module config, keyed by module name

Precedence: CLI flags (`--only`, `--group`, `--skip`) override profile selection. `--skip` is always additive with profile `skip`.

## Security hardening

Tool installs follow a download-then-execute pattern instead of piping curl to shell. This prevents partial script execution on network failure and allows inspection.

- **install.sh** — SHA-256 checksum verification of the devlair binary against `checksums.txt` published with each release
- **AWS CLI v2** — GPG signature verification using AWS's published public key
- **Docker, gh** — installed via apt with GPG-signed keyrings (already verified)
- **fzf** — installed via git clone (git provides integrity)
- **uv, pyenv, nvm, rclone, bun** — download script to temp file, then execute (no pipe)

Audit logging writes JSON Lines to `~/.devlair/audit.json` (0600 permissions):
- `log_tool_install()` — records tool name, source, and whether the install was cryptographically verified
- `log_module_result()` — records module name, status, and detail after each `init` module runs

## Conventions

- **Colors:** Dracula palette via `devlair/console.py`. Purple = primary, Pink = accent, Cyan = info, Green = success, Orange = warning, Red = error, Comment gray = muted.
- **Output:** Use `console.print()` with Rich markup. Use `_print_header(command, subtitle)` for command headers.
- **Lint:** ruff with `E`, `F`, `W`, `I` rules. `E501` and `E701` are intentionally ignored.
- **Commits:** Conventional Commits — `feat(scope):`, `fix(scope):`, `docs:`, `refactor:`. Enforced by commit-msg hook.
- **Branches:** GitHub Flow — `feat/name`, `fix/name` branches, PR to main, squash merge. Branches auto-delete on merge.

## Quality gates

Every commit and PR must pass these gates:

| Gate | Local (pre-commit) | CI (PR) | Blocks |
|------|--------------------|---------|--------|
| Python syntax (SyntaxWarning) | ✓ | ✓ | commit + merge |
| ruff lint | ✓ | ✓ | commit + merge |
| ruff format | ✓ | ✓ | commit + merge |
| Conventional Commits | ✓ (commit-msg hook) | ✓ | commit + merge |
| Unit tests (pytest) | manual | ✓ | merge |

Setup: `pre-commit install && pre-commit install --hook-type commit-msg`

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
3. Run test-plan verification inline in the working tree (`bun test`, `pytest`, `bun run lint`, `bun run typecheck`); update PR body checkboxes.
4. Invoke `pr-fix-applier` with the reviewer JSON. It edits, gates, commits, and pushes. If a gate fails, it reverts that edit and surfaces the failure.
5. Invoke `pr-readme-updater` with the post-fix branch diff. It edits `README.md` only within its declared scope (v2 section + relevant command-index rows for v2 PRs, the inverse for v1 PRs) and commits separately.
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

- **v1.x** = current Python CLI (Typer + Rich). Stable, ships as PyInstaller binary.
- **v2.x** = TypeScript + Ink rewrite. Interactive wizard, setup.yaml profiles, module groups, enterprise onboarding. Pre-release tags during development.
