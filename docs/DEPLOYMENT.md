# UniFi Deployment Guide

This guide is for deploying UniFi as a production-style SWE project while keeping:
- Real email OTP delivery
- Razorpay in test mode

## 1. Target Architecture
- Frontend: Vite static app (Vercel/Netlify/Cloudflare Pages)
- Backend: Node.js API (Render/Railway/Fly.io/EC2)
- Database: PostgreSQL (managed)
- Cache: Redis (managed)
- SMTP: Gmail App Password (or any SMTP provider)

## 2. Required Environment Variables

### Backend
Use `/Users/msk/Desktop/Uni-Fi/backend/.env.example` as baseline.

Mandatory:
- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET` (>= 32 chars)
- `JWT_REFRESH_SECRET` (>= 32 chars)
- `ENCRYPTION_KEY` (64 hex chars)
- `FRONTEND_URL`
- `CORS_ORIGINS`

OTP (SMTP):
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_STRICT=true`

Payment (Razorpay test mode):
- `PAYMENT_PROVIDER=RAZORPAY`
- `RAZORPAY_KEY_ID=rzp_test_...`
- `RAZORPAY_KEY_SECRET=...`
- `RAZORPAY_WEBHOOK_SECRET=...`
- `RAZORPAY_VERIFY_API=true`

University domain policy:
- `ALLOWED_UNIVERSITY_DOMAINS=lpu.in,rguktn.ac.in`

### Frontend
- `VITE_API_URL=https://<your-backend-domain>/api`

## 3. Database Migration and Seed
Run once on deploy:
```bash
cd /Users/msk/Desktop/Uni-Fi/backend
npx prisma generate
npx prisma migrate deploy
```

Optional demo seed (do not run on production):
```bash
NODE_ENV=development node prisma/seed.js
```

## 4. SMTP Verification
```bash
cd /Users/msk/Desktop/Uni-Fi/backend
npm run smtp:test -- your-email@example.com
```

Expected output:
- `SMTP verify: OK`
- `Message ID: ...`

## 5. Razorpay Test Webhook Setup
In Razorpay Dashboard (Test Mode):
1. Create webhook URL: `https://<backend-domain>/api/payments/webhook`
2. Subscribe to:
   - `payment.captured`
   - `payment.failed`
3. Use same secret in `RAZORPAY_WEBHOOK_SECRET`.

## 6. Post-Deploy Smoke Tests
```bash
cd /Users/msk/Desktop/Uni-Fi
npm run smoke -- https://<backend-domain>
```

Manual checks:
- Register -> OTP received -> verify success
- Borrower login and borrower-only routes
- Provider login and provider-only routes
- Admin login and admin dashboard access
- Funding and repayment order creation in Razorpay test mode

## 7. Production Hardening Checklist
- Enable HTTPS everywhere.
- Restrict `CORS_ORIGINS` to exact production domains.
- Rotate JWT/encryption/SMTP keys regularly.
- Add centralized logging and alerts.
- Enable daily database backups.
- Add admin MFA.
