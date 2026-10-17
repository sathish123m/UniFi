# UniFi System Architecture

## Core Modules
- `backend/`: Express + Prisma API with role-based auth, KYC, lending, payments, and admin controls.
- `frontend/`: React + Vite Cred-style UI for Borrower, Provider, and Admin workflows.
- `references/`: design references from `unifi-landing.html` and `unifi-ui-blueprint.html`.

## User Roles
- Borrower: onboarding, KYC upload, UPI linking, loan request, repayments, disputes, notifications.
- Provider: marketplace lending, portfolio tracking, handover/repayment confirmations, alerts.
- Admin: KYC moderation, user moderation, loan oversight, dispute mediation, platform config, admin provisioning.

## Money Flow (record-only — UniFi holds no money)
1. Borrower creates request (`/api/loans`).
2. Provider commits to lend (`POST /api/loans/:id/fund`) → `FUNDED`.
3. The two peers settle directly (UPI/cash). Lender marks it sent
   (`POST /api/loans/:id/handover`); borrower confirms receipt
   (`POST /api/loans/:id/received`). When **both** confirm → `ACTIVE` and the
   repayment clock starts (`dueAt = now + tenure`).
4. Borrower marks it repaid (`POST /api/loans/:id/repay-claimed`); lender confirms
   receipt (`POST /api/loans/:id/confirm-repayment`). When **both** confirm →
   `REPAID`.
5. Either party may raise a dispute (`POST /api/loans/:id/dispute`) for admin
   mediation. Admins can force a stuck loan active or repaid.

There is **no escrow, no payment gateway, no interest, no fee and no payout** —
`totalRepayAmount == principalAmount`. `Transaction` rows are a confirmation
ledger of what each peer attested to, not a money movement.

## Payment Modes
- UniFi is **non-custodial and record-only** by design. No gateway is configured
  and no gateway credentials are required.
- (Historical: a custodial Razorpay mode existed pre-2026-10-17 and was removed —
  see `docs/LANDSCAPE_AND_COMPLIANCE.md` and `docs/PATH2_RECORD_ONLY_PLAN.md`.)

## Security Layers
- Helmet + HPP + strict CORS origin checks.
- JWT access + refresh token rotation.
- Role-based guards and KYC/UPI preconditions.
- Rate limiting on global/auth/OTP routes.
- AES-256 encryption for stored UPI IDs.
- Audit logs for admin actions.
