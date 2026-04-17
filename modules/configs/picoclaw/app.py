"""PicoCLAW — WhatsApp <> Claude bridge via Evolution API."""

import json
import logging
import os
import time
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, HTTPServer
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
    req = Request(
        url,
        data=data,
        headers={
            "apikey": EVOLUTION_KEY,
            "Content-Type": "application/json",
        },
    )
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
