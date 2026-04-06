import json
from pathlib import Path
from typing import Optional

from devlair import runner
from devlair.console import console
from devlair.modules.claw import CLAW_DIR_NAME, _parse_env


def _claw_dir() -> Path:
    return Path.home() / CLAW_DIR_NAME


def _compose_cmd(subcmd: str, quiet: bool = True):
    claw_dir = _claw_dir()
    return runner.run_shell(
        f'cd "{claw_dir}" && docker compose {subcmd}',
        quiet=quiet,
        check=False,
    )


# ── Status ────────────────────────────────────────────────────────────────


def _container_status(name: str) -> str:
    return runner.get_output(f"docker inspect -f '{{{{.State.Status}}}}' {name}") or "stopped"


def _print_containers(evo_status: str, pico_status: str) -> None:
    for name, status in (("picoclaw", pico_status), ("evolution", evo_status)):
        style = "success" if status == "running" else "error"
        console.print(f"  [{style}]●[/{style}]  [accent]{name}[/accent]  [{style}]{status}[/{style}]")


def show_status() -> None:
    claw_dir = _claw_dir()

    # Stage 1: Not provisioned
    if not (claw_dir / "docker-compose.yml").exists():
        console.print("  [muted]PicoCLAW is not configured yet.[/muted]")
        console.print()
        console.print("  [info]Get started:[/info]")
        console.print("    1. [accent]devlair init --only claw[/accent]   # provision the stack")
        console.print("    2. [accent]devlair claw --pair[/accent]        # connect WhatsApp")
        console.print("    3. [accent]devlair claw --allow +55…[/accent]  # authorize phone numbers")
        console.print("    4. [accent]devlair doctor[/accent]             # verify everything")
        console.print()
        return

    evo_status = _container_status("evolution")
    pico_status = _container_status("picoclaw")

    # Stage 2: Not running
    if evo_status != "running" or pico_status != "running":
        _print_containers(evo_status, pico_status)
        console.print()
        console.print("  [muted]Next:[/muted] [accent]devlair claw --start[/accent]")
        console.print()
        return

    # Containers are running — fetch WhatsApp instance state
    _print_containers(evo_status, pico_status)

    evolution_key = _get_env_var("EVOLUTION_API_KEY")
    instance_state = None
    instance_name = None
    if evolution_key:
        instances = runner.get_output(
            f"curl -sf -H 'apikey: {evolution_key}' http://127.0.0.1:8080/instance/fetchInstances"
        )
        if instances:
            try:
                data = json.loads(instances)
                for inst in data if isinstance(data, list) else []:
                    instance_name = inst.get("instance", {}).get("instanceName", "?")
                    instance_state = inst.get("instance", {}).get("state", "?")
            except (json.JSONDecodeError, TypeError):
                pass

    # Stage 3: Not paired
    if instance_state != "open":
        if instance_name:
            style = "warning"
            console.print(
                f"  [{style}]●[/{style}]  WhatsApp instance: [accent]{instance_name}[/accent] ({instance_state})"
            )
        console.print()
        console.print("  [muted]Next:[/muted] [accent]devlair claw --pair[/accent]")
        console.print()
        return

    # WhatsApp is connected
    console.print(f"  [success]●[/success]  WhatsApp instance: [accent]{instance_name}[/accent] ({instance_state})")

    # Allowlist
    allowlist_file = claw_dir / "allowlist.json"
    try:
        phones = json.loads(allowlist_file.read_text()) if allowlist_file.exists() else []
    except (json.JSONDecodeError, OSError):
        phones = []
        console.print("  [error]Corrupt allowlist.json[/error]")

    # Stage 4: No phones
    if not phones:
        console.print()
        console.print("  [warning]No allowed numbers.[/warning]")
        console.print("  [muted]Next:[/muted] [accent]devlair claw --allow +55…[/accent]")
        console.print()
        return

    # Stage 5: Ready — full dashboard
    console.print("\n  [muted]Allowed numbers:[/muted]")
    for phone in phones:
        console.print(f"    [accent]{phone}[/accent]")
    console.print()


# ── Pair ──────────────────────────────────────────────────────────────────


