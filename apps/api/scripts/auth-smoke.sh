#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DATA_DIR="${REPO_ROOT}/data/smoke-auth"

cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID"
  fi
}
trap cleanup EXIT

rm -rf "$DATA_DIR"

export DATA_DIR="$DATA_DIR"
export SESSION_SECRET="smoke-secret"
export SESSION_TTL_DAYS="1"
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="admin-pass"

cd "$REPO_ROOT"

echo "Building API..."
pnpm -w --filter @booktainer/api build

echo "Starting API..."
node apps/api/dist/index.js &
API_PID=$!

health_url="http://localhost:8080/api/health"
for _ in {1..20}; do
  if curl -fsS "$health_url" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -fsS "$health_url" >/dev/null; then
  echo "Smoke check failed: $health_url did not return 200."
  exit 1
fi

cookie_jar="$(mktemp)"
cookie_jar_user="$(mktemp)"

login_payload='{"email":"admin@example.com","password":"admin-pass"}'
curl -fsS -c "$cookie_jar" -H "Content-Type: application/json" -d "$login_payload" \
  http://localhost:8080/api/auth/login >/dev/null

if ! grep -q "booktainer_session" "$cookie_jar"; then
  echo "Expected booktainer_session cookie."
  exit 1
fi

curl -fsS -b "$cookie_jar" http://localhost:8080/api/auth/me >/dev/null

kill "$API_PID"
node apps/api/dist/index.js &
API_PID=$!
sleep 1

cookie_jar_restart="$(mktemp)"
curl -fsS -c "$cookie_jar_restart" -H "Content-Type: application/json" -d "$login_payload" \
  http://localhost:8080/api/auth/login >/dev/null

create_payload='{"email":"user@example.com","password":"user-pass","isAdmin":false}'
curl -fsS -b "$cookie_jar" -H "Content-Type: application/json" -d "$create_payload" \
  http://localhost:8080/api/admin/users >/dev/null

login_user_payload='{"email":"user@example.com","password":"user-pass"}'
curl -fsS -c "$cookie_jar_user" -H "Content-Type: application/json" -d "$login_user_payload" \
  http://localhost:8080/api/auth/login >/dev/null

status_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookie_jar_user" \
  -H "Content-Type: application/json" -d "$create_payload" \
  http://localhost:8080/api/admin/users)
if [[ "$status_code" != "403" ]]; then
  echo "Expected 403 for non-admin, got $status_code."
  exit 1
fi

rm -f "$cookie_jar" "$cookie_jar_user" "$cookie_jar_restart"
echo "Auth smoke check passed."
