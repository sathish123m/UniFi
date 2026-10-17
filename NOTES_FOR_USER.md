# Things you need to do yourself (deployment/account)

> **Path 2 is now live in the code — UniFi is non-custodial and record-only.**
> There is no payment gateway, no escrow, no interest and no platform fee. Peers
> settle directly (UPI/cash) and both sides confirm the handover and the
> repayment in-app. See `docs/PATH2_RECORD_ONLY_PLAN.md` and
> `docs/LANDSCAPE_AND_COMPLIANCE.md`. All Razorpay/RazorpayX code, routes, env
> and docs were removed.

0. **Push the commit.** Everything is committed locally already
   (`b097cc4 refactor: adopt Path 2 record-only trust ledger; remove payment
   custody`, 90 files) and the working tree is clean. `main` is 1 commit ahead of
   `origin/main`, so Render autoDeploy and Vercel are still on the old commit
   until you `git push`. The commit includes the new
   `20261017010000_record_only_confirmations` migration (plus the earlier
   `20260926000000_kyc_nullable_keys`, `20260928000000_kyc_aadhaar_pan`,
   `20261016000000_payment_order_indexes`, `20261017000000_payout_settlement`),
   `migration_lock.toml`, and all the previously-untracked modules and CI files.
1. Render env: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `CORS_ORIGINS=https://unifine.vercel.app`.
2. Render env: R2 storage keys (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`). The backend
   **refuses** local disk for KYC in production, so uploads 500 until R2 is set.
3. Email provider: either a valid Gmail app password + SMTP settings, or set
   `EMAIL_PROVIDER=MAILJET_API` with `MAILJET_API_KEY` / `MAILJET_API_SECRET` /
   `SMTP_FROM` (sender). Mailjet no longer borrows SMTP credentials.
4. **No payment keys needed.** `PAYMENT_PROVIDER`, `RAZORPAY_*`, `PAYOUT_PROVIDER`
   and `RAZORPAYX_ACCOUNT_NUMBER` are gone — delete them from Render if you had
   set them. `render.yaml` no longer declares them.
5. Vercel env: `VITE_API_URL=https://unifi-backend-u99t.onrender.com/api` (or your backend URL).
6. Optional SMS OTP: set `SMS_PROVIDER=TWILIO`, `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Without them it stays in mock mode.
7. After the first successful Render migration, set `DB_SEED_ON_DEPLOY=false`.
8. Rotate the leaked `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`
   (present in git history) and purge history — you said you will do this last.
9. Multi-campus onboarding: see `docs/MULTI_UNIVERSITY.md` (admin API, no redeploy needed).
10. Disputes: either peer can flag a loan (`POST /api/loans/:id/dispute`); it shows
    in the admin **Disputes** tab, where an admin can **force the loan active** or
    **mark it repaid** when the peers confirmed things offline.
11. Off-instance job scheduler: `render.yaml` adds a `unifi-jobs` **cron** service
    (`npm run jobs:run`, every 6h). Render cron jobs need a **paid plan**; on the
    free plan the in-process scheduler keeps running while the API is awake, and
    you can point any external scheduler at `npm run jobs:run` instead.
12. Secret scanning: `.github/workflows/secret-scan.yml` (gitleaks) now runs on
    every push/PR. It will flag the secrets already in history until you rotate
    and purge them (item 8) — that's expected.

## Compliance note (not legal advice)

Path 2 removes custody and interest, which sidesteps the RBI NBFC-P2P trigger,
but it is **not a legal sign-off**. Before running this publicly at scale in
India, get fintech counsel to review: the exact wording of the landing page and
consent screens, data-protection (DPDP Act) handling of Aadhaar/PAN, and whether
"arranging" peer loans in any way still needs registration. See
`docs/LANDSCAPE_AND_COMPLIANCE.md`.
