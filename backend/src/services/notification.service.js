const nodemailer = require('nodemailer')
const logger = require('../config/logger')
const prisma = require('../config/db')
const { createId } = require('@paralleldrive/cuid2')

// 1. CONFIGURATION SANITIZATION
const cleanUser = String(process.env.SMTP_USER || '').trim()
const cleanPass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '')
const smtpHost = String(process.env.SMTP_HOST || '').trim()
const smtpPort = Number(process.env.SMTP_PORT || '587')
const smtpFromAddress = process.env.SMTP_FROM || cleanUser
const smtpFromName = String(process.env.SMTP_FROM_NAME || 'UniFi').trim()
const smtpFrom = smtpFromAddress.includes('<') ? smtpFromAddress : `${smtpFromName} <${smtpFromAddress}>`

const isProduction = (process.env.NODE_ENV || 'development') === 'production'
const strictEmailDelivery = String(process.env.SMTP_STRICT || (isProduction ? 'true' : 'false')).toLowerCase() === 'true'
// Only disable TLS verification when explicitly opted-in for local dev. Never in production.
const allowSelfSignedTls = !isProduction && String(process.env.SMTP_ALLOW_SELF_SIGNED || 'false').toLowerCase() === 'true'
const smtpConfigured = Boolean(cleanUser && cleanPass && smtpHost)

// 2. TRANSPORTER CREATION
const createGmailTransporter = () =>
  nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: cleanUser, pass: cleanPass },
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 5000,
    tls: { rejectUnauthorized: !allowSelfSignedTls },
  })

const createCustomTransporter = () =>
  nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: cleanUser, pass: cleanPass },
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 5000,
    tls: { rejectUnauthorized: !allowSelfSignedTls },
  })

// 3. SMTP TRANSMISSION WITH AUTOMATIC TRANSPORT RETRY
const sendMailViaSmtp = async ({ to, subject, text, html }) => {
  if (!smtpConfigured) {
    throw new Error('SMTP not configured (SMTP_USER/SMTP_PASS/SMTP_HOST missing)')
  }
  const mailOptions = { from: smtpFrom, to, subject, text, html }
  const isGmail = /gmail\.com$/i.test(cleanUser) || /smtp\.gmail\.com/i.test(smtpHost)

  // Strategy 1: Direct Gmail SSL Port 465
  if (isGmail) {
    try {
      const transporter = createGmailTransporter()
      const info = await transporter.sendMail(mailOptions)
      logger.info(`SMTP direct delivery success to ${to} (messageId=${info.messageId || 'n/a'})`)
      return info
    } catch (err) {
      logger.warn(`SMTP Gmail 465 failed to ${to}: ${err.message}`)
    }
  }

  // Strategy 2: Configured Host (Custom / Fallback)
  try {
    const transporter = createCustomTransporter()
    const info = await transporter.sendMail(mailOptions)
    logger.info(`SMTP custom host delivery success to ${to} (messageId=${info.messageId || 'n/a'})`)
    return info
  } catch (err) {
    logger.error(`SMTP custom host failed to ${to}: ${err.message}`)
    throw err
  }
}

// 4. API FALLBACK PROVIDERS (RESEND, BREVO, MAILJET)
const sendMailViaResendApi = async ({ to, subject, text, html }) => {
  const resendKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!resendKey) throw new Error('RESEND_API_KEY not set')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: `${smtpFromName} <onboarding@resend.dev>`,
      to: [to],
      subject,
      html,
      text,
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Resend API ${res.status}: ${raw.slice(0, 180)}`)
  const parsed = raw ? JSON.parse(raw) : null
  return { messageId: parsed?.id || 'resend-sent', response: `Resend API ${res.status}` }
}

const sendMailViaBrevoApi = async ({ to, subject, text, html }) => {
  const brevoApiKey = String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()
  if (!brevoApiKey) throw new Error('BREVO_API_KEY not set')

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': brevoApiKey,
    },
    body: JSON.stringify({
      sender: { email: smtpFromAddress, name: smtpFromName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Brevo API ${res.status}: ${raw.slice(0, 180)}`)
  const parsed = raw ? JSON.parse(raw) : null
  return { messageId: parsed?.messageId || null, response: `Brevo API ${res.status}` }
}

