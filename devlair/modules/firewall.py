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
    runner.run("ufw --force reset", check=False)
    runner.run("ufw default deny incoming")
    runner.run("ufw default allow outgoing")
    runner.run_shell("echo 'y' | ufw enable")

    # Fail2Ban
    existing = FAIL2BAN_JAIL.read_text() if FAIL2BAN_JAIL.exists() else ""
    if "[sshd]" not in existing:
        FAIL2BAN_JAIL.parent.mkdir(parents=True, exist_ok=True)
        FAIL2BAN_JAIL.write_text(FAIL2BAN_CONF)

    runner.run("systemctl enable fail2ban")
    runner.run("systemctl restart fail2ban")

    return ModuleResult(status="ok", detail="ufw active, fail2ban running")


def check() -> list[CheckItem]:
    ufw_status = runner.get_output("ufw status")
    f2b_status = runner.get_output("systemctl is-active fail2ban")
    ufw_active = "status: active" in ufw_status.lower()
    return [
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
