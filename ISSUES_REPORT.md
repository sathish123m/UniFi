# UniFi Deep Cross-Check Issues Report

> **UPDATE 2026-10-17 — superseded in part by Path 2.** Items about payments, escrow, Razorpay/RazorpayX, payouts, settlement, interest and late fees were resolved by **removing** that functionality: UniFi is now non-custodial and record-only. See `docs/PATH2_RECORD_ONLY_PLAN.md`.

Cross-checked against:
- Offline project folder `/Users/msk/Documents/desktop/Uni-Fi`
- Deployed frontend `https://unifine.vercel.app`
- Deployed backend `https://unifi-backend-u99t.onrender.com`
- GitHub `https://github.com/sathish123m/UniFi`

## 1. Backend cold-start / 503 (Render free tier)
- **Evidence:** `/health` returns `503` during normal checks; browser auth page pending `OPTIONS` to backend.
- **Impact:** Signup/login and API calls hang/fail, especially first visit.
- **Solution:** Move backend to a non-sleeping Render instance or use UptimeRobot wake pings; update Render plan / region; document cold-start behavior.

## 2. Missing admin bootstrap on Render (SEED_ADMIN_* not in render.yaml)
- **Evidence:** `render.yaml` lacks `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, etc. `seed.js` skips admin creation unless both are set.
- **Impact:** No SUPER_ADMIN exists in production, so admin panel is unusable.
- **Solution:** Add hidden env vars in Render (or a one-time seed command) and require for production.

## 3. DB migration history mismatch / two local-only migrations
- **Evidence:** Local DB `_prisma_migrations` had mismatch; migrations `20260926...`, `20260928...` were untracked/new. Production `prepareDb` falls back to `db push` if resolve fails.
- **Impact:** Production may be missing KYC nullable/aadhaar/pan columns; runtime Prisma queries can fail.
- **Solution:** Commit both migrations and baseline production DB via `prisma migrate resolve --applied` before release. Ensure git tracks them.

## 4. Mandatory RAZORPAY in production but free Render testing uses test keys
- **Evidence:** `env.js` requires `RAZORPAY` in production; render config uses `PAYMENT_PROVIDER=RAZORPAY` with `sync: false` keys.
- **Impact:** Missing/placeholder keys prevent startup.
- **Solution:** Provide valid Razorpay test keys (or payment sandbox) and validate in `/health` + logs; keep keys in secret manager.

## 5. Mailjet vs SMTP mismatch
- **Evidence:** User reports Mailjet in production, but render uses Gmail SMTP (`smtp.gmail.com:465`) and local `.env` uses Gmail app password. SMTP logs show "Invalid login".
- **Impact:** OTP/password-reset emails fail.
- **Solution:** Set `EMAIL_PROVIDER=MAILJET_API` + Mailjet API credentials, or fix Gmail app password; add startup SMTP verification in non-production.

## 6. CORS allow-list may not include Vercel preview/admin origin
- **Evidence:** backend CORS only allows env origins + defaults; production doesn't allow all `*.vercel.app`. Frontend is `https://unifine.vercel.app`.
- **Impact:** If `CORS_ORIGINS` isn't exactly configured on Render, frontend requests fail.
- **Solution:** Set `CORS_ORIGINS=https://unifine.vercel.app` explicitly; add any preview domains.

## 7. Frontend asset bundle drift
- **Evidence:** Deployed `index-D5oVxHCL.js` differs from local built `index-Cp5w2eyU.js`; local build passes but source tree has TypeScript-free JS with edits.
- **Impact:** Hard to map deployed bugs to exact commit.
- **Solution:** Ensure deployment from a tagged/clean commit and verify Vercel build output.

## 8. Admin panel missing API fields
- **Evidence:** Admin `kyc_documents` fields `aadhaarNumber`, `panNumber` UI expects them; older rows may lack columns until migration applied.
- **Impact:** Admin KYC screen errors on null fields.
- **Solution:** Backfill/optional columns already added; guard optional fields with safe checks (done partially).

