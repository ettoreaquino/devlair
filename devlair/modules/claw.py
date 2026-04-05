import json
import os
import shutil
import stat
import textwrap
from pathlib import Path

import typer

from devlair import runner
from devlair.console import console
from devlair.context import CheckItem, ModuleResult, SetupContext

LABEL = "PicoCLAW Agent"

CLAW_DIR_NAME = ".devlair/claw"
AGENT_DATA_DIR = "agent-data"

DOCKER_COMPOSE = textwrap.dedent("""\
    name: claw

    services:
      postgres:
        image: postgres:16-alpine
        container_name: claw-postgres
        restart: unless-stopped
        networks:
          - claw
        environment:
          - POSTGRES_DB=evolution
          - POSTGRES_USER=evolution
          - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
        volumes:
          - postgres-data:/var/lib/postgresql/data
        deploy:
          resources:
            limits:
              memory: 64M
        healthcheck:
          test: ["CMD-SHELL", "pg_isready -U evolution"]
          interval: 5s
          timeout: 3s
          retries: 5

      evolution:
        image: atendai/evolution-api:latest
        container_name: evolution
        restart: unless-stopped
        networks:
          - claw
        ports:
          - "0.0.0.0:8080:8080"
        environment:
          - AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY}
          - DATABASE_PROVIDER=postgresql
          - DATABASE_CONNECTION_URI=postgresql://evolution:${POSTGRES_PASSWORD}@postgres:5432/evolution
          - DATABASE_SAVE_DATA_INSTANCE=true
          - DATABASE_SAVE_DATA_NEW_MESSAGE=false
          - DATABASE_SAVE_DATA_CONTACTS=false
          - DATABASE_SAVE_DATA_CHATS=false
          - CACHE_REDIS_ENABLED=false
        volumes:
          - evolution-data:/evolution/instances
        deploy:
          resources:
            limits:
              memory: 256M
        depends_on:
          postgres:
            condition: service_healthy

      picoclaw:
        build: ./picoclaw
        container_name: picoclaw
        restart: unless-stopped
        read_only: true
        networks:
          - claw
        tmpfs:
          - /tmp:size=16M
        volumes:
          - ./agent-data:/agent-data
          - ./picoclaw.yml:/etc/picoclaw/config.yml:ro
          - ./allowlist.json:/etc/picoclaw/allowlist.json:ro
        environment:
          - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
          - EVOLUTION_API_URL=http://evolution:8080
          - EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
        env_file:
          - .env
        cap_drop:
          - ALL
        security_opt:
          - no-new-privileges:true
        user: "65534:65534"
        deploy:
          resources:
            limits:
              memory: 64M
              cpus: "0.5"
        depends_on:
          evolution:
            condition: service_started

    networks:
      claw:
        driver: bridge

    volumes:
      postgres-data:
      evolution-data:
""")

PICOCLAW_CONFIG = textwrap.dedent("""\
    # PicoCLAW configuration
    llm:
      provider: anthropic
      model: claude-sonnet-4-20250514
      max_tokens: 4096

    agent:
      data_dir: /agent-data
      system_prompt: |
        You are a helpful personal AI assistant accessible via WhatsApp.
        You can take notes, manage tasks, and answer questions.
        Be concise — WhatsApp messages should be short and readable.
        Store persistent data (notes, tasks) as files under /agent-data/.

    webhook:
      listen: 0.0.0.0:8080
      path: /webhook/whatsapp

    mcp:
      allowed_tools:
        - read_file
        - write_file
        - list_directory
      blocked_tools:
        - shell
        - exec
        - bash
        - terminal
        - filesystem_browse

    rate_limit:
      messages_per_minute: 10
      messages_per_hour: 60
""")

DEFAULT_ALLOWLIST = "[]"

PICOCLAW_DOCKERFILE = textwrap.dedent("""\
    FROM python:3.13-slim
    WORKDIR /app
    COPY requirements.txt .
    RUN pip install --no-cache-dir -r requirements.txt
    COPY app.py .
    CMD ["python", "-u", "app.py"]
""")

PICOCLAW_REQUIREMENTS = "anthropic>=0.40.0\npyyaml>=6.0\n"

