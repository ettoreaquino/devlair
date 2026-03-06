import shlex
import shutil
import subprocess
from pathlib import Path


def run(
    cmd: str | list,
    *,
    capture: bool = False,
    check: bool = True,
    env: dict | None = None,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess:
    if isinstance(cmd, str):
        cmd = shlex.split(cmd)
    return subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        check=check,
        env=env,
        cwd=cwd,
    )


def run_as(
    user: str,
    cmd: str | list,
    *,
    capture: bool = False,
    check: bool = True,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess:
    if isinstance(cmd, str):
        cmd = shlex.split(cmd)
    return run(["sudo", "-u", user] + cmd, capture=capture, check=check, cwd=cwd)


def run_shell(script: str, *, check: bool = True) -> subprocess.CompletedProcess:
    """Run a multi-line shell script via bash -c."""
    return subprocess.run(["bash", "-c", script], text=True, check=check)


def run_shell_as(user: str, script: str, *, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["sudo", "-u", user, "bash", "-c", script],
        text=True,
        check=check,
    )


def cmd_exists(name: str) -> bool:
    return shutil.which(name) is not None


def apt_install(*packages: str) -> None:
    run(["apt-get", "install", "-y", "-qq"] + list(packages))


def get_output(cmd: str | list) -> str:
    result = run(cmd, capture=True, check=False)
    return result.stdout.strip()
