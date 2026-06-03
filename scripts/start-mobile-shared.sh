#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env.shared" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.shared"
  set +a
fi

if [[ -f "$ROOT_DIR/.env.shared.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.shared.local"
  set +a
fi

export CASSANDRA_HOST="${CASSANDRA_HOST:-0.0.0.0}"
export CASSANDRA_PORT="${CASSANDRA_PORT:-8001}"
export RCT_METRO_PORT="${RCT_METRO_PORT:-8081}"
export EXPO_PUBLIC_CASSANDRA_API_URL="${EXPO_PUBLIC_CASSANDRA_API_URL:-http://localhost:${CASSANDRA_PORT}}"
export EXPO_PUBLIC_CASSANDRA_WS_URL="${EXPO_PUBLIC_CASSANDRA_WS_URL:-ws://localhost:${CASSANDRA_PORT}}"
export EXPO_PUBLIC_VOICE_API_URL="${EXPO_PUBLIC_VOICE_API_URL:-$EXPO_PUBLIC_CASSANDRA_API_URL}"

cd "$ROOT_DIR"

# Unified Python orchestrator (replaces separate voice server)
(
  cd "$ROOT_DIR"
  CASSANDRA_PORT="${CASSANDRA_PORT:-8001}" \
  CASSANDRA_HOST="${CASSANDRA_HOST:-0.0.0.0}" \
  python3 -m cassandra.orchestrator.api_server
) &
ORCH_PID=$!

cleanup() {
  kill "$ORCH_PID" "$EXPO_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

(
  cd saas_mobile_app
  npx expo start --port "$RCT_METRO_PORT"
) &
EXPO_PID=$!

wait "$ORCH_PID" "$EXPO_PID"
