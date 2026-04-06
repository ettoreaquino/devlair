from devlair import runner
from devlair.context import CheckItem, ModuleResult, SetupContext

LABEL = "System update"

ESSENTIALS = [
    "openssh-server",
    "ufw",
    "fail2ban",
    "curl",
    "wget",
    "git",
    "vim",
    "htop",
    "tmux",
    "unzip",
    "net-tools",
    "avahi-daemon",
    "build-essential",
    "ca-certificates",
    "gnupg",
    "jq",
    "tree",
    "rsync",
    "zsh",
    "bat",
    "fzf",
    "locales",
]


def run(ctx: SetupContext) -> ModuleResult:
    runner.run("apt-get update -qq", capture=True)
    runner.run("apt-get upgrade -y -qq", capture=True)
    runner.apt_install(*ESSENTIALS, quiet=True)

    # Ensure UTF-8 locale is available (bare WSL ships with C/POSIX only)
    runner.run_shell(
        "locale-gen en_US.UTF-8 && update-locale LANG=en_US.UTF-8",
        check=False,
    )

    return ModuleResult(status="ok", detail="packages up to date")


def check() -> list[CheckItem]:
    items = []
    for label, cmd in [
        ("git", "git"),
        ("curl", "curl"),
        ("tmux", "tmux"),
        ("zsh", "zsh"),
        ("ufw", "ufw"),
        ("fail2ban", "fail2ban-client"),
    ]:
        ok = runner.cmd_exists(cmd)
        items.append(
            CheckItem(
                label=label,
                status="ok" if ok else "fail",
                detail="installed" if ok else "missing",
            )
        )
    return items
