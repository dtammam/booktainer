#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DATA_DIR="${REPO_ROOT}/data/smoke-scope"

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

cookie_admin="$(mktemp)"
cookie_a="$(mktemp)"
cookie_b="$(mktemp)"

login_payload='{"email":"admin@example.com","password":"admin-pass"}'
curl -fsS -c "$cookie_admin" -H "Content-Type: application/json" -d "$login_payload" \
  http://localhost:8080/api/auth/login >/dev/null

create_a='{"email":"usera@example.com","password":"user-pass","isAdmin":false}'
create_b='{"email":"userb@example.com","password":"user-pass","isAdmin":false}'
curl -fsS -b "$cookie_admin" -H "Content-Type: application/json" -d "$create_a" \
  http://localhost:8080/api/admin/users >/dev/null
curl -fsS -b "$cookie_admin" -H "Content-Type: application/json" -d "$create_b" \
  http://localhost:8080/api/admin/users >/dev/null

login_a='{"email":"usera@example.com","password":"user-pass"}'
login_b='{"email":"userb@example.com","password":"user-pass"}'
curl -fsS -c "$cookie_a" -H "Content-Type: application/json" -d "$login_a" \
  http://localhost:8080/api/auth/login >/dev/null
curl -fsS -c "$cookie_b" -H "Content-Type: application/json" -d "$login_b" \
  http://localhost:8080/api/auth/login >/dev/null

sample_path="${DATA_DIR}/sample.txt"
echo "Hello from user A" > "$sample_path"
upload_response=$(curl -fsS -b "$cookie_a" -F "file=@${sample_path}" \
  http://localhost:8080/api/books/upload)
book_id=$(echo "$upload_response" | sed -n 's/.*"id":"\\([^"]*\\)".*/\\1/p')
if [[ -z "$book_id" ]]; then
  echo "Upload did not return a book id."
  exit 1
fi

list_a=$(curl -fsS -b "$cookie_a" "http://localhost:8080/api/books?sort=dateAdded&q=")
count_a=$(echo "$list_a" | grep -o "\"id\"" | wc -l | tr -d " ")
if [[ "$count_a" != "1" ]]; then
  echo "Expected user A to see 1 book."
  exit 1
fi

list_b=$(curl -fsS -b "$cookie_b" "http://localhost:8080/api/books?sort=dateAdded&q=")
count_b=$(echo "$list_b" | grep -o "\"id\"" | wc -l | tr -d " ")
if [[ "$count_b" != "0" ]]; then
  echo "Expected user B to see 0 books."
  exit 1
fi

status_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookie_b" \
  "http://localhost:8080/api/books/${book_id}")
if [[ "$status_code" != "404" ]]; then
  echo "Expected 404 for user B direct access, got $status_code."
  exit 1
fi

progress_payload='{"location":{"chapter":1}}'
curl -fsS -b "$cookie_a" -H "Content-Type: application/json" -d "$progress_payload" \
  "http://localhost:8080/api/books/${book_id}/progress" >/dev/null

status_code=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookie_b" \
  "http://localhost:8080/api/books/${book_id}/progress")
if [[ "$status_code" != "404" ]]; then
  echo "Expected 404 for user B progress, got $status_code."
  exit 1
fi

rm -f "$cookie_admin" "$cookie_a" "$cookie_b"
echo "User scoping smoke check passed."
