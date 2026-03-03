# Security Checklist

## Already Implemented
- Strong password policy validation at registration.
- Account-state checks (active/suspended/banned) on protected requests.
- Encrypted sensitive UPI data at rest.
- Request body limits and route-level raw payload handling for webhooks.
- Idempotent payment transaction updates to reduce duplicate processing risk.

## Required Before Production
- Move KYC files to private object storage (S3/R2) with signed URL access only.
- Add MFA for admin accounts.
- Add device fingerprint/risk scoring enforcement in auth path.
- Add periodic secret rotation policy for JWT and encryption keys.
- Add managed WAF + bot protection in front of API.
- Add background jobs for overdue/default marking and reminder notifications.
- Implement legal consent collection and immutable contract records.
