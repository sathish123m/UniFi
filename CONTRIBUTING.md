# Contributing to UniFi

## Branching
- Base branch: `main`
- Feature branch format: `feat/<short-topic>`
- Fix branch format: `fix/<short-topic>`

## Commit Format
- Use imperative style:
  - `feat(auth): add OTP resend cooldown`
  - `fix(payments): handle Razorpay network errors`
  - `docs(deploy): add Render + Vercel setup guide`

## Local Setup
```bash
npm run setup
npm run dev
```

## Required Checks Before PR
```bash
npm run check
npm run smoke
```

## Security Rules
- Never commit secrets, API keys, or `.env` files.
- Keep `backend/.env.example` and `frontend/.env.example` updated when new env vars are introduced.
- Validate all external input with schemas before business logic.
- Preserve role-based access boundaries (`ADMIN`, `BORROWER`, `PROVIDER`).

## Pull Request Rules
- Keep PR scope focused.
- Include test or validation evidence.
- Include rollback steps for risky changes.
- Use the repository PR template.
