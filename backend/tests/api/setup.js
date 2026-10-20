/**
 * Runs before any test file is loaded, so it must set up everything the app
 * needs at import time.
 */

process.env.NODE_ENV = 'test'

// The app validates/uses these on the request path; tests must not depend on a
// developer's local .env for them.
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-access-secret-0123456789abcdef0123456789abcdef'
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-0123456789abcdef0123456789abcdef'

// Tests issue far more requests per minute than a real client; keep the shared
// Redis rate-limit buckets from leaking between runs.
process.env.RATE_LIMIT_MAX_REQUESTS = '10000'
process.env.AUTH_RATE_LIMIT_MAX = '10000'
process.env.OTP_RATE_LIMIT_MAX = '10000'

process.env.QUEUE_ENABLED = 'false'