PICOCLAW_APP = textwrap.dedent('''\
    """PicoCLAW — WhatsApp <> Claude bridge via Evolution API."""

    import json
    import logging
    import os
    import time
    from collections import defaultdict
    from http.server import HTTPServer, BaseHTTPRequestHandler
    from pathlib import Path
    from urllib.request import Request, urlopen

    import anthropic
    import yaml

    log = logging.getLogger("picoclaw")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    EVOLUTION_URL = os.environ["EVOLUTION_API_URL"]
    EVOLUTION_KEY = os.environ["EVOLUTION_API_KEY"]
    CONFIG_PATH = Path(os.environ.get("PICOCLAW_CONFIG", "/etc/picoclaw/config.yml"))
    ALLOWLIST_PATH = Path(os.environ.get("PICOCLAW_ALLOWLIST", "/etc/picoclaw/allowlist.json"))

    MAX_HISTORY = 20
    MAX_SENDERS = 200
    _rate: dict[str, list[float]] = defaultdict(list)
    _conversations: dict[str, list[dict]] = defaultdict(list)


    def load_config() -> dict:
        return yaml.safe_load(CONFIG_PATH.read_text())


    def load_allowlist() -> set[str]:
        try:
            return set(json.loads(ALLOWLIST_PATH.read_text()))
        except (FileNotFoundError, json.JSONDecodeError):
            return set()


    def is_rate_limited(sender: str, config: dict) -> bool:
        now = time.time()
        rl = config.get("rate_limit", {})
        per_min = rl.get("messages_per_minute", 10)
        per_hour = rl.get("messages_per_hour", 60)
        times = _rate[sender]
        times[:] = [t for t in times if now - t < 3600]
        if sum(1 for t in times if now - t < 60) >= per_min or len(times) >= per_hour:
            return True
        times.append(now)
        return False


    def call_claude(text: str, sender: str, config: dict) -> str:
        llm = config.get("llm", {})
        agent = config.get("agent", {})
        # Evict oldest sender if at capacity
        if sender not in _conversations and len(_conversations) >= MAX_SENDERS:
            oldest = next(iter(_conversations))
            del _conversations[oldest]
            _rate.pop(oldest, None)
        history = _conversations[sender]
        history.append({"role": "user", "content": text})
        if len(history) > MAX_HISTORY * 2:
            history[:] = history[-MAX_HISTORY:]

        client = anthropic.Anthropic()
        response = client.messages.create(
            model=llm.get("model", "claude-sonnet-4-20250514"),
            max_tokens=llm.get("max_tokens", 4096),
            system=agent.get("system_prompt", "You are a helpful assistant on WhatsApp. Be concise."),
            messages=history[-MAX_HISTORY:],
        )
        reply = response.content[0].text
        history.append({"role": "assistant", "content": reply})
        return reply


    def send_reply(number: str, text: str, instance: str = "picoclaw") -> None:
        url = f"{EVOLUTION_URL}/message/sendText/{instance}"
        data = json.dumps({"number": number, "text": text}).encode()
        req = Request(url, data=data, headers={
            "apikey": EVOLUTION_KEY,
            "Content-Type": "application/json",
        })
        try:
            urlopen(req, timeout=30)
        except Exception as e:
            log.error("Failed to send reply to %s: %s", number, e)


    class WebhookHandler(BaseHTTPRequestHandler):
        config: dict = {}

        def do_POST(self):
            if "/webhook/whatsapp" not in self.path:
                self.send_response(404)
                self.end_headers()
                return
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            self.send_response(200)
            self.end_headers()
            try:
                self._handle_message(body)
            except Exception:
                log.exception("Error handling webhook")

        def _handle_message(self, body: dict) -> None:
            data = body.get("data", {})
            key = data.get("key", {})
            if key.get("fromMe"):
                return
            jid = key.get("remoteJid", "")
            if not jid.endswith("@s.whatsapp.net"):
                return
            number = jid.replace("@s.whatsapp.net", "")
            allowlist = load_allowlist()
            if allowlist and f"+{number}" not in allowlist:
                log.info("Blocked message from %s (not in allowlist)", number)
                return
            msg = data.get("message", {})
            text = msg.get("conversation") or msg.get("extendedTextMessage", {}).get("text", "")
            if not text:
                return
            log.info("Message from %s: %s", number, text[:80])
            if is_rate_limited(number, self.__class__.config):
                log.warning("Rate limited: %s", number)
                return
            instance = body.get("instance", "picoclaw")
            reply = call_claude(text, number, self.__class__.config)
            send_reply(number, reply, instance)
            log.info("Replied to %s (%d chars)", number, len(reply))

        def log_message(self, format, *args):
            pass


    def main() -> None:
        config = load_config()
        WebhookHandler.config = config
        webhook = config.get("webhook", {})
        listen = webhook.get("listen", "0.0.0.0:8080")
        host, port = listen.rsplit(":", 1)
        server = HTTPServer((host, int(port)), WebhookHandler)
        log.info("PicoCLAW listening on %s", listen)
        server.serve_forever()


    if __name__ == "__main__":
        main()
''')