const sendMailViaMailjetApi = async ({ to, subject, text, html }) => {
  // Only use Mailjet's own credentials. Never fall back to SMTP_USER/SMTP_PASS:
  // sending an SMTP password as HTTP Basic auth to a different provider leaks
  // the credential to a third party and always fails authentication.
  const key = String(process.env.MAILJET_API_KEY || '').trim()
  const secret = String(process.env.MAILJET_API_SECRET || '').trim()
  if (!key || !secret) throw new Error('MAILJET_API_KEY/SECRET not set')

  const auth = Buffer.from(`${key}:${secret}`).toString('base64')
  const res = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      Messages: [{ From: { Email: smtpFromAddress, Name: smtpFromName }, To: [{ Email: to }], Subject: subject, TextPart: text, HTMLPart: html }],
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Mailjet API ${res.status}: ${raw.slice(0, 180)}`)
  return { messageId: 'mailjet-sent', response: `Mailjet API ${res.status}` }
}

// 4b. GOOGLE APPS SCRIPT RELAY
// Third-party ESPs cannot authenticate a gmail.com From domain, so messages sent
// as unifi.campus@gmail.com through Mailjet/Brevo fail DMARC alignment and get
// filtered (Gmail files them under Spam, Microsoft 365 - which lpu.in uses -
// quarantines them). An Apps Script web app runs inside the Google account and
// hands the message to Gmail's own infrastructure, so SPF and DKIM align and the
// mail is delivered like any normal Gmail message.
//
// The script is opt-in: set GMAIL_SCRIPT_URL (the /exec deployment URL) and
// GMAIL_SCRIPT_SECRET (shared string the script compares against).
const sendMailViaGmailScript = async ({ to, subject, text, html }) => {
  const url = String(process.env.GMAIL_SCRIPT_URL || '').trim()
  const secret = String(process.env.GMAIL_SCRIPT_SECRET || '').trim()
  if (!url) throw new Error('GMAIL_SCRIPT_URL not set')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, to, subject, text, html }),
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  })
  const raw = (await res.text()).trim()
  if (!res.ok) throw new Error(`Gmail script ${res.status}: ${raw.slice(0, 180)}`)
  if (!/^ok\b/i.test(raw)) throw new Error(`Gmail script rejected: ${raw.slice(0, 120)}`)
  return { messageId: `gmail-script-${Date.now()}`, response: 'Apps Script 200' }
}

// 5. PROVIDER SELECTION
// EMAIL_PROVIDER chooses which transport is tried FIRST; the others always
// remain in the chain as automatic fallbacks so a single provider outage never
// blocks OTP delivery. SMTP is the implicit default and is always kept.
const EMAIL_SENDERS = {
  SMTP: sendMailViaSmtp,
  RESEND_API: sendMailViaResendApi,
  BREVO_API: sendMailViaBrevoApi,
  MAILJET_API: sendMailViaMailjetApi,
  GMAIL_SCRIPT: sendMailViaGmailScript,
}

const providerOrder = () => {
  const configured = String(process.env.EMAIL_PROVIDER || 'SMTP').trim().toUpperCase()
  const preferred = EMAIL_SENDERS[configured] ? configured : 'SMTP'

  // Only try providers whose own credentials exist. Blindly falling through
  // the whole list wastes time and can leak/mix credentials across providers.
  const hasCreds = {
    SMTP: Boolean(String(process.env.SMTP_USER || '').trim() && String(process.env.SMTP_PASS || '').trim() && String(process.env.SMTP_HOST || '').trim()),
    RESEND_API: Boolean(String(process.env.RESEND_API_KEY || '').trim()),
    BREVO_API: Boolean(String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()),
    MAILJET_API: Boolean(String(process.env.MAILJET_API_KEY || '').trim() && String(process.env.MAILJET_API_SECRET || '').trim()),
    GMAIL_SCRIPT: Boolean(String(process.env.GMAIL_SCRIPT_URL || '').trim()),
  }
  const ready = ['SMTP', 'GMAIL_SCRIPT', 'RESEND_API', 'BREVO_API', 'MAILJET_API'].filter((k) => hasCreds[k])
  if (!ready.length) return [preferred]
  return [preferred, ...ready.filter((k) => k !== preferred)]
}

// 5b. RETRY HELPER
// Transient provider/network errors (DNS blips, 5xx) are common; retrying twice
// with linear backoff meaningfully improves OTP delivery without hammering the
// provider.
const emailSendAttempts = Math.min(
  Math.max(Number(process.env.EMAIL_SEND_RETRIES || 3), 1),
  5
)

const withRetry = async (fn, attempts = emailSendAttempts, baseDelayMs = 250) => {
  let lastErr
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt))
      }
    }
  }
  throw lastErr
}

// 6. PRIMARY EMAIL DISPATCHER
const sendOtpEmail = async (email, otp, purpose, options = {}) => {
  if (!email) return { sent: false, channel: 'email', error: 'missing_email' }
  const strict = Object.prototype.hasOwnProperty.call(options, 'strict') ? Boolean(options.strict) : strictEmailDelivery

  const subjects = { EMAIL_VERIFY: 'Verify your UniFi email', LOGIN: 'Your UniFi login OTP', ADMIN_2FA: 'UniFi Admin 2FA Code', PASSWORD_RESET: 'Reset your UniFi password' }
  const subject = subjects[purpose] || 'UniFi Verification Code'
  const text = `Your UniFi verification code is ${otp}. It expires in 10 minutes. If you did not request this, please ignore.`
  const html = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#c9a84c;font-size:26px;margin:0;font-weight:800;letter-spacing:1px;">UniFi</h1>
        <p style="color:#64748b;font-size:13px;margin-top:4px;">Campus Peer-to-Peer Micro-Lending Platform</p>
      </div>
      <div style="background:#f8fafc;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
        <p style="color:#334155;font-size:14px;margin-bottom:12px;font-weight:600;">Your One-Time Passcode (OTP):</p>
        <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#0f172a;background:#ffffff;border:1px dashed #cbd5e1;padding:12px 20px;border-radius:10px;display:inline-block;">${otp}</div>
        <p style="color:#64748b;font-size:12px;margin-top:12px;">Valid for 10 minutes • Do not share with anyone</p>
      </div>
      <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0;">If you did not request this code, you can safely ignore this email.</p>
    </div>
  `

  // Try the configured provider first, then the remaining providers in turn.
  const payload = { to: email, subject, text, html }
  const order = providerOrder()
  let lastErr = null

  for (let i = 0; i < order.length; i++) {
    const key = order[i]
    try {
      const info = await withRetry(() => EMAIL_SENDERS[key](payload))
      if (i > 0) logger.info(`OTP sent to ${email} via ${key} (fallback from ${order[0]})`)
      return { sent: true, channel: 'email', provider: key, response: info.response, messageId: info.messageId }
    } catch (e) {
      lastErr = e
      logger.warn(`Email via ${key} failed for ${email}: ${e.message}`)
    }
  }

  if (strict) throw lastErr || new Error('All email providers failed')
  return { sent: false, channel: 'email', error: lastErr?.message || 'all_email_providers_failed' }
}

