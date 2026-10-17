# UniFi Deployment (Render + Vercel, SMTP OTP, record-only)

This runbook deploys your current project with:
- Real email OTP (Gmail SMTP)
- Cloud object storage (Cloudflare R2) for KYC documents
- PostgreSQL + Redis
- **No payment gateway** — UniFi is non-custodial and record-only

## 1. Deploy Backend on Render

1. Open [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **Blueprint**.
3. Select your GitHub repo: `sathish123m/UniFi`.
4. Render will detect `render.yaml` at the repository root.
5. Create the backend service `unifi-backend`.

After service creation, open backend service -> **Environment** and fill all `sync: false` variables.

Minimum required values:
- `APP_URL=https://<your-render-service>.onrender.com`
- `FRONTEND_URL=https://<your-vercel-domain>`
- `CORS_ORIGINS=https://<your-vercel-domain>`
- `DATABASE_URL=<your-neon-or-render-postgres-url>`
- `REDIS_URL=<your-upstash-or-render-redis-url>`
- `ENCRYPTION_KEY=<64-char-hex>`
- `R2_ACCOUNT_ID=<cloudflare-account-id>`
- `R2_ACCESS_KEY_ID=<r2-access-key>`
- `R2_SECRET_ACCESS_KEY=<r2-secret>`
- `R2_BUCKET_NAME=<bucket>`
- `R2_PUBLIC_URL=<https://...r2.dev or custom domain>`
- `SMTP_USER=<your-gmail-address>`
- `SMTP_PASS=<gmail-16-char-app-password>`
- `SMTP_FROM=<same-gmail-address>`

Notes:
- `NODE_ENV=production` and rate-limit defaults are already in `render.yaml`.
- **No payment keys are needed** and none are declared in `render.yaml`.
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

## 4. Configure KYC Object Storage (Cloudflare R2)

UniFi refuses local-disk storage in production, so KYC uploads fail until R2 is set:

1. In [Cloudflare Dashboard](https://dash.cloudflare.com/), open **R2** -> create a bucket.
2. Create an R2 API token (Object Read & Write) -> note the **Access Key ID** and **Secret**.
3. Fill `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
4. Expose the bucket via an r2.dev URL or custom domain -> set `R2_PUBLIC_URL`.
5. Redeploy and upload a test KYC document as a borrower.

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
- Create a loan, fund it as a provider, then confirm handover from both sides (loan goes `ACTIVE`).
- OTP resend and verify flows are stable.

## 7. Production Notes

- Keep `.env` secrets only in provider dashboards; never in GitHub.
- Rotate the SMTP app password, `ENCRYPTION_KEY`, `JWT_*` secrets and R2 keys periodically.
- For custom domain, update:
  - Vercel project domain
  - Render env (`APP_URL`, `FRONTEND_URL`, `CORS_ORIGINS`)
