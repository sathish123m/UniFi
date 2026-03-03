const rateLimit = require('express-rate-limit')

const asPositiveInt = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const make = (windowMs, max, msg) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: msg },
  })

const globalRateLimiter = make(
  asPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
  asPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  'Too many requests'
)

const authRateLimiter = make(
  15 * 60 * 1000,
  asPositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 10),
  'Too many auth attempts, try again in 15 minutes'
)

const otpRateLimiter = make(
  60 * 1000,
  asPositiveInt(process.env.OTP_RATE_LIMIT_MAX, 3),
  'Too many OTP requests'
)

module.exports = { globalRateLimiter, authRateLimiter, otpRateLimiter }
