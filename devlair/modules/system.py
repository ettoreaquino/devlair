from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner

LABEL = "System update"

ESSENTIALS = [
    "openssh-server", "ufw", "fail2ban",
    "curl", "wget", "git", "vim", "htop", "tmux", "unzip",
    "net-tools", "avahi-daemon", "build-essential",
    "ca-certificates", "gnupg", "jq", "tree", "rsync",
    "zsh", "bat", "fzf",
]


def run(ctx: SetupContext) -> ModuleResult:
    runner.run("apt-get update -qq", capture=True)
    runner.run("apt-get upgrade -y -qq", capture=True)
    runner.apt_install(*ESSENTIALS, quiet=True)
    return ModuleResult(status="ok", detail="packages up to date")


def check() -> list[CheckItem]:
    items = []
    for pkg in ["git", "curl", "tmux", "zsh", "ufw", "fail2ban"]:
        ok = runner.cmd_exists(pkg)
        items.append(CheckItem(
            label=pkg,
            status="ok" if ok else "fail",
            detail="installed" if ok else "missing",
        ))
    return items
