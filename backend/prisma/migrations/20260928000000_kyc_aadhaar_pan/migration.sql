-- Government identity (India KYC): add Aadhaar + PAN columns to kyc_documents.
-- Numbers are stored AES-256-GCM encrypted (iv:tag:ciphertext); the *Key columns
-- hold private object storage keys for the document images. All nullable because
-- KYC is uploaded piecemeal and older rows predate these fields.
-- IF NOT EXISTS makes this safe to apply even if a prior `prisma db push`
-- already created the columns.
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "aadhaarNumberEnc" TEXT;
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "aadhaarFrontKey" TEXT;
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "aadhaarBackKey" TEXT;
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "panNumberEnc" TEXT;
ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "panDocKey" TEXT;
