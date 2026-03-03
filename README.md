# UniFi - Campus P2P Borrowing Platform

![CI](https://github.com/sathish123m/UniFi/actions/workflows/ci.yml/badge.svg)

UniFi is a full-stack lending platform for university students where:
- Borrowers request short-term money from peers
- Providers fund loans and earn returns
- Admins manage KYC, risk, and platform controls

The system is built as a production-style SWE/SDE monorepo with role-based access, OTP verification, payment gateway integration (Razorpay test mode), and security controls.

## Architecture
- `frontend/`: React + Vite client
- `backend/`: Node.js + Express API
- `backend/prisma/`: Prisma schema + migrations/seeding
- `scripts/`: local setup/dev/smoke helpers
- `docs/`: deployment and operational guides

High-level flow:
1. User registers with allowed university email domain
2. OTP verifies account ownership
3. Borrower posts request, provider funds, platform tracks lifecycle
4. Payment events are verified via API + webhook signatures
5. Admin panel governs KYC, moderation, and config

## Core Product Areas
- `Admin`: KYC review, user moderation, platform configuration, operational control
- `Borrower`: register/login, loan requests, repayment
- `Provider`: marketplace funding, order creation, return tracking

## Security Controls
- JWT auth with role-based route protection
- Helmet, HPP, CORS restrictions
- Rate limiting (global/auth/OTP)
- Encrypted sensitive fields (UPI)
- Webhook signature verification for Razorpay
- Input validation with Zod

## Quick Start (Local)
From repo root:

```bash
npm run setup
npm run dev
```

Useful commands:

```bash
npm run check
npm run smoke
npm run db:studio
npm --prefix backend run smtp:test -- your-email@example.com
npm --prefix backend run payment:test -- 1
```

## Environment Setup
- Backend template: `backend/.env.example`
- Frontend template: `frontend/.env.example`

Required features for your project:
- Real OTP emails via SMTP (`SMTP_*`)
- Razorpay test mode (`PAYMENT_PROVIDER=RAZORPAY` with `rzp_test_*` keys)
- Allowed university domains via `ALLOWED_UNIVERSITY_DOMAINS`

## CI and Engineering Quality
- GitHub Actions CI on every push/PR to `main`
- Backend syntax validation
- Prisma client generation check
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
- Razorpay test webhook setup
- post-deploy smoke checklist

## Demo Credentials (if dev seed is used)
- Admin: `admin@unifi.campus / Admin@UniFi#2025`
- Borrower: `borrower@lpu.in / Demo@1234`
- Provider: `provider@lpu.in / Demo@1234`

Do not use demo credentials in production.
