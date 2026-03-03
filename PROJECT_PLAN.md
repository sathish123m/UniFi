# UniFi Section Plan

## 1) Admin Section

### Panels
- Overview dashboard: users, loans, active risk, revenue, pending KYC.
- KYC panel: approve/reject borrower/provider verification.
- User governance: suspend, ban, restore accounts.
- Loans panel: monitor all loan states and repayment lifecycle.
- Admin management: super admin can create/moderate admin accounts.
- Platform config: interest %, platform fee %, min/max limits, funding windows.

### Admin Access Model
- `SUPER_ADMIN`: full access + admin creation
- `MOD_ADMIN`: moderation + KYC + users + loans
- `FINANCE_ADMIN`: finance and config controls

## 2) Borrower Section

### Panels
- Overview: credit score, borrow limit, active loan summary, alerts.
- Request Loan: amount, tenure, purpose, optional note.
- Repayment: initiate and complete loan repayment.
- Account: UPI management and credit score history.

### Borrower Preconditions
- University email verified
- KYC approved
- UPI linked and verified

## 3) Provider Section

### Panels
- Overview: funded count, deployed capital, earnings, alerts.
- Marketplace: list/filter pending requests by tenure/score/amount.
- Portfolio: all funded loans with status and expected return.
- Alerts: funding/disbursal/repayment notifications.

### Provider Preconditions
- University email verified
- KYC approved
- UPI linked and verified

## Shared Workflow
1. Borrower request created.
2. Provider reserves request.
3. Provider funding payment processed.
4. Borrower disbursal recorded.
5. Borrower repayment processed.
6. Provider earning + UniFi platform fee accounted.
7. Credit score updated.
