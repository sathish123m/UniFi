-- Speed up webhook and reconciliation lookups that resolve a payment order to
-- its loan/transaction. These columns are filtered on every webhook delivery
-- but were previously unindexed, so latency grew with payment history.

CREATE INDEX IF NOT EXISTS "loans_rzpOrderId_idx" ON "loans"("rzpOrderId");
CREATE INDEX IF NOT EXISTS "loans_rzpRepayOrderId_idx" ON "loans"("rzpRepayOrderId");
CREATE INDEX IF NOT EXISTS "transactions_rzpOrderId_idx" ON "transactions"("rzpOrderId");