UFW_RULE = "allow from 100.64.0.0/10 to any port 8080 proto tcp"
UFW_COMMENT = "evolution-api-tailscale"


def _claw_dir(ctx: SetupContext) -> Path:
    return ctx.user_home / CLAW_DIR_NAME


def _chown_recursive(path: Path, username: str) -> None:
    """Chown a directory and its contents to the given user."""
    if os.geteuid() == 0:
        shutil.chown(path, username, username)
        for child in path.rglob("*"):
            shutil.chown(child, username, username)


def run(ctx: SetupContext) -> ModuleResult:
    if not runner.cmd_exists("docker"):
        return ModuleResult(status="fail", detail="docker not installed — run devlair init --only devtools first")

    claw_dir = _claw_dir(ctx)
    agent_data = claw_dir / AGENT_DATA_DIR

    # Create directory structure
    claw_dir.mkdir(parents=True, exist_ok=True)
    agent_data.mkdir(parents=True, exist_ok=True)

    # Write config files (only when content changed to avoid unnecessary rebuilds)
    agent_src = claw_dir / "picoclaw"
    agent_src.mkdir(parents=True, exist_ok=True)
    for path, content in (
        (claw_dir / "docker-compose.yml", DOCKER_COMPOSE),
        (claw_dir / "picoclaw.yml", PICOCLAW_CONFIG),
        (agent_src / "Dockerfile", PICOCLAW_DOCKERFILE),
        (agent_src / "requirements.txt", PICOCLAW_REQUIREMENTS),
        (agent_src / "app.py", PICOCLAW_APP),
    ):
        if not path.exists() or path.read_text() != content:
            path.write_text(content)

    # Write allowlist.json if it doesn't exist
    allowlist_file = claw_dir / "allowlist.json"
    if not allowlist_file.exists():
        allowlist_file.write_text(DEFAULT_ALLOWLIST + "\n")

    # Prompt for API keys and write .env
    env_file = claw_dir / ".env"
    existing_env = _parse_env(env_file)

    anthropic_key = existing_env.get("ANTHROPIC_API_KEY", "")
    evolution_key = existing_env.get("EVOLUTION_API_KEY", "")

    if not anthropic_key:
        console.print("  [info]Anthropic API key required for Claude LLM backend.[/info]")
        anthropic_key = typer.prompt("  ANTHROPIC_API_KEY", default="")
        if not anthropic_key:
            return ModuleResult(status="fail", detail="Anthropic API key is required")

    if not evolution_key:
        import secrets as _secrets

        evolution_key = _secrets.token_urlsafe(32)
        console.print("  [muted]Generated Evolution API key.[/muted]")

    postgres_pw = existing_env.get("POSTGRES_PASSWORD", "")
    if not postgres_pw:
        import secrets as _secrets

        postgres_pw = _secrets.token_urlsafe(24)

    env_content = (
        f"ANTHROPIC_API_KEY={anthropic_key}\nEVOLUTION_API_KEY={evolution_key}\nPOSTGRES_PASSWORD={postgres_pw}\n"
    )
    env_file.write_text(env_content)
    env_file.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0600

    # Own everything as the user
    _chown_recursive(claw_dir, ctx.username)

    # UFW rule for Tailscale access
    from devlair.modules.firewall import add_ufw_rule

    add_ufw_rule(UFW_RULE, UFW_COMMENT)

    # Build picoclaw image, pull evolution image, and start stack
    console.print("  [muted]Building and starting claw stack...[/muted]")
    up_result = runner.run_shell(
        f'cd "{claw_dir}" && docker compose up -d --build',
        quiet=True,
        check=False,
    )
    if up_result.returncode != 0:
        return ModuleResult(status="warn", detail="compose up failed — check docker logs")

    return ModuleResult(status="ok", detail="PicoCLAW + Evolution API running")


