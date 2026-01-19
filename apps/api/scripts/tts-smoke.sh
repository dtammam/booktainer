#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DATA_DIR="${REPO_ROOT}/data/smoke-tts"
VOICES_DIR="${DATA_DIR}/tts-voices"

cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID"
  fi
}
trap cleanup EXIT

rm -rf "$DATA_DIR"

export DATA_DIR="$DATA_DIR"
export PIPER_VOICES_DIR="$VOICES_DIR"
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

login_payload='{"email":"admin@example.com","password":"admin-pass"}'
curl -fsS -c "$cookie_jar" -H "Content-Type: application/json" -d "$login_payload" \
  http://localhost:8080/api/auth/login >/dev/null

curl -fsS -b "$cookie_jar" http://localhost:8080/api/tts/voices >/dev/null

offline_voice="en_US-lessac-medium"
install_payload="{\"voice\":\"${offline_voice}\"}"
curl -fsS -b "$cookie_jar" -H "Content-Type: application/json" -d "$install_payload" \
  http://localhost:8080/api/tts/offline/install-voice >/dev/null

offline_payload="{\"mode\":\"offline\",\"voice\":\"${offline_voice}\",\"rate\":1,\"text\":\"hello world\"}"
curl -fsS -b "$cookie_jar" -H "Content-Type: application/json" -d "$offline_payload" \
  http://localhost:8080/api/tts/speak -o "${DATA_DIR}/hello-offline.wav" >/dev/null

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  online_payload='{"mode":"online","voice":"alloy","rate":1,"text":"hello world"}'
  curl -fsS -b "$cookie_jar" -H "Content-Type: application/json" -d "$online_payload" \
    http://localhost:8080/api/tts/speak -o "${DATA_DIR}/hello-online.mp3" >/dev/null
else
  echo "OPENAI_API_KEY not set; skipping online TTS."
fi

rm -f "$cookie_jar"
echo "TTS smoke check passed."
