from pathlib import Path

from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner

LABEL = "Firewall + Fail2Ban"
FAIL2BAN_JAIL = Path("/etc/fail2ban/jail.local")

FAIL2BAN_CONF = """\
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 3
banaction = ufw

[sshd]
enabled  = true
port     = 22
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 3h
"""


def run(ctx: SetupContext) -> ModuleResult:
    # UFW
    runner.run("ufw --force reset", check=False, capture=True)
    runner.run("ufw default deny incoming", capture=True)
    runner.run("ufw default allow outgoing", capture=True)
    runner.run_shell("echo 'y' | ufw enable", quiet=True)

    # Fail2Ban
    existing = FAIL2BAN_JAIL.read_text() if FAIL2BAN_JAIL.exists() else ""
    if "[sshd]" not in existing:
        FAIL2BAN_JAIL.parent.mkdir(parents=True, exist_ok=True)
        FAIL2BAN_JAIL.write_text(FAIL2BAN_CONF)

    runner.run("systemctl enable fail2ban", capture=True)
    runner.run("systemctl restart fail2ban", capture=True)

    return ModuleResult(status="ok", detail="ufw active, fail2ban running")


def add_ufw_rule(rule: str, comment: str) -> bool:
    """Add a UFW rule if not already present. Returns True if rule was added or already exists."""
    ufw_status = runner.get_output("sudo ufw status")
    if comment in ufw_status:
        return True
    result = runner.run_shell(f"ufw {rule} comment '{comment}'", check=False, quiet=True)
    return result.returncode == 0


def check() -> list[CheckItem]:
    ufw_status = runner.get_output("sudo ufw status")
    f2b_status = runner.get_output("systemctl is-active fail2ban")
    ufw_active = "status: active" in ufw_status.lower()

    items = [
        CheckItem(
            label="ufw",
            status="ok" if ufw_active else "fail",
            detail="active" if ufw_active else "inactive",
        ),
        CheckItem(
            label="fail2ban",
            status="ok" if f2b_status == "active" else "fail",
            detail=f2b_status,
        ),
    ]

    # Check Evolution API UFW rule (only if claw is configured)
    claw_compose = Path.home() / ".devlair" / "claw" / "docker-compose.yml"
    if claw_compose.exists():
        evo_rule = "8080" in ufw_status and "100.64.0.0/10" in ufw_status
        items.append(CheckItem(
            label="evolution-api ufw rule",
            status="ok" if evo_rule else "warn",
            detail="present" if evo_rule else "missing — run devlair init --only claw",
        ))

    return items