def check() -> list[CheckItem]:
    items: list[CheckItem] = []
    home = Path.home()
    claw_dir = home / CLAW_DIR_NAME

    # Skip all checks if claw is not provisioned
    if not (claw_dir / "docker-compose.yml").exists():
        items.append(
            CheckItem(
                label="claw provisioned",
                status="warn",
                detail="not configured — run devlair init --only claw",
            )
        )
        return items

    # Container health — single inspect per container
    for name in ("picoclaw", "evolution"):
        inspect_json = runner.get_output(f"docker inspect {name}")
        try:
            info = json.loads(inspect_json)[0] if inspect_json else {}
        except (json.JSONDecodeError, TypeError, IndexError):
            info = {}

        status = info.get("State", {}).get("Status", "")
        items.append(
            CheckItem(
                label=f"{name} container",
                status="ok" if status == "running" else "fail",
                detail=status or "not found",
            )
        )

        if name != "picoclaw":
            continue

        # Security checks from the same inspect payload
        user = info.get("Config", {}).get("User", "")
        non_root = user not in ("", "0", "root")
        items.append(
            CheckItem(
                label="picoclaw non-root",
                status="ok" if non_root else "fail",
                detail=f"user={user}" if user else "not set",
            )
        )

        host_cfg = info.get("HostConfig", {})
        ro = host_cfg.get("ReadonlyRootfs", False)
        items.append(
            CheckItem(
                label="picoclaw read-only rootfs",
                status="ok" if ro else "fail",
                detail="enabled" if ro else "disabled",
            )
        )

        cap_drop = host_cfg.get("CapDrop") or []
        items.append(
            CheckItem(
                label="picoclaw cap_drop ALL",
                status="ok" if "ALL" in cap_drop else "fail",
                detail=str(cap_drop) if cap_drop else "none",
            )
        )

        bind_mounts = [m for m in info.get("Mounts", []) if m.get("Type") == "bind"]
        _EXPECTED_DESTS = {"/agent-data", "/etc/picoclaw/config.yml", "/etc/picoclaw/allowlist.json"}
        agent_data_only = all(m.get("Destination", "").rstrip("/") in _EXPECTED_DESTS for m in bind_mounts)
        docker_socket = any("/var/run/docker.sock" in m.get("Source", "") for m in bind_mounts)
        items.append(
            CheckItem(
                label="no docker socket mount",
                status="ok" if not docker_socket else "fail",
                detail="clean" if not docker_socket else "DOCKER SOCKET MOUNTED",
            )
        )
        items.append(
            CheckItem(
                label="only expected bind mounts",
                status="ok" if agent_data_only else "warn",
                detail="agent-data + config only" if agent_data_only else f"{len(bind_mounts)} bind mount(s)",
            )
        )

    # .env permissions
    env_file = claw_dir / ".env"
    if env_file.exists():
        mode = oct(env_file.stat().st_mode & 0o777)
        items.append(
            CheckItem(
                label=".env permissions",
                status="ok" if mode == "0o600" else "fail",
                detail=mode,
            )
        )
    else:
        items.append(CheckItem(label=".env permissions", status="fail", detail="missing"))

    # Allowlist non-empty
    allowlist_file = claw_dir / "allowlist.json"
    try:
        phones = json.loads(allowlist_file.read_text())
    except (json.JSONDecodeError, OSError, FileNotFoundError):
        phones = []
    if not isinstance(phones, list):
        phones = []
    items.append(
        CheckItem(
            label="sender allowlist",
            status="ok" if phones else "warn",
            detail=f"{len(phones)} number(s)" if phones else "empty — add with devlair claw --allow",
        )
    )

    # Verify dangerous tools are only in blocked_tools, not in allowed_tools
    config_file = claw_dir / "picoclaw.yml"
    if config_file.exists():
        try:
            import yaml

            cfg = yaml.safe_load(config_file.read_text()) or {}
        except Exception:
            cfg = {}
        allowed = cfg.get("mcp", {}).get("allowed_tools", [])
        dangerous = {"shell", "exec", "bash", "terminal", "filesystem_browse"}
        leaked = dangerous & set(allowed)
        items.append(
            CheckItem(
                label="no shell/exec MCP tools",
                status="ok" if not leaked else "fail",
                detail="clean" if not leaked else f"dangerous in allowed_tools: {leaked}",
            )
        )

    return items


# ── Helpers ────────────────────────────────────────────────────────────────


def _parse_env(path: Path) -> dict[str, str]:
    """Parse a simple KEY=VALUE .env file."""
    env = {}
    try:
        text = path.read_text()
    except (FileNotFoundError, OSError):
        return env
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env