def pair_whatsapp() -> None:
    evolution_key = _get_env_var("EVOLUTION_API_KEY")
    if not evolution_key:
        console.print("  [error].env missing or no EVOLUTION_API_KEY set.[/error]")
        return

    # Check if Evolution API is reachable
    status = runner.get_output("docker inspect -f '{{.State.Status}}' evolution")
    if status != "running":
        console.print("  [error]Evolution API container is not running.[/error]")
        console.print("  [muted]Start it with [accent]devlair claw --start[/accent][/muted]")
        return

    import typer

    instance_name = typer.prompt("  Instance name", default="picoclaw")

    # Create instance if it doesn't exist
    console.print("  [muted]Creating WhatsApp instance...[/muted]")
    create_result = runner.get_output(
        f"""curl -sf -X POST http://127.0.0.1:8080/instance/create \
            -H 'apikey: {evolution_key}' \
            -H 'Content-Type: application/json' \
            -d '{{"instanceName": "{instance_name}", "integration": "WHATSAPP-BAILEYS", "qrcode": true, "webhook": "http://picoclaw:8080/webhook/whatsapp", "webhookByEvents": true, "webhookEvents": ["MESSAGES_UPSERT"]}}'"""
    )

    if create_result:
        try:
            data = json.loads(create_result)
            qr = data.get("qrcode", {})
            if isinstance(qr, dict) and qr.get("base64"):
                console.print("\n  [info]Scan the QR code from your WhatsApp app.[/info]")
                console.print("  [muted]QR code available at:[/muted]")
                console.print(f"  [accent]http://<tailscale-ip>:8080/instance/connect/{instance_name}[/accent]")
                console.print("\n  [muted]Or use the Evolution API manager at:[/muted]")
                console.print("  [accent]http://<tailscale-ip>:8080/manager[/accent]")
                return
        except (json.JSONDecodeError, TypeError):
            pass

    # If instance already exists, connect it
    console.print("  [muted]Connecting existing instance...[/muted]")
    runner.get_output(
        f"""curl -sf http://127.0.0.1:8080/instance/connect/{instance_name} \
            -H 'apikey: {evolution_key}'"""
    )

    ts_ip = runner.get_output("tailscale ip -4")
    host = ts_ip if ts_ip else "<tailscale-ip>"

    console.print("\n  [info]Scan the QR code to pair WhatsApp.[/info]")
    console.print("  [muted]Open in your browser (from a Tailscale device):[/muted]")
    console.print(f"  [accent]http://{host}:8080/manager[/accent]")
    console.print()


# ── Allowlist ─────────────────────────────────────────────────────────────


def allow_phone(phone: str) -> None:
    phone = phone.strip()
    if not phone.startswith("+"):
        console.print("  [error]Phone number must start with + (e.g. +5511999999999)[/error]")
        return

    allowlist_file = _claw_dir() / "allowlist.json"
    phones = _read_allowlist(allowlist_file)

    if phone in phones:
        console.print(f"  [muted]{phone} is already in the allowlist.[/muted]")
        return

    phones.append(phone)
    _write_allowlist(allowlist_file, phones)
    console.print(f"  [success]✓[/success]  Added {phone} to allowlist ({len(phones)} total)")


def revoke_phone(phone: str) -> None:
    phone = phone.strip()
    allowlist_file = _claw_dir() / "allowlist.json"
    phones = _read_allowlist(allowlist_file)

    if phone not in phones:
        console.print(f"  [muted]{phone} is not in the allowlist.[/muted]")
        return

    phones.remove(phone)
    _write_allowlist(allowlist_file, phones)
    console.print(f"  [success]✓[/success]  Removed {phone} from allowlist ({len(phones)} remaining)")


# ── Logs ──────────────────────────────────────────────────────────────────


def tail_logs() -> None:
    import subprocess

    claw_dir = _claw_dir()
    if not (claw_dir / "docker-compose.yml").exists():
        console.print("  [muted]PicoCLAW not configured.[/muted]")
        return

    console.print("  [muted]Tailing picoclaw logs (Ctrl+C to stop)...[/muted]\n")
    try:
        subprocess.run(
            ["docker", "compose", "logs", "-f", "--tail=50", "picoclaw"],
            cwd=str(claw_dir),
        )
    except KeyboardInterrupt:
        console.print("\n  [muted]Stopped.[/muted]")


# ── Stop / Start ──────────────────────────────────────────────────────────


def stop_stack() -> None:
    console.print("  [muted]Stopping claw stack...[/muted]")
    result = _compose_cmd("stop")
    if result.returncode == 0:
        console.print("  [success]✓[/success]  Stack stopped")
    else:
        console.print("  [error]Failed to stop stack.[/error]")


def start_stack() -> None:
    console.print("  [muted]Starting claw stack...[/muted]")
    result = _compose_cmd("up -d")
    if result.returncode == 0:
        console.print("  [success]✓[/success]  Stack started")
    else:
        console.print("  [error]Failed to start stack.[/error]")


# ── Helpers ───────────────────────────────────────────────────────────────


def _get_env_var(key: str) -> str:
    return _parse_env(_claw_dir() / ".env").get(key, "")


def _read_allowlist(path: Path) -> list[str]:
    try:
        data = json.loads(path.read_text()) if path.exists() else []
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _write_allowlist(path: Path, phones: list[str]) -> None:
    path.write_text(json.dumps(phones, indent=2) + "\n")


# ── Entry point ───────────────────────────────────────────────────────────


def run_claw(
    pair: bool = False,
    allow: Optional[str] = None,
    revoke: Optional[str] = None,
    logs: bool = False,
    stop: bool = False,
    start: bool = False,
) -> None:
    if pair:
        pair_whatsapp()
    elif allow:
        allow_phone(allow)
    elif revoke:
        revoke_phone(revoke)
    elif logs:
        tail_logs()
    elif stop:
        stop_stack()
    elif start:
        start_stack()
    else:
        show_status()
