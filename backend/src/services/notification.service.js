const nodemailer = require('nodemailer')
const logger = require('../config/logger')
const prisma = require('../config/db')
const { createId } = require('@paralleldrive/cuid2')

// 1. CONFIGURATION SANITIZATION
const cleanUser = String(process.env.SMTP_USER || 'unifi.campus@gmail.com').trim()
const cleanPass = String(process.env.SMTP_PASS || 'ugijhnzsjhbqwmmb').replace(/\s+/g, '')
const smtpHost = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim()
const smtpPort = Number(process.env.SMTP_PORT || '465')
const smtpFromAddress = process.env.SMTP_FROM || `${cleanUser}`
const smtpFromName = String(process.env.SMTP_FROM_NAME || 'UniFi').trim()
const smtpFrom = smtpFromAddress.includes('<') ? smtpFromAddress : `${smtpFromName} <${smtpFromAddress}>`

const isProduction = (process.env.NODE_ENV || 'development') === 'production'
const strictEmailDelivery = String(process.env.SMTP_STRICT || (isProduction ? 'true' : 'false')).toLowerCase() === 'true'

// 2. TRANSPORTER CREATION (ENFORCE PORT 465 DIRECT SSL FOR GMAIL)
const createGmailTransporter = () =>
  nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: cleanUser, pass: cleanPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: false },
  })

const createCustomTransporter = () =>
  nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: cleanUser, pass: cleanPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: false },
  })

// 3. SMTP TRANSMISSION WITH AUTOMATIC TRANSPORT RETRY
const sendMailViaSmtp = async (mailOptions) => {
  const isGmail = /gmail\.com$/i.test(cleanUser) || /smtp\.gmail\.com/i.test(smtpHost)
  
  // Strategy 1: Direct Gmail SSL Port 465
  if (isGmail) {
    try {
      const transporter = createGmailTransporter()
      const info = await transporter.sendMail(mailOptions)
      logger.info(`SMTP direct delivery success to ${mailOptions.to} (messageId=${info.messageId || 'n/a'})`)
      return info
    } catch (err) {
      logger.warn(`SMTP Gmail 465 failed to ${mailOptions.to}: ${err.message}`)
    }
  }

  // Strategy 2: Configured Host (Custom / Fallback)
  try {
    const transporter = createCustomTransporter()
    const info = await transporter.sendMail(mailOptions)
    logger.info(`SMTP custom host delivery success to ${mailOptions.to} (messageId=${info.messageId || 'n/a'})`)
    return info
  } catch (err) {
    logger.error(`SMTP custom host failed to ${mailOptions.to}: ${err.message}`)
    throw err
  }
}

// 4. API FALLBACK PROVIDERS (BREVO & MAILJET)
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
      sender: { email: cleanUser, name: smtpFromName },
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
      Messages: [{ From: { Email: cleanUser, Name: smtpFromName }, To: [{ Email: to }], Subject: subject, TextPart: text, HTMLPart: html }],
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Mailjet API ${res.status}: ${raw.slice(0, 180)}`)
  return { messageId: 'mailjet-sent', response: `Mailjet API ${res.status}` }
}

// 5. PRIMARY EMAIL DISPATCHER
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

  // Primary Dispatch: SMTP (Direct Gmail SSL)
  try {
    const info = await sendMailViaSmtp({ from: smtpFrom, to: email, subject, text, html })
    return { sent: true, channel: 'email', provider: 'SMTP', response: info.response, messageId: info.messageId }
  } catch (smtpErr) {
    logger.warn(`Primary SMTP failed for ${email}: ${smtpErr.message}`)

    // Fallback 1: Brevo API
    try {
      const info = await sendMailViaBrevoApi({ to: email, subject, text, html })
      return { sent: true, channel: 'email', provider: 'BREVO_API', response: info.response, messageId: info.messageId }
    } catch (_bErr) {}

    // Fallback 2: Mailjet API
    try {
      const info = await sendMailViaMailjetApi({ to: email, subject, text, html })
      return { sent: true, channel: 'email', provider: 'MAILJET_API', response: info.response, messageId: info.messageId }
    } catch (_mErr) {}

    if (strict) throw smtpErr
    return { sent: false, channel: 'email', error: smtpErr.message }
  }
}

// 6. SMS DISPATCHER
const sendOtpSms = async (phone, otp, purpose, options = {}) => {
  if (!phone) return { sent: false, channel: 'sms', error: 'missing_phone' }
  logger.info(`Mock SMS OTP sent to ${phone}: ${otp} (${purpose})`)
  return { sent: false, channel: 'sms', provider: 'MOCK', error: 'sms_mock_mode' }
}

const sendOtpChannels = async ({ email, phone, otp, purpose }) => {
  const [emailResult, smsResult] = await Promise.all([
    sendOtpEmail(email, otp, purpose, { strict: false }),
    sendOtpSms(phone, otp, purpose, { strict: false }),
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

module.exports = { sendOtpEmail, sendOtpSms, sendOtpChannels, smsRealEnabled: false, createNotification }
