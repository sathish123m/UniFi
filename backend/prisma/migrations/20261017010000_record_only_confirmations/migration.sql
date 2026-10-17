-- UniFi Path 2: record-only (non-custodial) loan lifecycle.
--
-- UniFi no longer holds or moves money. Instead the two peers attest to the
-- handover and the repayment, and the loan advances only when BOTH sides confirm:
--   * lender  marks the money handed over  -> "fundingSentAt"
--   * borrower confirms it was received    -> "fundingReceivedAt"  (both set => ACTIVE)
--   * borrower attests the repayment       -> "repayClaimedAt"
--   * lender confirms it was received       -> "repayConfirmedAt"  (both set => REPAID)
-- Either side may also raise a dispute, surfaced to campus admins.
--
-- Interest and platform fees are dropped from new loans (0). Existing
-- custodial-era rows keep their historical values. Additive and idempotent so it
-- is safe to apply on an already-populated database.

ALTER TABLE "loans"
  ADD COLUMN IF NOT EXISTS "fundingSentAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fundingReceivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "repayClaimedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "repayConfirmedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disputeReason"     TEXT,
  ADD COLUMN IF NOT EXISTS "disputeBy"         TEXT;

-- New loans are interest-free; keep the columns (historical rows) but default 0.
ALTER TABLE "loans" ALTER COLUMN "interestRate" SET DEFAULT 0;
ALTER TABLE "loans" ALTER COLUMN "platformFeeRate" SET DEFAULT 0;

-- Platform config: the interest/fee knobs are legacy; default them to 0.
ALTER TABLE "platform_config" ALTER COLUMN "interestRatePercent" SET DEFAULT 0;
ALTER TABLE "platform_config" ALTER COLUMN "platformFeePercent" SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS "loans_disputedAt_idx" ON "loans"("disputedAt");

-- Razorpay order columns are no longer queried; drop their indexes.
DROP INDEX IF EXISTS "loans_rzpOrderId_idx";
DROP INDEX IF EXISTS "loans_rzpRepayOrderId_idx";
