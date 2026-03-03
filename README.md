# UniFi - Campus Borrowing Platform

A full-stack university lending platform with three portals:
- Admin
- Borrower
- Provider

## Project Paths
- `/Users/msk/Desktop/Uni-Fi/backend` - Express + Prisma API
- `/Users/msk/Desktop/Uni-Fi/frontend` - React + Vite app
- `/Users/msk/Desktop/Uni-Fi/references/unifi-landing.html` - landing reference
- `/Users/msk/Desktop/Uni-Fi/references/unifi-ui-blueprint.html` - UI blueprint reference

## One-Command Local Usage
From `/Users/msk/Desktop/Uni-Fi`:

```bash
npm run setup
npm run dev
```

Useful commands:
```bash
npm run db:studio   # open Prisma Studio on http://localhost:5555
npm run smoke       # quick API health/login check
npm run build:frontend
npm --prefix backend run smtp:test -- you@example.com
npm --prefix backend run payment:test -- 1
```

## Runtime URLs
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5050`
- Prisma Studio: `http://localhost:5555`

## Auth + OTP (Dev Mode)
- Register requires supported university domain email.
- In development, register/resend OTP returns `devOtp` so you can verify immediately.
- UI shows this as `Dev OTP` in verify tab.

## Supported University Domains (Seeded)
- `vitstudent.ac.in`
- `bits-pilani.ac.in`
- `srmist.edu.in`
- `manipal.edu`
- `psgtech.ac.in`
- `am.students.amrita.edu`
- `vit.ac.in`

## Payment Modes
### 1) MOCK (default, free)
- `PAYMENT_PROVIDER=MOCK`
- Full local e2e without external payment setup.

### 2) Razorpay (live/prod)
- `PAYMENT_PROVIDER=RAZORPAY`
- Requires:
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
  - `RAZORPAY_WEBHOOK_SECRET`
  - optional: `RAZORPAY_VERIFY_API=true` (recommended)

### Razorpay Setup Checklist
1. Create test keys in Razorpay dashboard and set in `/Users/msk/Desktop/Uni-Fi/backend/.env`.
2. Set:
```env
PAYMENT_PROVIDER=RAZORPAY
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
RAZORPAY_VERIFY_API=true
```
3. Start backend and frontend.
4. Test keys by creating a test order:
```bash
npm --prefix backend run payment:test -- 1
```
5. Configure Razorpay webhook:
  - URL: `https://your-domain/api/payments/webhook`
  - Events: `payment.captured`, `payment.failed`
  - Secret must match `RAZORPAY_WEBHOOK_SECRET`.
6. For local webhook testing, use tunneling (ngrok/cloudflared) and paste that HTTPS URL in Razorpay webhook settings.

## Database Management
### Visual UI
```bash
npm run db:studio
```
Open `http://localhost:5555` and edit records directly.

### SQL CLI
```bash
psql "postgresql://msk@localhost:5432/unifi_db?host=/tmp"
```

## SMTP Setup (Real OTP Emails)
1. Get SMTP credentials from your provider dashboard (username, password/API key, host, port).
2. Update `/Users/msk/Desktop/Uni-Fi/backend/.env`:
```env
SMTP_HOST="smtp-relay.brevo.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_ALLOW_SELF_SIGNED=false
SMTP_USER="your_smtp_username"
SMTP_PASS="your_smtp_password_or_key"
SMTP_FROM="noreply@yourdomain.com"
SMTP_TEST_TO="you@yourdomain.com"
```
3. Test credentials:
```bash
npm --prefix backend run smtp:test -- you@yourdomain.com
```
4. Restart backend:
```bash
cd /Users/msk/Desktop/Uni-Fi/backend
npm run dev
```

## Demo Accounts
- Super Admin: `admin@unifi.campus / Admin@UniFi#2025`
- Borrower: `borrower@vitstudent.ac.in / Demo@1234`
- Provider: `provider@vitstudent.ac.in / Demo@1234`

Change admin credentials immediately after first login.

## What Is Already Done
- Role-based auth and portal separation.
- Loan request, funding, disbursal, repayment lifecycle.
- KYC submission and admin review queue.
- Platform config management and audit logs.
- Landing page reworked to reference-style sections (`Problem`, `How`, `Portals`, `Trust`, `CTA`).
- `Join Now` now scrolls to CTA role chooser; `I want to Borrow/Earn` opens role-prefilled register.

## What Still Needs External Credentials
- Production SMTP credentials for real OTP emails.
- Razorpay live credentials + deployed webhook URL.
- Cloud object storage (S3/R2) for production KYC document storage.
- Deployment infra (domain + TLS + hosting).
