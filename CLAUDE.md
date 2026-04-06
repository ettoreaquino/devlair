# devlair

A CLI tool for provisioning and managing development machines. Currently Python (Typer + Rich), evolving to TypeScript + Ink in v2.

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
  runner.py        # subprocess helpers (run, run_as, apt_install, cmd_exists)
  modules/         # 14 init modules — each has LABEL, run(ctx), check()
  features/        # doctor, upgrade, disable-password, filesystem, claude, sync, claw
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
| network | tailscale, ssh*, firewall* | ssh → tailscale, firewall → ssh |
| coding | tmux, devtools, github | — |
| cloud-sync | rclone | — |
| ai | claude, claw | claude → devtools, claw → devtools |
| desktop | gnome_terminal* | — |

\* = Linux-only (auto-skipped on WSL). Use `devlair init --group core,network` to run only specific groups. Dependencies are auto-expanded.

## Platform support

Platform detection is in `devlair/context.py` (`detect_platform()`, `detect_wsl_version()`). Each `ModuleSpec` has a `platforms` field (default `{"linux", "wsl"}`). Modules with `platforms={"linux"}` are auto-skipped on WSL:

- **timezone** — `timedatectl` unavailable in WSL
- **ssh** — `systemctl restart ssh` unavailable in WSL
- **firewall** — `ufw` + `fail2ban` unavailable in WSL
- **gnome_terminal** — GNOME desktop not present in WSL

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

1. Branch from main: `git checkout -b feat/my-feature`
2. Open PR with `Closes #N` in the body to link the issue
3. Add the PR to the **devlair roadmap** project board and set status to **In Progress**
4. Get CI green (lint, test, commit-messages)
5. Squash merge to main — branch auto-deletes, linked issue auto-closes
6. Tag: `git tag v1.x.x && git push origin v1.x.x`
7. CI builds binaries for x86_64 + aarch64, creates GitHub Release
8. Pre-release tags: `v2.0.0-alpha.1` (marked as pre-release, not served by install.sh)

**Important:** Every PR must reference the issue it addresses using `Closes #N` in the PR body. This ensures GitHub automatically closes the issue on merge and maintains traceability between issues, PRs, and the project board.

## Project board

All work is tracked on the **devlair roadmap** project (GitHub Projects #2). The board has three columns: **Todo**, **In Progress**, **Done**.

Workflow:
1. **When starting work on an issue/epic:** set the issue to **In Progress** on the project board
2. **When opening a PR:** add the PR to the project board as **In Progress** — use `gh project item-add 2 --owner ettoreaquino --url <PR_URL>` then set the status field
3. **When the PR merges:** the `Closes #N` keyword auto-closes the issue; set both the issue and merged PR to **Done** on the board
4. **Epics** stay **In Progress** until all child tasks/PRs are merged, then move to **Done**

CLI commands for project board management:
```bash
# Add an item (issue or PR) to the project
gh project item-add 2 --owner ettoreaquino --url <URL>

# Update status (get item ID from item-list, field/option IDs from field-list)
gh project item-edit --project-id PVT_kwHOAI_A384BTyaU \
  --id <ITEM_ID> \
  --field-id PVTSSF_lAHOAI_A384BTyaUzhA-6Fg \
  --single-select-option-id <STATUS_OPTION_ID>

# Status option IDs:
#   Todo:        f75ad846
#   In Progress: 47fc9ee4
#   Done:        98236657
```

## Evolution context

- **v1.x** = current Python CLI (Typer + Rich). Stable, ships as PyInstaller binary.
- **v2.x** = TypeScript + Ink rewrite. Interactive wizard, setup.yaml profiles, module groups, enterprise onboarding. Pre-release tags during development.
