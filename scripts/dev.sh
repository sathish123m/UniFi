#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  if [[ -n "${BACK_PID:-}" ]]; then kill "$BACK_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "${FRONT_PID:-}" ]]; then kill "$FRONT_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

cd "$ROOT/backend"
npm run dev &
BACK_PID=$!

cd "$ROOT/frontend"
npm run dev -- --host localhost --port 5173 &
FRONT_PID=$!

echo "Backend PID: $BACK_PID"
echo "Frontend PID: $FRONT_PID"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:5050"

wait "$BACK_PID" "$FRONT_PID"
