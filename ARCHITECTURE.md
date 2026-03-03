# UniFi System Architecture

## Core Modules
- `backend/`: Express + Prisma API with role-based auth, KYC, lending, payments, and admin controls.
- `frontend/`: React + Vite Cred-style UI for Borrower, Provider, and Admin workflows.
- `references/`: design references from `unifi-landing.html` and `unifi-ui-blueprint.html`.

## User Roles
- Borrower: onboarding, KYC upload, UPI linking, loan request, repayment, notifications.
- Provider: marketplace funding, portfolio tracking, return visibility, alerts.
- Admin: KYC moderation, user moderation, loan oversight, platform config, admin provisioning.

## Money Flow
1. Borrower creates request (`/api/loans`).
2. Provider reserves funding (`/api/loans/:id/fund`).
3. Provider payment order created (`/api/payments/fund/:loanId`).
4. Payment success marks disbursal and activates loan.
5. Borrower repayment order created (`/api/payments/repay/:loanId`).
6. Repayment success marks loan repaid and records platform fee transaction.

## Payment Modes
- `PAYMENT_PROVIDER=MOCK` (default): fully testable local e2e without external gateway.
- `PAYMENT_PROVIDER=RAZORPAY`: production-ready gateway mode with webhook verification.

## Security Layers
- Helmet + HPP + strict CORS origin checks.
- JWT access + refresh token rotation.
- Role-based guards and KYC/UPI preconditions.
- Rate limiting on global/auth/OTP routes.
- AES-256 encryption for stored UPI IDs.
- Webhook signature verification for payment authenticity.
- Audit logs for admin actions.
