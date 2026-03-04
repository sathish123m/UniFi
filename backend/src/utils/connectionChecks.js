const prisma = require('../config/db')
const redis = require('../config/redis')
const nodemailer = require('nodemailer')
const logger = require('../config/logger')
const { paymentProvider } = require('../config/env')

const tryWithRetries = async (fn, { retries = 3, delay = 1000, factor = 2, name = 'task' } = {}) => {
  let attempt = 0
  let lastErr
  while (attempt < retries) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      attempt += 1
      logger.warn(`${name} attempt ${attempt} failed: ${e.message}`)
      if (attempt < retries) {
        const wait = delay * Math.pow(factor, attempt - 1)
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, wait))
      }
    }
  }
  const err = new Error(`${name} failed after ${retries} attempts: ${lastErr?.message || 'unknown'}`)
  err.cause = lastErr
  throw err
}

const checkPrisma = async () => {
  // Prisma will lazily connect on first query but calling $connect ensures we have DB connectivity now
  await tryWithRetries(() => prisma.$connect(), { retries: 3, delay: 1000, factor: 2, name: 'Prisma connect' })
  logger.info('✅ Prisma connected')
}

const checkRedis = async () => {
  try {
    if (redis.status === 'ready') {
      logger.info('✅ Redis already ready')
      return
    }
  } catch (e) {
    // ignore
  }

  await tryWithRetries(() => redis.connect(), { retries: 4, delay: 500, factor: 2, name: 'Redis connect' })
  try {
    const pong = await redis.ping()
    logger.info(`✅ Redis ping: ${pong}`)
  } catch (e) {
    logger.warn(`Redis ping failed: ${e.message}`)
  }
}

const checkSmtp = async () => {
  const smtpVerifyOnStartup = String(process.env.SMTP_VERIFY_ON_STARTUP || 'false').toLowerCase() === 'true'
  if (!smtpVerifyOnStartup) {
    logger.info('SMTP verify skipped on startup (SMTP_VERIFY_ON_STARTUP=false)')
    return
  }

  const smtpPort = Number(process.env.SMTP_PORT || '587')
  const smtpSecure = process.env.SMTP_SECURE
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : smtpPort === 465
  const smtpConnectionTimeoutMs = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || '12000')
  const smtpGreetingTimeoutMs = Number(process.env.SMTP_GREETING_TIMEOUT_MS || '10000')
  const smtpSocketTimeoutMs = Number(process.env.SMTP_SOCKET_TIMEOUT_MS || '15000')

  const smtpHost = process.env.SMTP_HOST
  const smtpRequireTls = String(process.env.SMTP_REQUIRE_TLS || 'false').toLowerCase() === 'true'

  const buildTransport = ({ host, port, secure, requireTLS }) => nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout: smtpConnectionTimeoutMs,
    greetingTimeout: smtpGreetingTimeoutMs,
    socketTimeout: smtpSocketTimeoutMs,
    requireTLS,
    tls: {
      rejectUnauthorized: String(process.env.SMTP_ALLOW_SELF_SIGNED || 'false').toLowerCase() !== 'true',
    },
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  // SMTP is non-critical: try a couple of times but don't blow up the whole process if it fails
  try {
    const transporter = buildTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: smtpRequireTls,
    })
    await tryWithRetries(() => transporter.verify(), { retries: 2, delay: 1000, factor: 2, name: 'SMTP verify' })
    logger.info('✅ SMTP verified')
  } catch (e) {
    const canFallbackToGmailStarttls =
      /smtp\.gmail\.com/i.test(String(smtpHost || '')) &&
      smtpPort === 465 &&
      smtpSecure
    if (!canFallbackToGmailStarttls) {
      logger.warn(`SMTP verification failed: ${e.message}`)
      return
    }
    try {
      logger.warn('SMTP verify failed on 465. Retrying Gmail STARTTLS on 587...')
      const fallbackTransporter = buildTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
      })
      await tryWithRetries(() => fallbackTransporter.verify(), { retries: 2, delay: 1000, factor: 2, name: 'SMTP verify fallback' })
      logger.info('✅ SMTP verified (fallback 587)')
    } catch (fallbackError) {
      logger.warn(`SMTP verification failed: ${fallbackError.message}`)
    }
  }
}

const checkPaymentProvider = async () => {
  const provider = paymentProvider()
  if (provider === 'RAZORPAY') {
    // env.validateEnv already checks credentials; here we only log presence
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials missing')
    }
    logger.info('✅ Razorpay configured')
  } else {
    logger.info(`Payment provider: ${provider}`)
  }
}

const checkAndConnectAll = async () => {
  // Prisma and Redis are critical for the app; SMTP/payment are best-effort
  await checkPrisma()
  await checkRedis()
  await checkPaymentProvider()
  await checkSmtp()
}

module.exports = { checkAndConnectAll, tryWithRetries }
