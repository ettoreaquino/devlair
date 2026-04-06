from pathlib import Path

from devlair import runner
from devlair.console import console
from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair.features.audit import safe_log_install

LABEL = "Dev tools"

TOOLS = ["uv", "pyenv", "nvm", "fzf", "docker", "gh", "aws", "bun"]

# AWS CLI v2 public GPG key ID used to sign release bundles.
_AWS_CLI_GPG_KEY_URL = "https://awscli.amazonaws.com/awscli-exe-linux-public-key.asc"


def _bun_exists(user_home: Path) -> bool:
    return runner.cmd_exists("bun") or (user_home / ".bun" / "bin" / "bun").exists()


def run(ctx: SetupContext) -> ModuleResult:
    installed: list[str] = []
    skipped: list[str] = []
    next_steps: list[str] = []

    # ── uv ────────────────────────────────────────────────────────────────────
    if runner.cmd_exists("uv"):
        skipped.append("uv")
    else:
        console.print("    [muted]uv...[/muted]")
        script = runner.download_script("https://astral.sh/uv/install.sh")
        try:
            runner.run_shell_as(ctx.username, f'INSTALLER_NO_MODIFY_PATH=1 bash "{script}"', quiet=True)
        finally:
            script.unlink(missing_ok=True)
        safe_log_install(ctx.user_home, tool="uv", source="astral.sh")
        installed.append("uv")

    # ── pyenv ─────────────────────────────────────────────────────────────────
    pyenv_dir = ctx.user_home / ".pyenv"
    if pyenv_dir.exists():
        skipped.append("pyenv")
    else:
        console.print("    [muted]pyenv...[/muted]")
        runner.apt_install(
            "libssl-dev",
            "libbz2-dev",
            "libreadline-dev",
            "libsqlite3-dev",
            "libncursesw5-dev",
            "xz-utils",
            "tk-dev",
            "libxml2-dev",
            "libxmlsec1-dev",
            "libffi-dev",
            "liblzma-dev",
            quiet=True,
        )
        script = runner.download_script("https://pyenv.run")
        try:
            runner.run_shell_as(ctx.username, f'bash "{script}"', quiet=True)
        finally:
            script.unlink(missing_ok=True)
        runner.run_shell_as(
            ctx.username,
            f'export PYENV_ROOT="{pyenv_dir}" && export PATH="$PYENV_ROOT/bin:$PATH" '
            f'&& eval "$(pyenv init -)" && pyenv install -s 3 && pyenv global "$(pyenv latest 3)"',
            quiet=True,
        )
        safe_log_install(ctx.user_home, tool="pyenv", source="pyenv.run")
        installed.append("pyenv")

    # ── nvm / Node ────────────────────────────────────────────────────────────
    nvm_dir = ctx.user_home / ".nvm"
    if nvm_dir.exists():
        skipped.append("nvm")
    else:
        console.print("    [muted]nvm + Node LTS...[/muted]")
        script = runner.download_script("https://raw.githubusercontent.com/nvm-sh/nvm/HEAD/install.sh")
        try:
            runner.run_shell_as(ctx.username, f'export PROFILE=/dev/null && bash "{script}"', quiet=True)
        finally:
            script.unlink(missing_ok=True)
        result = runner.run_shell_as(
            ctx.username,
            f'export NVM_DIR="{nvm_dir}" && source "$NVM_DIR/nvm.sh" && nvm install --lts',
            quiet=True,
        )
        # Extract installed node version
        node_ver = ""
        if result.stdout:
            for line in result.stdout.splitlines():
                if "Now using node" in line:
                    node_ver = line.split("node ")[1].split(" ")[0] if "node " in line else ""
        if node_ver:
            next_steps.append(f"node {node_ver} installed via nvm")
        safe_log_install(ctx.user_home, tool="nvm", source="github.com/nvm-sh/nvm")
        installed.append("nvm+node")

    # ── fzf ──────────────────────────────────────────────────────────────────
    if runner.cmd_exists("fzf"):
        skipped.append("fzf")
    else:
        console.print("    [muted]fzf...[/muted]")
        fzf_dir = ctx.user_home / ".fzf"
        runner.run_shell_as(
            ctx.username,
            f'git clone --depth 1 https://github.com/junegunn/fzf.git "{fzf_dir}" '
            f'&& "{fzf_dir}/install" --all --no-update-rc',
            quiet=True,
        )
        safe_log_install(ctx.user_home, tool="fzf", source="github.com/junegunn/fzf", verified=True)
        installed.append("fzf")

    # ── Docker ────────────────────────────────────────────────────────────────
    if runner.cmd_exists("docker"):
        skipped.append("docker")
    elif ctx.platform == "wsl":
        console.print("    [warning]docker — install Docker Desktop on Windows, not inside WSL[/warning]")
        skipped.append("docker")
    else:
        console.print("    [muted]docker...[/muted]")
        runner.run_shell(
            """
            install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
                | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
                https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
                | tee /etc/apt/sources.list.d/docker.list > /dev/null
            apt-get update -qq
            apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
            systemctl enable docker
        """,
            quiet=True,
        )
        safe_log_install(ctx.user_home, tool="docker", source="apt:docker.com", verified=True)
        installed.append("docker")

    # Ensure user is in docker group
    if runner.cmd_exists("docker"):
        groups = runner.get_output(f"id -nG {ctx.username}")
        if "docker" not in groups.split():
            runner.run(["usermod", "-aG", "docker", ctx.username])

    # ── GitHub CLI ────────────────────────────────────────────────────────────
    if runner.cmd_exists("gh"):
        skipped.append("gh")
    else:
        console.print("    [muted]gh...[/muted]")
        runner.run_shell(
            """
            curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
                | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
            chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
                https://cli.github.com/packages stable main" \
                | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
            apt-get update -qq
            apt-get install -y -qq gh
        """,
            quiet=True,
        )
        safe_log_install(ctx.user_home, tool="gh", source="apt:cli.github.com", verified=True)
        installed.append("gh")

    # ── AWS CLI v2 (with GPG signature verification) ────────────────────────
    if runner.cmd_exists("aws"):
        skipped.append("aws")
    else:
        console.print("    [muted]aws cli...[/muted]")
        arch = runner.get_output("dpkg --print-architecture")
        aws_arch = "x86_64" if arch == "amd64" else "aarch64"
        aws_base = f"https://awscli.amazonaws.com/awscli-exe-linux-{aws_arch}"
        gpg_ok_marker = runner.safe_tempfile(suffix=".gpg_ok")
        gpg_ok_marker.unlink()  # remove so touch is the signal
        runner.run_shell(
            f"""
            curl -fsSL "{aws_base}.zip" -o /tmp/awscliv2.zip
            if command -v gpg >/dev/null 2>&1; then
                curl -fsSL "{aws_base}.zip.sig" -o /tmp/awscliv2.zip.sig
                curl -fsSL "{_AWS_CLI_GPG_KEY_URL}" -o /tmp/aws-cli-key.asc
                gpg --batch --import /tmp/aws-cli-key.asc 2>/dev/null || true
                if gpg --batch --verify /tmp/awscliv2.zip.sig /tmp/awscliv2.zip 2>/dev/null; then
                    echo "✓ AWS CLI GPG signature verified"
                    touch "{gpg_ok_marker}"
                else
                    echo "⚠ GPG verification failed — installing anyway" >&2
                fi
                rm -f /tmp/awscliv2.zip.sig /tmp/aws-cli-key.asc
            else
                echo "⚠ gpg not found — skipping signature verification"
            fi
            unzip -qo /tmp/awscliv2.zip -d /tmp
            /tmp/aws/install
            rm -rf /tmp/awscliv2.zip /tmp/aws
        """,
            quiet=True,
        )
        gpg_verified = gpg_ok_marker.exists()
        gpg_ok_marker.unlink(missing_ok=True)
        safe_log_install(ctx.user_home, tool="aws", source="awscli.amazonaws.com", verified=gpg_verified)
        installed.append("aws")

    # ── Bun ───────────────────────────────────────────────────────────────────
    if _bun_exists(ctx.user_home):
        skipped.append("bun")
    else:
        console.print("    [muted]bun...[/muted]")
        script = runner.download_script("https://bun.sh/install")
        try:
            runner.run_shell_as(ctx.username, f'bash "{script}"', quiet=True)
        finally:
            script.unlink(missing_ok=True)
        safe_log_install(ctx.user_home, tool="bun", source="bun.sh")
        installed.append("bun")

    parts = []
    if installed:
        parts.append(f"installed: {', '.join(installed)}")
    if skipped:
        parts.append(f"skipped: {', '.join(skipped)}")
    return ModuleResult(status="ok", detail=" | ".join(parts))


def check() -> list[CheckItem]:
    user_home = Path("~").expanduser()
    return [
        CheckItem(
            label=t,
            status="ok" if runner.cmd_exists(t) else "fail",
            detail="installed" if runner.cmd_exists(t) else "missing",
        )
        for t in ["docker", "gh", "aws", "fzf"]
    ] + [
        CheckItem(
            label="pyenv",
            status="ok" if Path("~/.pyenv").expanduser().exists() else "warn",
        ),
        CheckItem(
            label="nvm",
            status="ok" if Path("~/.nvm").expanduser().exists() else "warn",
        ),
        CheckItem(
            label="bun",
            status="ok" if _bun_exists(user_home) else "warn",
            detail="installed" if _bun_exists(user_home) else "missing — required for Claude Code channels",
        ),
    ]
