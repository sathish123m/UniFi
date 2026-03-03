#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://localhost:5050}"
EMAIL="${2:-borrower@lpu.in}"
PASSWORD="${3:-Demo@1234}"

echo "[1] health"
curl -sS "$BASE/health"
echo

echo "[2] login demo account ($EMAIL)"
curl -sS -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
echo
