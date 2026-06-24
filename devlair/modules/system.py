from devlair import runner
from devlair.context import CheckItem, ModuleResult, SetupContext, detect_platform

LABEL = "System update"

ESSENTIALS = [
    "curl",
    "wget",
    "git",
    "vim",
    "htop",
    "tmux",
    "unzip",
    "net-tools",
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

# ssh, firewall, and service-discovery daemons require systemd — unavailable on WSL
LINUX_ESSENTIALS = ["openssh-server", "ufw", "fail2ban", "avahi-daemon"]


def run(ctx: SetupContext) -> ModuleResult:
    runner.run("apt-get update -qq", capture=True)
    runner.run("apt-get upgrade -y -qq", capture=True)
    runner.apt_install(*ESSENTIALS, quiet=True)
    if ctx.platform == "linux":
        runner.apt_install(*LINUX_ESSENTIALS, quiet=True)

    # WSL extras: wslu provides wslview for opening URLs in the Windows browser
    if ctx.platform == "wsl":
        runner.apt_install("wslu", quiet=True)

    # Ensure UTF-8 locale is available (bare WSL ships with C/POSIX only)
    runner.run_shell(
        "locale-gen en_US.UTF-8 && update-locale LANG=en_US.UTF-8",
        check=False,
    )

    return ModuleResult(status="ok", detail="packages up to date")


def check() -> list[CheckItem]:
    checks = [("git", "git"), ("curl", "curl"), ("tmux", "tmux"), ("zsh", "zsh")]
    if detect_platform() == "linux":
        checks += [("ufw", "ufw"), ("fail2ban", "fail2ban-client")]

    return [
        CheckItem(
            label=label,
            status="ok" if runner.cmd_exists(cmd) else "fail",
            detail="installed" if runner.cmd_exists(cmd) else "missing",
        )
        for label, cmd in checks
    ]
