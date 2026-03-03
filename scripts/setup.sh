#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/backend"
npm install
npx prisma generate
npx prisma db push
node prisma/seed.js

cd "$ROOT/frontend"
npm install

cat <<MSG

Setup complete.
Run project with:
  cd $ROOT
  npm run dev

Or run servers separately:
  cd $ROOT/backend && npm run dev
  cd $ROOT/frontend && npm run dev -- --host localhost --port 5173
MSG
