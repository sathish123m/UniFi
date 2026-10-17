-- Provider payout settlement tracking.
--
-- A PROVIDER_PAYOUT ledger row records what a provider has *earned* (principal
-- returned + net interest). It previously had no way to record whether the money
-- had actually been transferred out. `settledAt` / `settlementRef` add that
-- reconciliation state, and `users.payoutFundAccountId` stores the RazorpayX
-- fund account used for automated transfers.
--
-- Additive and idempotent so it is safe to apply on an already-populated DB.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payoutFundAccountId" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "settlementRef" TEXT;

CREATE INDEX IF NOT EXISTS "transactions_type_settledAt_idx" ON "transactions"("type", "settledAt");
