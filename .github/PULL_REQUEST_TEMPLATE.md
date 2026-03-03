## Summary
- What changed?
- Why was it needed?

## Scope
- [ ] Backend
- [ ] Frontend
- [ ] Database schema/migration
- [ ] DevOps/Deployment
- [ ] Documentation

## Validation
- [ ] `npm run check`
- [ ] `npm run smoke`
- [ ] Manual role login check (Admin/Borrower/Provider)
- [ ] OTP flow check (register -> verify)
- [ ] Payment flow check (MOCK or Razorpay Test)

## Security Checklist
- [ ] No secrets committed (`.env` not tracked)
- [ ] Input validation added/updated where needed
- [ ] Auth/role access paths verified
- [ ] Error messages do not leak sensitive details

## Screenshots / API Evidence
- Add UI screenshots or API responses for changed behavior.

## Rollback Plan
- How to revert safely if this PR causes issues.
