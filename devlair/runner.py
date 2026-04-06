import hashlib
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


def run_shell(script: str, *, check: bool = True, quiet: bool = False) -> subprocess.CompletedProcess:
    """Run a multi-line shell script via bash -c."""
    return subprocess.run(
        ["bash", "-c", script],
        text=True,
        check=check,
        capture_output=quiet,
    )


def run_shell_as(user: str, script: str, *, check: bool = True, quiet: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["sudo", "-u", user, "bash", "-c", script],
        text=True,
        check=check,
        capture_output=quiet,
    )


def cmd_exists(name: str) -> bool:
    return shutil.which(name) is not None


def apt_install(*packages: str, quiet: bool = False) -> None:
    run(["apt-get", "install", "-y", "-qq"] + list(packages), capture=quiet)


def get_output(cmd: str | list) -> str:
    result = run(cmd, capture=True, check=False)
    return result.stdout.strip()


def safe_tempfile(suffix: str = "") -> Path:
    """Create a temporary file safely and return its path.

    Unlike ``tempfile.mktemp`` (which is deprecated due to race conditions),
    this atomically creates the file via ``NamedTemporaryFile`` and returns a
    ``Path`` that is guaranteed to exist.  The caller is responsible for
    deleting the file when done.
    """
    import tempfile

    f = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    f.close()
    p = Path(f.name)
    p.chmod(0o644)
    return p


class ChecksumError(Exception):
    """Raised when a SHA-256 checksum does not match."""


def sha256_file(path: Path) -> str:
    """Compute the SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_checksum(path: Path, expected: str) -> None:
    """Verify SHA-256 checksum of *path* against *expected* hex digest.

    Raises ChecksumError on mismatch.
    """
    actual = sha256_file(path)
    if actual != expected.lower().strip():
        raise ChecksumError(f"SHA-256 mismatch for {path.name}: expected {expected}, got {actual}")
