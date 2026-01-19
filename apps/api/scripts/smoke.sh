#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

cd "$REPO_ROOT"

echo "Building API..."
pnpm --filter ./apps/api build

echo "Starting API..."
node apps/api/dist/index.js &
API_PID=$!

cleanup() {
  if kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID"
  fi
}
trap cleanup EXIT

health_url="http://localhost:8080/api/health"
max_attempts=20

for ((i = 1; i <= max_attempts; i++)); do
  if curl -fsS "$health_url" >/dev/null; then
    echo "Smoke check passed."
    exit 0
  fi
  sleep 1
done

echo "Smoke check failed: $health_url did not return 200."
exit 1
