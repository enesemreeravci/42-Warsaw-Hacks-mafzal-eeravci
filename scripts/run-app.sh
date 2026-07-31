#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.logs"
mkdir -p "$LOG_DIR"

SERVER_LOG="$LOG_DIR/server.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

terminate_port() {
  local port="$1"
  local pids=()

  if command -v lsof >/dev/null 2>&1; then
    pids=( $(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true) )
  elif command -v fuser >/dev/null 2>&1; then
    pids=( $(fuser "$port"/tcp 2>/dev/null || true) )
  elif command -v ss >/dev/null 2>&1; then
    pids=( $(ss -ltnp "sport = :$port" 2>/dev/null | awk 'NR>1 {match($0,/pid=([0-9]+)/,m); if (m[1]) print m[1]}' | sort -u) )
  else
    echo "No port inspection tool found for port $port; skipping."
    return 0
  fi

  for pid in "${pids[@]}"; do
    if [[ -n "$pid" ]]; then
      echo "Stopping process $pid using port $port"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

terminate_port 3000
terminate_port 4200

echo "Starting server on port 3000..."
(
  cd "$ROOT_DIR"
  npm run dev --workspace server
) >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

echo "Starting frontend on port 4200..."
(
  cd "$ROOT_DIR/frontend"
  NG_CLI_ANALYTICS=false ../node_modules/@angular/cli/bin/ng.js serve --proxy-config proxy.conf.json --host 0.0.0.0 --port 4200
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

echo "Server PID: $SERVER_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Logs: $SERVER_LOG"
echo "$FRONTEND_LOG"

wait "$SERVER_PID" "$FRONTEND_PID"
