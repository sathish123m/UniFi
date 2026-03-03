#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://localhost:5050}"

echo "[1] health"
curl -sS "$BASE/health"
echo

echo "[2] login demo borrower"
curl -sS -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  --data '{"email":"borrower@vitstudent.ac.in","password":"Demo@1234"}'
echo
