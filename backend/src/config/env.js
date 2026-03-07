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

const checkPaymentSecrets = () => {
  const provider = (process.env.PAYMENT_PROVIDER || 'MOCK').toUpperCase()
  if (provider === 'RAZORPAY') {
    if (!process.env.RAZORPAY_KEY_ID) err('RAZORPAY_KEY_ID is required when PAYMENT_PROVIDER=RAZORPAY')
    if (!process.env.RAZORPAY_KEY_SECRET) err('RAZORPAY_KEY_SECRET is required when PAYMENT_PROVIDER=RAZORPAY')
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) err('RAZORPAY_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=RAZORPAY')
    if ((process.env.RAZORPAY_KEY_ID || '').length < 12) err('RAZORPAY_KEY_ID looks invalid')
    if ((process.env.RAZORPAY_KEY_SECRET || '').length < 12) err('RAZORPAY_KEY_SECRET looks invalid')
    if ((process.env.RAZORPAY_WEBHOOK_SECRET || '').length < 8) err('RAZORPAY_WEBHOOK_SECRET looks invalid')
    if (
      /PASTE_/i.test(process.env.RAZORPAY_KEY_ID || '') ||
      /PASTE_/i.test(process.env.RAZORPAY_KEY_SECRET || '') ||
      /PASTE_/i.test(process.env.RAZORPAY_WEBHOOK_SECRET || '')
    ) {
      err('Replace Razorpay placeholder values with your Razorpay TEST credentials')
    }
  }
}

const checkEmailProviderConfig = () => {
  const provider = String(process.env.EMAIL_PROVIDER || 'SMTP').trim().toUpperCase()
  if (!['SMTP', 'BREVO_API', 'MAILJET_API'].includes(provider)) {
    err('EMAIL_PROVIDER must be SMTP, BREVO_API or MAILJET_API')
  }

  if (provider === 'BREVO_API') {
    const key = String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()
    if (!key) err('BREVO_API_KEY is required when EMAIL_PROVIDER=BREVO_API')
    if (key.length < 20 || /PASTE_/i.test(key)) err('BREVO_API_KEY looks invalid')
  }

  if (provider === 'MAILJET_API') {
    const key = String(process.env.MAILJET_API_KEY || process.env.SMTP_USER || '').trim()
    const secret = String(process.env.MAILJET_API_SECRET || process.env.SMTP_PASS || '').trim()
    if (!key) err('MAILJET_API_KEY is required when EMAIL_PROVIDER=MAILJET_API')
    if (!secret) err('MAILJET_API_SECRET is required when EMAIL_PROVIDER=MAILJET_API')
    if (key.length < 20 || /PASTE_/i.test(key)) err('MAILJET_API_KEY looks invalid')
    if (secret.length < 20 || /PASTE_/i.test(secret)) err('MAILJET_API_SECRET looks invalid')
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
  checkPaymentSecrets()
  checkEmailProviderConfig()
  checkRedisConfig()
}

const corsOrigins = () => {
  const fromEnv = process.env.CORS_ORIGINS
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.split(',').map((v) => v.trim()).filter(Boolean)
  }
  return [process.env.FRONTEND_URL || 'http://localhost:5173']
}

const paymentProvider = () => (process.env.PAYMENT_PROVIDER || 'MOCK').toUpperCase()

module.exports = {
  validateEnv,
  isProduction,
  corsOrigins,
  paymentProvider,
}
