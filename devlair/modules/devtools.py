import shutil
from pathlib import Path

from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner
from devlair.console import console

LABEL = "Dev tools"

TOOLS = ["uv", "pyenv", "nvm", "fzf", "docker", "gh", "aws", "rclone"]


def run(ctx: SetupContext) -> ModuleResult:
    installed: list[str] = []
    skipped: list[str] = []
    next_steps: list[str] = []

    # ── uv ────────────────────────────────────────────────────────────────────
    if runner.cmd_exists("uv"):
        skipped.append("uv")
    else:
        console.print("    [muted]uv...[/muted]")
        runner.run_shell_as(ctx.username, "INSTALLER_NO_MODIFY_PATH=1 curl -LsSf https://astral.sh/uv/install.sh | sh", quiet=True)
        installed.append("uv")

    # ── pyenv ─────────────────────────────────────────────────────────────────
    pyenv_dir = ctx.user_home / ".pyenv"
    if pyenv_dir.exists():
        skipped.append("pyenv")
    else:
        console.print("    [muted]pyenv...[/muted]")
        runner.apt_install(
            "libssl-dev", "libbz2-dev", "libreadline-dev", "libsqlite3-dev",
            "libncursesw5-dev", "xz-utils", "tk-dev", "libxml2-dev",
            "libxmlsec1-dev", "libffi-dev", "liblzma-dev",
            quiet=True,
        )
        runner.run_shell_as(
            ctx.username,
            "curl -fsSL https://pyenv.run | bash",
            quiet=True,
        )
        runner.run_shell_as(
            ctx.username,
            f'export PYENV_ROOT="{pyenv_dir}" && export PATH="$PYENV_ROOT/bin:$PATH" '
            f'&& eval "$(pyenv init -)" && pyenv install -s 3 && pyenv global "$(pyenv latest 3)"',
            quiet=True,
        )
        installed.append("pyenv")

    # ── nvm / Node ────────────────────────────────────────────────────────────
    nvm_dir = ctx.user_home / ".nvm"
    if nvm_dir.exists():
        skipped.append("nvm")
    else:
        console.print("    [muted]nvm + Node LTS...[/muted]")
        runner.run_shell_as(
            ctx.username,
            "export PROFILE=/dev/null && curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/HEAD/install.sh | bash",
            quiet=True,
        )
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
        installed.append("fzf")

    # ── Docker ────────────────────────────────────────────────────────────────
    if runner.cmd_exists("docker"):
        skipped.append("docker")
    else:
        console.print("    [muted]docker...[/muted]")
        runner.run_shell("""
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
        """, quiet=True)
        installed.append("docker")

    # Ensure user is in docker group
    groups = runner.get_output(f"id -nG {ctx.username}")
    if "docker" not in groups.split():
        runner.run(["usermod", "-aG", "docker", ctx.username])

    # ── GitHub CLI ────────────────────────────────────────────────────────────
    if runner.cmd_exists("gh"):
        skipped.append("gh")
    else:
        console.print("    [muted]gh...[/muted]")
        runner.run_shell("""
            curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
                | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
            chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
                https://cli.github.com/packages stable main" \
                | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
            apt-get update -qq
            apt-get install -y -qq gh
        """, quiet=True)
        installed.append("gh")

    # ── AWS CLI v2 ────────────────────────────────────────────────────────────
    if runner.cmd_exists("aws"):
        skipped.append("aws")
    else:
        console.print("    [muted]aws cli...[/muted]")
        arch = runner.get_output("dpkg --print-architecture")
        aws_arch = "x86_64" if arch == "amd64" else "aarch64"
        runner.run_shell(f"""
            curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-{aws_arch}.zip" -o /tmp/awscliv2.zip
            unzip -qo /tmp/awscliv2.zip -d /tmp
            /tmp/aws/install
            rm -rf /tmp/awscliv2.zip /tmp/aws
        """, quiet=True)
        installed.append("aws")

    # ── rclone ────────────────────────────────────────────────────────────────
    if runner.cmd_exists("rclone"):
        skipped.append("rclone")
    else:
        console.print("    [muted]rclone...[/muted]")
        runner.run_shell("""
            curl -fsSL https://rclone.org/install.sh | bash
        """, quiet=True)
        installed.append("rclone")

    parts = []
    if installed: parts.append(f"installed: {', '.join(installed)}")
    if skipped:   parts.append(f"skipped: {', '.join(skipped)}")
    return ModuleResult(status="ok", detail=" | ".join(parts))


def check() -> list[CheckItem]:
    return [
        CheckItem(
            label=t,
            status="ok" if runner.cmd_exists(t) else "fail",
            detail="installed" if runner.cmd_exists(t) else "missing",
        )
        for t in ["docker", "gh", "aws", "fzf", "rclone"]
    ] + [
        CheckItem(
            label="pyenv",
            status="ok" if Path("~/.pyenv").expanduser().exists() else "warn",
        ),
        CheckItem(
            label="nvm",
            status="ok" if Path("~/.nvm").expanduser().exists() else "warn",
        ),
    ]
