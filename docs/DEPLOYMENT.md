# UniFi Deployment (Render + Vercel, SMTP OTP + Razorpay Test)

This runbook deploys your current project with:
- Real email OTP (Gmail SMTP)
- Razorpay in **Test Mode**
- PostgreSQL + Redis

## 1. Deploy Backend on Render

1. Open [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **Blueprint**.
3. Select your GitHub repo: `sathish123m/UniFi`.
4. Render will detect `/Users/msk/Desktop/Uni-Fi/render.yaml`.
5. Create the backend service `unifi-backend`.

After service creation, open backend service -> **Environment** and fill all `sync: false` variables.

Minimum required values:
- `APP_URL=https://<your-render-service>.onrender.com`
- `FRONTEND_URL=https://<your-vercel-domain>`
- `CORS_ORIGINS=https://<your-vercel-domain>`
- `DATABASE_URL=<your-neon-or-render-postgres-url>`
- `REDIS_URL=<your-upstash-or-render-redis-url>`
- `ENCRYPTION_KEY=<64-char-hex>`
- `RAZORPAY_KEY_ID=rzp_test_...`
- `RAZORPAY_KEY_SECRET=...`
- `RAZORPAY_WEBHOOK_SECRET=...`
- `SMTP_USER=<your-gmail-address>`
- `SMTP_PASS=<gmail-16-char-app-password>`
- `SMTP_FROM=<same-gmail-address>`

Notes:
- `NODE_ENV=production`, `PAYMENT_PROVIDER=RAZORPAY`, and rate-limit defaults are already in `render.yaml`.
- Startup command already runs `prisma migrate deploy`.

## 2. Deploy Frontend on Vercel

1. Open [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** -> **Project**.
3. Import `sathish123m/UniFi`.
4. Set **Root Directory** = `frontend`.
5. Build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
6. Add environment variable:
   - `VITE_API_URL=https://<your-render-service>.onrender.com/api`
7. Deploy.

`frontend/vercel.json` already includes SPA rewrite and cache headers.

## 3. Wire CORS and App URLs Correctly

After Vercel gives a production URL:
1. Update Render backend env:
   - `FRONTEND_URL=https://<vercel-domain>`
   - `CORS_ORIGINS=https://<vercel-domain>`
2. Redeploy backend.

## 4. Configure Razorpay Test Webhook

In [Razorpay Dashboard (Test)](https://dashboard.razorpay.com/):
1. Go to **Webhooks** -> **Add New Webhook**.
2. URL: `https://<your-render-service>.onrender.com/api/payments/webhook`
3. Events:
   - `payment.captured`
   - `payment.failed`
4. Secret: exactly same value as `RAZORPAY_WEBHOOK_SECRET`.

## 5. Verify SMTP OTP

From backend logs on Render:
- Check no SMTP auth errors.

Functional test:
1. Open frontend site.
2. Register with allowed domain email (`@lpu.in` or second allowed domain).
3. OTP email should arrive in inbox.
4. Verify OTP and login.

## 6. Post-Deploy Smoke Checklist

- `GET /health` returns `status: ok`.
- Borrower and provider login works.
- Role guard works (cross-role route access blocked).
- Create funding and repayment orders (Razorpay test).
- OTP resend and verify flows are stable.

## 7. Production Notes

- Keep `.env` secrets only in provider dashboards; never in GitHub.
- Rotate SMTP app password and Razorpay secrets periodically.
- For custom domain, update:
  - Vercel project domain
  - Render env (`APP_URL`, `FRONTEND_URL`, `CORS_ORIGINS`)
  - Razorpay webhook URL
