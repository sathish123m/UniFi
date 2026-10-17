-- Make KYC document keys nullable to support piecemeal uploads
-- and remove the need for placeholder object keys.
ALTER TABLE "kyc_documents" ALTER COLUMN "studentIdFrontKey" DROP NOT NULL;
ALTER TABLE "kyc_documents" ALTER COLUMN "selfieKey" DROP NOT NULL;