// 7. SMS DISPATCHER
// Real SMS is opt-in via SMS_PROVIDER=TWILIO + credentials. Without them the
// platform stays in mock mode (email OTP is the working channel) so a missing
// Twilio account never blocks login.
const smsProviderName = String(process.env.SMS_PROVIDER || 'MOCK').trim().toUpperCase()
const twilioAccountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim()
const twilioAuthToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim()
const twilioFromNumber = String(process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM || '').trim()
const smsStrict = String(process.env.SMS_STRICT || 'false').toLowerCase() === 'true'
const smsRealEnabled =
  smsProviderName === 'TWILIO' && Boolean(twilioAccountSid && twilioAuthToken && twilioFromNumber)

const sendOtpSms = async (phone, otp, purpose, options = {}) => {
  if (!phone) return { sent: false, channel: 'sms', error: 'missing_phone' }

  // Never log the OTP value itself — logs are not a secure channel and a leaked
  // OTP defeats email/2FA/reset security. Log only that an attempt was made.
  if (!smsRealEnabled) {
    logger.info(`Mock SMS OTP dispatch to ${phone} (${purpose})`)
    return { sent: false, channel: 'sms', provider: 'MOCK', error: 'sms_mock_mode' }
  }

  const params = new URLSearchParams({
    To: phone,
    From: twilioFromNumber,
    Body: `Your UniFi verification code is ${otp}. It expires in 10 minutes. Do not share it with anyone.`,
  })
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
        },
        body: params,
      }
    )
    const raw = await res.text()
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${raw.slice(0, 180)}`)
    const parsed = raw ? JSON.parse(raw) : null
    return { sent: true, channel: 'sms', provider: 'TWILIO', messageId: parsed?.sid || null }
  } catch (e) {
    logger.warn(`SMS via TWILIO failed for ${phone}: ${e.message}`)
    if (options.strict) throw e
    return { sent: false, channel: 'sms', provider: 'TWILIO', error: e.message }
  }
}

const sendOtpChannels = async ({ email, phone, otp, purpose }) => {
  const [emailResult, smsResult] = await Promise.all([
    // strictEmailDelivery surfaces an explicit failure (instead of a silent
    // "sent:false" record) so ops can detect a broken mail provider; the caller
    // catches it and logs without blocking signup.
    sendOtpEmail(email, otp, purpose, { strict: strictEmailDelivery }),
    sendOtpSms(phone, otp, purpose, { strict: smsStrict }),
  ])
  return {
    sentAny: Boolean(emailResult?.sent || smsResult?.sent),
    email: emailResult,
    sms: smsResult,
  }
}

const createNotification = async (userId, type, title, body, data = {}) => {
  try {
    await prisma.notification.create({ data: { id: createId(), userId, type, title, body, data } })
  } catch (e) {
    logger.error(`Notification creation failed: ${e.message}`)
  }
}

module.exports = { sendOtpEmail, sendOtpSms, sendOtpChannels, createNotification, smsRealEnabled, emailSendAttempts }
