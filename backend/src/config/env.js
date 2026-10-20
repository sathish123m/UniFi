const logger = require('./logger')

const err = (msg) => {
  throw new Error(`[ENV] ${msg}`)
}

const isProduction = (process.env.NODE_ENV || 'development') === 'production'

const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']

const checkRequired = () => {
  for (const key of required) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      err(`${key} is required`)
    }
  }
}

const checkSecretStrength = () => {
  if ((process.env.JWT_ACCESS_SECRET || '').length < 32) err('JWT_ACCESS_SECRET must be at least 32 chars')
  if ((process.env.JWT_REFRESH_SECRET || '').length < 32) err('JWT_REFRESH_SECRET must be at least 32 chars')
  if ((process.env.ENCRYPTION_KEY || '').length !== 64) err('ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
}

const checkEmailProviderConfig = () => {
  const provider = String(process.env.EMAIL_PROVIDER || 'SMTP').trim().toUpperCase()
  if (!['SMTP', 'BREVO_API', 'MAILJET_API', 'GMAIL_SCRIPT'].includes(provider)) {
    logger.warn('[ENV] EMAIL_PROVIDER should be SMTP, BREVO_API, MAILJET_API or GMAIL_SCRIPT')
  }

  if (provider === 'GMAIL_SCRIPT') {
    const url = String(process.env.GMAIL_SCRIPT_URL || '').trim()
    const secret = String(process.env.GMAIL_SCRIPT_SECRET || '').trim()
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) {
      logger.warn('[ENV] GMAIL_SCRIPT_URL missing or not an Apps Script /exec URL; email fallback will be used')
    }
    if (secret.length < 12) {
      logger.warn('[ENV] GMAIL_SCRIPT_SECRET missing or too short; the relay will reject messages')
    }
  }

  if (provider === 'BREVO_API') {
    const key = String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()
    if (!key || key.length < 10 || /PASTE_/i.test(key)) {
      logger.warn('[ENV] BREVO_API_KEY missing or invalid; email fallback will be used')
    }
  }

  if (provider === 'MAILJET_API') {
    const key = String(process.env.MAILJET_API_KEY || '').trim()
    const secret = String(process.env.MAILJET_API_SECRET || '').trim()
    if (!key || !secret || key.length < 10 || secret.length < 10 || /PASTE_/i.test(key) || /PASTE_/i.test(secret)) {
      logger.warn('[ENV] MAILJET_API_KEY / SECRET missing or short; email fallback will be used')
    }
  }
}

const checkRedisConfig = () => {
  const raw = String(process.env.REDIS_URL || '').trim()

  if (isProduction && !raw) {
    err('REDIS_URL is required in production')
  }

  if (!raw) return

  const looksLikeUri = /^rediss?:\/\//i.test(raw)
  const looksLikeCli = /^redis-cli\b/i.test(raw)

  if (!looksLikeUri && !looksLikeCli) {
    err('REDIS_URL must start with redis:// or rediss:// (or be a redis-cli --tls -u ... command)')
  }

  if (looksLikeUri) {
    try {
      const parsed = new URL(raw)
      const host = (parsed.hostname || '').toLowerCase()
      if (host.includes('upstash.io') && parsed.protocol === 'redis:') {
        err('Upstash Redis requires TLS. Use rediss://... URL in REDIS_URL')
      }
    } catch (e) {
      err('REDIS_URL is not a valid URI')
    }
  }
}

const validateEnv = () => {
  checkRequired()
  checkSecretStrength()
  checkEmailProviderConfig()
  checkRedisConfig()
}

const corsOrigins = () => {
  const fromEnv = process.env.CORS_ORIGINS
  // Only trust origins we actually own: the configured FRONTEND_URL plus local
  // dev hosts. Production origins must be supplied explicitly via CORS_ORIGINS
  // (comma-separated) — we never bake in guessed public hostnames, since an
  // unowned origin combined with `credentials: true` is a real CSRF/creds risk.
  const defaults = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://localhost:3000',
  ]
  if (fromEnv && fromEnv.trim()) {
    const parsed = fromEnv.split(',').map((v) => v.trim()).filter(Boolean)
    return Array.from(new Set([...parsed, ...defaults]))
  }
  return Array.from(new Set(defaults))
}

module.exports = {
  validateEnv,
  isProduction,
  corsOrigins,
}
