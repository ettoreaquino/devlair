#!/usr/bin/env bash
# Build the Docker test image and run integration tests inside it.
# Usage: bash tests/integration/run.sh [--no-cache]
set -euo pipefail

cd "$(dirname "$0")/../.."

IMAGE="devlair-integration-test"
NO_CACHE=""
[[ "${1:-}" == "--no-cache" ]] && NO_CACHE="--no-cache"

echo "==> Building integration test image..."
docker build $NO_CACHE -t "$IMAGE" -f tests/integration/Dockerfile .

echo ""
echo "==> Running integration tests..."
docker run --rm \
  -e SUDO_USER=testuser \
  "$IMAGE"

echo ""
echo "==> Integration tests passed."
