# devlair

A CLI tool for provisioning and managing development machines. Currently Python (Typer + Rich), evolving to TypeScript + Ink in v2.

## Dev commands

```bash
uv sync --group dev          # install dependencies
uv run pytest tests/unit/    # run tests
python -m devlair.cli --help # test CLI locally
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

Module groups: **core** (system, timezone, zsh, shell), **coding** (devtools, github, tmux), **network** (ssh, firewall, tailscale), **cloud-sync** (rclone), **ai** (claude, claw), **desktop** (gnome_terminal).

## Conventions

- **Colors:** Dracula palette via `devlair/console.py`. Purple = primary, Pink = accent, Cyan = info, Green = success, Orange = warning, Red = error, Comment gray = muted.
- **Output:** Use `console.print()` with Rich markup. Use `_print_header(command, subtitle)` for command headers.
- **Commits:** Conventional Commits — `feat(scope):`, `fix(scope):`, `docs:`, `refactor:`.
- **Branches:** GitHub Flow — `feat/name`, `fix/name` branches, PR to main, squash merge.

## Release process

1. Branch from main: `git checkout -b feat/my-feature`
2. Open PR, get lint CI green
3. Squash merge to main
4. Tag: `git tag v1.x.x && git push origin v1.x.x`
5. CI builds binaries for x86_64 + aarch64, creates GitHub Release
6. Pre-release tags: `v2.0.0-alpha.1` (marked as pre-release, not served by install.sh)

## Evolution context

- **v1.x** = current Python CLI (Typer + Rich). Stable, ships as PyInstaller binary.
- **v2.x** = TypeScript + Ink rewrite. Interactive wizard, setup.yaml profiles, module groups, enterprise onboarding. Pre-release tags during development.
