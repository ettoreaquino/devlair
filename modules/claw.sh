#!/usr/bin/env bash
# modules/claw.sh — PicoCLAW Agent
# devlair module: claw
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

read_context

USERNAME=$(ctx_get username)
USER_HOME=$(ctx_get userHome)
MODE=${1:-run}

CLAW_DIR="$USER_HOME/.devlair/claw"
AGENT_DATA_DIR="$CLAW_DIR/agent-data"
UFW_RULE="allow from 100.64.0.0/10 to any port 8080 proto tcp"
UFW_COMMENT="evolution-api-tailscale"

# _parse_env FILE -- read KEY=VALUE pairs from a .env file into stdout as KEY=VALUE lines.
_parse_env() {
  local file=$1
  [[ -f "$file" ]] || return 0
  while IFS= read -r line; do
    line="${line%%#*}"
    line="${line// /}"
    [[ -z "$line" || "$line" != *"="* ]] && continue
    echo "$line"
  done < "$file"
}

do_run() {
  if ! cmd_exists docker; then
    json_result "fail" "docker not installed — run devlair init --only devtools first"
    exit 1
  fi

  # Create directory structure
  mkdir -p "$CLAW_DIR" "$AGENT_DATA_DIR"
  local agent_src="$CLAW_DIR/picoclaw"
  mkdir -p "$agent_src"

  # Write config files (only when content changed to avoid unnecessary rebuilds)
  json_progress "writing claw config files"
  local -A file_map=(
    ["$CLAW_DIR/docker-compose.yml"]="$SCRIPT_DIR/configs/docker-compose.yml.tmpl"
    ["$CLAW_DIR/picoclaw.yml"]="$SCRIPT_DIR/configs/picoclaw.yml"
    ["$agent_src/Dockerfile"]="$SCRIPT_DIR/configs/picoclaw/Dockerfile"
    ["$agent_src/requirements.txt"]="$SCRIPT_DIR/configs/picoclaw/requirements.txt"
    ["$agent_src/app.py"]="$SCRIPT_DIR/configs/picoclaw/app.py"
  )

  for dest in "${!file_map[@]}"; do
    local src="${file_map[$dest]}"
    if [[ ! -f "$dest" ]] || ! diff -q "$src" "$dest" >/dev/null 2>&1; then
      cp "$src" "$dest"
    fi
  done

  # Write allowlist.json if it doesn't exist
  local allowlist_file="$CLAW_DIR/allowlist.json"
  if [[ ! -f "$allowlist_file" ]]; then
    echo '[]' > "$allowlist_file"
  fi

  # Read existing .env values
  json_progress "configuring secrets"
  local env_file="$CLAW_DIR/.env"
  local anthropic_key="" evolution_key="" postgres_pw=""

  if [[ -f "$env_file" ]]; then
    while IFS='=' read -r key value; do
      case "$key" in
        ANTHROPIC_API_KEY) anthropic_key="$value" ;;
        EVOLUTION_API_KEY) evolution_key="$value" ;;
        POSTGRES_PASSWORD) postgres_pw="$value" ;;
      esac
    done < <(_parse_env "$env_file")
  fi

  # Get API key from config if not in .env
  if [[ -z "$anthropic_key" ]]; then
    anthropic_key=$(ctx_get_config anthropic_api_key)
    if [[ -z "$anthropic_key" ]]; then
      json_result "fail" "Anthropic API key is required"
      exit 1
    fi
  fi

  # Generate secrets if missing
  if [[ -z "$evolution_key" ]]; then
    evolution_key=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
  fi
  if [[ -z "$postgres_pw" ]]; then
    postgres_pw=$(openssl rand -base64 24 | tr -d '=/+' | head -c 24)
  fi

  # Write .env
  cat > "$env_file" <<EOF
ANTHROPIC_API_KEY=$anthropic_key
EVOLUTION_API_KEY=$evolution_key
POSTGRES_PASSWORD=$postgres_pw
EOF
  chmod 600 "$env_file"

  # Own everything as the user
  chown_user_r "$CLAW_DIR"

  # UFW rule for Tailscale access
  add_ufw_rule "$UFW_RULE" "$UFW_COMMENT"

  # Build and start stack
  json_progress "building and starting claw stack"
  if ! (cd "$CLAW_DIR" && docker compose up -d --build >&2 2>&1); then
    json_result "warn" "compose up failed — check docker logs"
    exit 0
  fi

  json_result "ok" "PicoCLAW + Evolution API running"
}

