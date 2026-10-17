# Path 2 — Record-Only Trust Ledger: Implementation Plan

**Goal:** make UniFi a **non-custodial** campus trust/reputation platform. The platform never
holds money, never charges interest, and never touches a payment gateway. Peers settle directly
(UPI/cash), and UniFi records the agreement, the handover, and the repayment with **dual
confirmation** from both sides. This removes the NBFC-P2P trigger entirely (see
`docs/LANDSCAPE_AND_COMPLIANCE.md`).

## What changes, conceptually

| Today (custodial P2P) | After (record-only) |
|---|---|
| Provider pays via Razorpay → platform holds funds → discharges to borrower | Provider hands money over directly; marks it sent; borrower confirms received |
| Borrower repays via Razorpay → platform → provider payout ledger | Borrower marks repaid; provider confirms received |
| Interest + platform fee + provider earning | **Zero interest.** `totalRepayAmount == principalAmount` |
| Late fee accrues as money | No late fee. Consequence is reputation/score + default flag only |
| `payment.service` / `payout.service` move money | Deleted. `Transaction` becomes a confirmation ledger |
| Razorpay / RazorpayX env required | Removed |

## Loan lifecycle (new)

```
PENDING ──fundLoan (peer commits)──> FUNDED
FUNDED ──markFundingSent (lender attests)──┐
FUNDED ──confirmFundingReceived (borrower)─┴─both──> ACTIVE (dueAt = now + tenure)
ACTIVE/DEFAULTED ──claimRepayment (borrower attests)──> (awaiting lender)
ACTIVE/DEFAULTED ──confirmRepaymentReceived (lender)──> REPAID
either ──raiseDispute──> disputedAt set (visible to admin), status unchanged
```

## File-by-file changes

### Backend
- `prisma/schema.prisma` — add to `Loan`: `fundingSentAt`, `fundingReceivedAt`, `repayClaimedAt`,
  `repayConfirmedAt`, `disputedAt`, `disputeReason`, `disputeBy`. Update comments on
  `TransactionType` / `LoanStatus`. New migration `20261017010000_record_only_confirmations`.
- `utils/loanCalc.js` — `calculateLoan` returns zero interest/fee; `totalRepayAmount = principal`.
- `services/loan.service.js` — drop late-fee math/env; add the four confirmation handlers +
  dispute; keep `markDisbursed`/`markRepaid` as admin overrides; update notifications.
- `routes/loan.routes.js` — add `/handover`, `/received`, `/repay-claimed`, `/confirm-repayment`,
  `/dispute`.
- **Delete** `services/payment.service.js`, `routes/payment.routes.js`,
  `services/payout.service.js`, `scripts/paymentTest.js`.
- `index.js` — remove `/api/payments` mount + Razorpay error special-case.
- `routes/admin.routes.js` — remove refund, settlement-summary, payouts, fund-account routes.
- `config/env.js` — remove Razorpay/PAYOUT validation + `paymentProvider`.
- `utils/connectionChecks.js` — remove Razorpay check.
- `package.json` — remove `payment:test` script (and `razorpay` dep if unused).

### Frontend
- `pages/BorrowerPanel.jsx` — remove Razorpay checkout; repay = claim; add "confirm money received";
  drop late-fee/interest copy; "Total repayable" = principal.
- `pages/ProviderPanel.jsx` — remove Razorpay checkout; fund = commit then "mark handed over";
  add "confirm repayment received"; replace "your earning" with "principal returned".
- `pages/AdminPanel.jsx` — remove the Provider Payouts tab + late-fee display.
- `lib/razorpay.js` — delete.

### Deploy / docs
- `render.yaml` — remove Razorpay + payout env.
- `docs/PAYOUTS.md` — delete (concept no longer exists).
- `NOTES_FOR_USER.md` / `AUDIT_2026-10-16.md` — record the pivot.

### Tests
- `tests/loanCalc.test.js` — assert zero interest and `totalRepayAmount === principal`.

## Explicit non-goals
- No NBFC-P2P licensing work (that was Path 1).
- No custody, no escrow, no payout rail — by design.
