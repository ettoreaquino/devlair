from devlair.context import CheckItem, ModuleResult, SetupContext
from devlair import runner

LABEL = "Firewall + Fail2Ban"

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
    jail = runner.run("cat /etc/fail2ban/jail.local", capture=True, check=False)
    if "[sshd]" not in (jail.stdout or ""):
        with open("/etc/fail2ban/jail.local", "w") as f:
            f.write(FAIL2BAN_CONF)

    runner.run("systemctl enable fail2ban")
    runner.run("systemctl restart fail2ban")

    return ModuleResult(status="ok", detail="ufw active, fail2ban running")


def check() -> list[CheckItem]:
    ufw_status = runner.get_output("ufw status")
    f2b_status = runner.get_output("systemctl is-active fail2ban")
    return [
        CheckItem(
            label="ufw",
            status="ok" if "active" in ufw_status.lower() else "fail",
            detail="active" if "active" in ufw_status.lower() else "inactive",
        ),
        CheckItem(
            label="fail2ban",
            status="ok" if f2b_status == "active" else "fail",
            detail=f2b_status,
        ),
    ]