do_check() {
  # Skip all checks if claw is not provisioned
  if [[ ! -f "$CLAW_DIR/docker-compose.yml" ]]; then
    json_check "claw provisioned" "warn" "not configured — run devlair init --only claw"
    return
  fi

  # Container health
  for name in picoclaw evolution; do
    local inspect_json status
    inspect_json=$(docker inspect "$name" 2>/dev/null || echo "[]")
    status=$(echo "$inspect_json" | jq -r '.[0].State.Status // "not found"' 2>/dev/null)

    if [[ "$status" == "running" ]]; then
      json_check "$name container" "ok" "running"
    else
      json_check "$name container" "fail" "$status"
    fi

    # Security checks for picoclaw only
    if [[ "$name" != "picoclaw" ]]; then
      continue
    fi

    # Non-root user
    local user
    user=$(echo "$inspect_json" | jq -r '.[0].Config.User // ""' 2>/dev/null)
    if [[ -n "$user" && "$user" != "0" && "$user" != "root" ]]; then
      json_check "picoclaw non-root" "ok" "user=$user"
    else
      json_check "picoclaw non-root" "fail" "${user:-not set}"
    fi

    # Read-only rootfs
    local ro
    ro=$(echo "$inspect_json" | jq -r '.[0].HostConfig.ReadonlyRootfs // false' 2>/dev/null)
    if [[ "$ro" == "true" ]]; then
      json_check "picoclaw read-only rootfs" "ok" "enabled"
    else
      json_check "picoclaw read-only rootfs" "fail" "disabled"
    fi

    # cap_drop ALL
    local cap_drop
    cap_drop=$(echo "$inspect_json" | jq -r '.[0].HostConfig.CapDrop // [] | if index("ALL") then "yes" else "no" end' 2>/dev/null)
    if [[ "$cap_drop" == "yes" ]]; then
      json_check "picoclaw cap_drop ALL" "ok"
    else
      json_check "picoclaw cap_drop ALL" "fail"
    fi

    # No docker socket mount
    local docker_socket
    docker_socket=$(echo "$inspect_json" | jq -r '[.[0].Mounts // [] | .[] | select(.Type=="bind") | .Source] | if any(contains("/var/run/docker.sock")) then "yes" else "no" end' 2>/dev/null)
    if [[ "$docker_socket" == "no" ]]; then
      json_check "no docker socket mount" "ok" "clean"
    else
      json_check "no docker socket mount" "fail" "DOCKER SOCKET MOUNTED"
    fi

    # Only expected bind mounts
    local unexpected
    unexpected=$(echo "$inspect_json" | jq -r '
      [.[0].Mounts // [] | .[] | select(.Type=="bind") | .Destination]
      | map(select(. != "/agent-data" and . != "/etc/picoclaw/config.yml" and . != "/etc/picoclaw/allowlist.json"))
      | length
    ' 2>/dev/null)
    if [[ "$unexpected" == "0" ]]; then
      json_check "only expected bind mounts" "ok" "agent-data + config only"
    else
      json_check "only expected bind mounts" "warn" "unexpected bind mount(s)"
    fi
  done

  # .env permissions
  local env_file="$CLAW_DIR/.env"
  if [[ -f "$env_file" ]]; then
    local mode
    mode=$(stat -c '%a' "$env_file" 2>/dev/null || echo "000")
    if [[ "$mode" == "600" ]]; then
      json_check ".env permissions" "ok" "0$mode"
    else
      json_check ".env permissions" "fail" "0$mode"
    fi
  else
    json_check ".env permissions" "fail" "missing"
  fi

  # Allowlist non-empty
  local allowlist_file="$CLAW_DIR/allowlist.json"
  local phone_count=0
  if [[ -f "$allowlist_file" ]]; then
    phone_count=$(jq 'if type == "array" then length else 0 end' "$allowlist_file" 2>/dev/null || echo 0)
  fi
  if [[ "$phone_count" -gt 0 ]]; then
    json_check "sender allowlist" "ok" "${phone_count} number(s)"
  else
    json_check "sender allowlist" "warn" "empty — add with devlair claw --allow"
  fi

  # Verify dangerous tools are only in blocked_tools
  local config_file="$CLAW_DIR/picoclaw.yml"
  if [[ -f "$config_file" ]]; then
    # Check for shell/exec/bash in allowed_tools using grep on the YAML
    local allowed_section=false leaked=""
    while IFS= read -r line; do
      if [[ "$line" == *"allowed_tools:"* ]]; then
        allowed_section=true
        continue
      fi
      if [[ "$allowed_section" == true ]]; then
        if [[ "$line" == *"blocked_tools:"* || ("$line" != *"- "* && "$line" != *" "* ) ]]; then
          break
        fi
        for dangerous in shell exec bash terminal filesystem_browse; do
          if [[ "$line" == *"- $dangerous"* ]]; then
            leaked="${leaked:+$leaked, }$dangerous"
          fi
        done
      fi
    done < "$config_file"
    if [[ -z "$leaked" ]]; then
      json_check "no shell/exec MCP tools" "ok" "clean"
    else
      json_check "no shell/exec MCP tools" "fail" "dangerous in allowed_tools: $leaked"
    fi
  fi
}

case "$MODE" in
  run)   do_run ;;
  check) do_check ;;
  *)     json_result "fail" "unknown mode: $MODE"; exit 1 ;;
esac
