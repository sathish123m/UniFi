# UniFi Section Plan

## 1) Admin Section

### Panels
- Overview dashboard: users, loans, active risk, disputes, pending KYC.
- KYC panel: approve/reject borrower/provider verification.
- User governance: suspend, ban, restore accounts.
- Loans panel: monitor all loan states and repayment lifecycle.
- Disputes panel: mediate loans either peer has flagged; force active/repaid.
- Admin management: super admin can create/moderate admin accounts.
- Platform config: min/max limits, score tiers, funding windows.

### Admin Access Model
- `SUPER_ADMIN`: full access + admin creation
- `MOD_ADMIN`: moderation + KYC + users + loans
- `FINANCE_ADMIN`: finance and config controls

## 2) Borrower Section

### Panels
- Overview: credit score, borrow limit, active loan summary, alerts.
- Request Loan: amount, tenure, purpose, optional note.
- Repayment: attest repayment; the lender then confirms receipt.
- Account: UPI management and credit score history.

### Borrower Preconditions
- University email verified
- KYC approved
- UPI linked and verified

## 3) Provider Section

### Panels
- Overview: funded count, principal deployed, awaiting confirmation, alerts.
- Marketplace: list/filter pending requests by tenure/score/amount.
- Portfolio: all funded loans with status and confirmation state.
- Alerts: handover/repayment confirmation notifications.

### Provider Preconditions
- University email verified
- KYC approved
- UPI linked and verified

## Shared Workflow
1. Borrower request created.
2. Provider commits to lend (reserves the request).
3. Peers settle directly; lender marks the handover sent.
4. Borrower confirms receipt — both confirmations activate the loan.
5. Borrower attests the repayment.
6. Lender confirms receipt — loan marked repaid. No fee or earning is recorded.
7. Credit score updated. Either peer may raise a dispute at any step.