## 9. KYC storage (R2) unconfigured leads local filesystem on Render
- **Evidence:** Logs: "Cloudflare R2 credentials missing — falling back to local filesystem storage".
- **Impact:** Files may be lost on Render ephemeral filesystem/redeploy.
- **Solution:** Configure `R2_*` env vars on Render or chosen S3-compatible storage.

## 10. Delinquency sweep defaults after 15 days
- **Evidence:** background sweep runs on startup and hourly; local test marked one loan defaulted. Production `DEFAULT_AFTER_DAYS=15`.
- **Impact:** Potential false defaults if due-date logic inaccurate.
- **Solution:** Review `loan.service.sweepDelinquency` and timezone handling before production.

## 11. Rate limiting on OTP (3/min) and auth (10/min)
- **Evidence:** `AUTH_RATE_LIMIT_MAX=10`, `OTP_RATE_LIMIT_MAX=3`.
- **Impact:** Legitimate multi-campus testing can get blocked (as seen UX).
- **Solution:** Tune per environment and document reset instructions.

## 12. Demo users not enabled in production (`SEED_TEST_USERS=false`)
- **Evidence:** Seed gate based on NODE_ENV and `SEED_TEST_USERS`; production default false.
- **Impact:** cannot use demo borrower/provider in prod; intended, but troubleshooting harder.
- **Solution:** keep false in prod; allow temporary test accounts only via explicit toggle and cleanup plan.

## 13. Render DB seed runs on every startup
- **Evidence:** `prepareDb.js` runs seed when `DB_SEED_ON_DEPLOY=true`; Render's startCommand runs on every cold boot.
- **Impact:** continual seed executions, delays startup, possible errors.
- **Solution:** Make a one-time migration command vs startup seed; set `DB_SEED_ON_DEPLOY=false` after first run.

## 14. Frontend CSP permits Razorpay frames but camera requires self
- **Evidence:** Vercel CSP `Permissions-Policy: camera=(self)`, good.
- **Impact:** KYC camera requires HTTPS and proper permissions; mobile/Safari may behave differently.
- **Solution:** test camera flow across browsers; provide file upload fallback (already added).

## 15. Dynamic landing stats show `0`
- **Evidence:** "Students Onboard 0" hardcoded in landing snapshot.
- **Impact:** marketing stats inaccurate.
- **Solution:** Fetch from `/api/admin/stats` or curated static values.

## 16. Auth token refresh / role routing
- **Evidence:** recently merged `AuthContext` changes; backend `auth.service` JWT handling modified. Need production check of refresh cookie cross-domain (`credentials` with CORS).
- **Impact:** session can be wiped between Vercel and Render if cookie domain not set.
- **Solution:** configure refresh token as cross-site cookie with `SameSite=None; Secure` if cookies used, or use local storage.

## 17. Password-reset flow
- **Evidence:** `AuthPage` supports reset; SMTP/Mailjet failures block delivery.
- **Impact:** account recovery failure.
- **Solution:** verify email provider and reset endpoint end-to-end in staging.

## 18. Loan calculation edge cases (late fees)
- **Evidence:** backend `loanCalc.js` changed; `lateFeePerDayBps=50` and `MAX_LATE_FEE_PCT=20`.
- **Impact:** might compound incorrectly.
- **Solution:** add unit tests for loan/late fee math.

## 19. Migration rollback history integrity
- **Evidence:** `_prisma_migrations` had old `20260219185517_init` row.
- **Impact:** migration checksum drift.
- **Solution:** clean migration history and baseline local/prod consistently.

## Recommended fix order
1. Fix email provider and storage (OTP/KYC usability).
2. Set all missing envs on Render; seed admin once.
3. Apply and commit migrations to Neon.
4. Tune cold-start and DB seed behavior.
5. Add test coverage for payment + finance + auth flows.