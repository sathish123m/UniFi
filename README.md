# UniFi - Campus P2P Borrowing Platform

![CI](https://github.com/sathish123m/UniFi/actions/workflows/ci.yml/badge.svg)

UniFi is a non-custodial campus trust network for university students where:
- Borrowers request short-term help from peers, interest-free
- Peers lend directly and build trust; UniFi records the agreement
- Admins manage KYC, risk, disputes, and platform controls

UniFi **never holds or moves money** and charges **no interest or fees**. Peers
settle directly (UPI/cash) and both sides confirm the handover and the repayment
in-app. The system is a production-style SWE/SDE monorepo with role-based access,
OTP verification, campus verification, dual-confirmation IOU recording, and
security controls.

## Architecture
- `frontend/`: React + Vite client
- `backend/`: Node.js + Express API
- `backend/prisma/`: Prisma schema + migrations/seeding
- `scripts/`: local setup/dev/smoke helpers
- `docs/`: deployment and operational guides

High-level flow:
1. User registers with allowed university email domain
2. OTP verifies account ownership
3. Borrower posts request, a peer commits to lend, the two settle directly
4. Both sides confirm the handover (then the repayment) — the platform records it
5. Admin panel governs KYC, moderation, disputes, and config

## Core Product Areas
- `Admin`: KYC review, user moderation, dispute mediation, platform configuration
- `Borrower`: register/login, loan requests, repayment confirmations
- `Provider`: marketplace lending, handover/repayment confirmations, portfolio

## Security Controls
- JWT auth with role-based route protection
- Helmet, HPP, CORS restrictions
- Rate limiting (global/auth/OTP)
- Encrypted sensitive fields (UPI)
- Dual-confirmation IOU lifecycle (no custody)
- Input validation with Zod

## Quick Start (Local)
From repo root:

```bash
npm run setup
npm run dev
```

Useful commands:

```bash
npm run check          # syntax + unit tests + frontend build
npm run test:api       # HTTP/integration suite (Jest + Supertest; needs Postgres)
npm --prefix backend run mail:test -- you@example.com   # send through the real provider chain
npm run smoke
npm run db:studio
npm --prefix backend run smtp:test -- your-email@example.com
```

## Environment Setup
- Backend template: `backend/.env.example`
- Frontend template: `frontend/.env.example`

Required features for your project:
- Real OTP emails via SMTP (`SMTP_*`)
- Cloud object storage for KYC documents (`R2_*`)
- Allowed university domains via `ALLOWED_UNIVERSITY_DOMAINS`

> No payment gateway is required — UniFi is non-custodial and record-only.

## Caching and Background Jobs

- **Redis cache** (`backend/src/utils/cache.js`) — read-through cache for platform
  configuration and the public university list. Every operation degrades to a
  cache miss if Redis is unavailable, and admin writes invalidate the affected
  key immediately. Tune with `CACHE_TTL_SECONDS` (default 60s).
- **Background jobs** — the delinquency sweep (hourly) and transient-row cleanup
  (every 6h) run on an in-process scheduler by default. Set `QUEUE_ENABLED=true`
  to run them through **BullMQ** instead, which de-duplicates across instances
  and adds retries with exponential backoff. A worker keeps a blocking Redis
  connection open, so on a metered Redis plan check `QUEUE_DRAIN_DELAY_MS`
  (default 30s) before enabling it.
- `npm run jobs:run` still runs both jobs once and exits, for an external cron.

## CI and Engineering Quality
- GitHub Actions CI on every push/PR to `main`
- Backend syntax validation and Prisma client generation
- Prisma migration-drift check against `schema.prisma`
- Unit tests (`node --test`) and an HTTP integration suite (Jest + Supertest)
  against a real Postgres + Redis service
- Frontend production build check
- Standardized issue templates and PR template
- Contribution rules in `CONTRIBUTING.md`

## Deployment
Full deployment runbook is available at:
- `docs/DEPLOYMENT.md`

This includes:
- Backend + frontend deployment shape
- PostgreSQL/Redis requirements
- SMTP verification
- post-deploy smoke checklist

## Demo Credentials (local dev seed only)

The admin account is **not** hardcoded. It is created from environment variables
(`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) the first time the seed runs, and is
never overwritten on re-seed. Set your own values in `backend/.env` before seeding.

Demo borrower/provider accounts are only created outside production (or when
`SEED_TEST_USERS=true`) and share the password `Demo@1234`:

- Borrower: `borrower@<your-university-domain> / Demo@1234`
- Provider: `provider@<your-university-domain> / Demo@1234`

The university domain comes from `ALLOWED_UNIVERSITY_DOMAINS`. Never enable the
demo seed or reuse these passwords in production.

