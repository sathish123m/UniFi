const nodemailer = require('nodemailer')
const logger = require('../config/logger')
const prisma = require('../config/db')
const { createId } = require('@paralleldrive/cuid2')

const emailProvider = String(process.env.EMAIL_PROVIDER || 'SMTP').trim().toUpperCase()
const smtpPort = Number(process.env.SMTP_PORT || '587')
const smtpSecure = process.env.SMTP_SECURE
  ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
  : smtpPort === 465
const smtpConnectionTimeoutMs = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || '12000')
const smtpGreetingTimeoutMs = Number(process.env.SMTP_GREETING_TIMEOUT_MS || '10000')
const smtpSocketTimeoutMs = Number(process.env.SMTP_SOCKET_TIMEOUT_MS || '15000')
const isProduction = (process.env.NODE_ENV || 'development') === 'production'
const strictEmailDelivery =
  String(process.env.SMTP_STRICT || (isProduction ? 'true' : 'false')).toLowerCase() === 'true'
const smtpFromAddress = process.env.SMTP_FROM || 'noreply@unifi.campus'
const smtpFromName = String(process.env.SMTP_FROM_NAME || 'UniFi').trim() || 'UniFi'
const smtpFrom = smtpFromAddress.includes('<') ? smtpFromAddress : `${smtpFromName} <${smtpFromAddress}>`
const smtpFromEmail = (() => {
  const raw = String(smtpFromAddress || '').trim()
  const match = raw.match(/<([^>]+)>/)
  return (match ? match[1] : raw) || 'noreply@unifi.campus'
})()
const smsProvider = String(process.env.SMS_PROVIDER || 'MOCK').trim().toUpperCase()
const strictSmsDelivery = String(process.env.SMS_STRICT || 'false').toLowerCase() === 'true'
const smsRealEnabled = smsProvider === 'TWILIO'
const brevoApiKey = String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()
const brevoApiEnabled = Boolean(brevoApiKey)
const brevoSenderEmail = String(process.env.BREVO_SENDER_EMAIL || '').trim() || smtpFromEmail
const brevoSenderName = String(process.env.BREVO_SENDER_NAME || '').trim() || smtpFromName
const mailjetApiKey = String(process.env.MAILJET_API_KEY || process.env.SMTP_USER || '').trim()
const mailjetApiSecret = String(process.env.MAILJET_API_SECRET || process.env.SMTP_PASS || '').trim()
const mailjetApiEnabled = Boolean(mailjetApiKey && mailjetApiSecret)
const mailjetSenderEmail = String(process.env.MAILJET_SENDER_EMAIL || '').trim() || smtpFromEmail
const mailjetSenderName = String(process.env.MAILJET_SENDER_NAME || '').trim() || smtpFromName
if (
  /mailjet/i.test(String(process.env.SMTP_HOST || '')) &&
  /@gmail\.com$/i.test(String(smtpFromAddress).trim())
) {
  logger.warn('SMTP_FROM uses gmail.com with Mailjet. This can fail DMARC at recipient. Prefer custom domain or Gmail SMTP.')
}

const smtpHost = process.env.SMTP_HOST || 'smtp.mailtrap.io'

const createTransporter = ({ host, port, secure, requireTLS }) => nodemailer.createTransport({
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

const primaryRequireTLS = String(process.env.SMTP_REQUIRE_TLS || 'false').toLowerCase() === 'true'
const smtpCandidates = () => {
  const unique = new Set()
  const result = []
  const push = (cfg) => {
    const key = `${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.requireTLS}`
    if (unique.has(key)) return
    unique.add(key)
    result.push(cfg)
  }

  push({
    name: 'primary',
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: primaryRequireTLS,
  })

  const gmailHost = /smtp\.gmail\.com/i.test(String(smtpHost || ''))
  if (gmailHost) {
    push({
      name: 'gmail-starttls',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
    })
    push({
      name: 'gmail-ssl',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      requireTLS: false,
    })
  }

  return result
}

const sendMailViaSmtp = async (mailOptions) => {
  let lastError = null
  for (const candidate of smtpCandidates()) {
    try {
      const transporter = createTransporter(candidate)
      const info = await transporter.sendMail(mailOptions)
      if (candidate.name !== 'primary') {
        logger.warn(`SMTP delivery succeeded via fallback (${candidate.name})`)
      }
      return info
    } catch (error) {
      lastError = error
      logger.warn(
        `SMTP delivery failed via ${candidate.name} (${candidate.host}:${candidate.port}, secure=${candidate.secure}): ${error.message}`
      )
    }
  }
  throw lastError || new Error('SMTP delivery failed')
}

const sendMailViaBrevoApi = async ({ to, subject, text, html }) => {
  if (!brevoApiEnabled) throw new Error('BREVO_API_KEY is not configured')
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': brevoApiKey,
    },
    body: JSON.stringify({
      sender: {
        email: brevoSenderEmail,
        name: brevoSenderName,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    let details = raw
    try {
      const parsed = raw ? JSON.parse(raw) : null
      details = parsed?.message || parsed?.code || raw
    } catch {
      details = raw
    }
    throw new Error(`Brevo API ${response.status}: ${String(details || '').slice(0, 220)}`)
  }

  let parsed = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  return {
    messageId: parsed?.messageId || null,
    response: `Brevo API ${response.status}`,
  }
}

const sendMailViaMailjetApi = async ({ to, subject, text, html }) => {
  if (!mailjetApiEnabled) throw new Error('MAILJET_API_KEY/MAILJET_API_SECRET are not configured')
  const auth = Buffer.from(`${mailjetApiKey}:${mailjetApiSecret}`).toString('base64')
  const response = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      Messages: [
        {
          From: {
            Email: mailjetSenderEmail,
            Name: mailjetSenderName,
          },
          To: [{ Email: to }],
          Subject: subject,
          TextPart: text,
          HTMLPart: html,
        },
      ],
    }),
  })

  const raw = await response.text()
  if (!response.ok) throw new Error(`Mailjet API ${response.status}: ${raw.slice(0, 220)}`)

  let parsed = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  const first = parsed?.Messages?.[0]
  const firstTo = first?.To?.[0]
  return {
    messageId: firstTo?.MessageID || firstTo?.MessageUUID || null,
    response: `Mailjet API ${response.status}`,
    status: first?.Status || null,
  }
}

const normalizePhone = (phone) => String(phone || '').trim().replace(/\s+/g, '')

const sendOtpEmail = async (email, otp, purpose, options = {}) => {
  if (!email) return { sent: false, channel: 'email', error: 'missing_email' }
  const strict = Object.prototype.hasOwnProperty.call(options, 'strict')
    ? Boolean(options.strict)
    : strictEmailDelivery
  const subjects = { EMAIL_VERIFY:'Verify your UniFi email', LOGIN:'Your UniFi login OTP', UPI_VERIFY:'Verify your UPI ID' }
  const subject = subjects[purpose] || 'UniFi OTP'
  const text = `Your UniFi OTP is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111;">
      <h2 style="margin-bottom:8px;">UniFi OTP</h2>
      <p>Your one-time password is:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:4px;margin:8px 0;">${otp}</p>
      <p>This OTP expires in 10 minutes.</p>
      <p style="font-size:12px;color:#666;">If you did not request this, ignore this email.</p>
    </div>
  `

  try {
    if (emailProvider === 'MAILJET_API') {
      const info = await sendMailViaMailjetApi({
        to: email,
        subject,
        text,
        html,
      })
      logger.info(
        `OTP sent to ${email} via Mailjet API primary (messageId=${info.messageId || 'n/a'}, response=${info.response}, status=${info.status || 'n/a'})`
      )
      return {
        sent: true,
        channel: 'email',
        provider: 'MAILJET_API',
        response: info.response,
        messageId: info.messageId,
      }
    }

    if (emailProvider === 'BREVO_API') {
      const info = await sendMailViaBrevoApi({
        to: email,
        subject,
        text,
        html,
      })
      logger.info(
        `OTP sent to ${email} via Brevo API primary (messageId=${info.messageId || 'n/a'}, response=${info.response})`
      )
      return {
        sent: true,
        channel: 'email',
        provider: 'BREVO_API',
        response: info.response,
        messageId: info.messageId,
      }
    }

    const info = await sendMailViaSmtp({
      from: smtpFrom,
      to: email,
      subject,
      text,
      html,
    })
    logger.info(`OTP sent to ${email} (messageId=${info.messageId || 'n/a'}, response=${info.response || 'n/a'})`)
    return { sent: true, channel: 'email', response: info.response, messageId: info.messageId }
  } catch (smtpError) {
    logger.warn(`Email SMTP failed (${email}): ${smtpError.message}`)
    if (brevoApiEnabled) {
      try {
        const info = await sendMailViaBrevoApi({
          to: email,
          subject,
          text,
          html,
        })
        logger.info(
          `OTP sent to ${email} via Brevo API (messageId=${info.messageId || 'n/a'}, response=${info.response})`
        )
        return {
          sent: true,
          channel: 'email',
          provider: 'BREVO_API',
          response: info.response,
          messageId: info.messageId,
        }
      } catch (brevoError) {
        logger.warn(`Email Brevo fallback failed (${email}): ${brevoError.message}`)
        if (strict) throw brevoError
        if (process.env.NODE_ENV === 'development') logger.info(`DEV OTP for ${email}: ${otp}`)
        return { sent: false, channel: 'email', error: brevoError.message }
      }
    }
    if (strict) throw smtpError
    if (process.env.NODE_ENV === 'development') logger.info(`DEV OTP for ${email}: ${otp}`)
    return { sent: false, channel: 'email', error: smtpError.message }
  }
}

const sendOtpSms = async (phone, otp, purpose, options = {}) => {
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) return { sent: false, channel: 'sms', error: 'missing_phone' }
  const strict = Object.prototype.hasOwnProperty.call(options, 'strict')
    ? Boolean(options.strict)
    : strictSmsDelivery

  const body = `UniFi OTP: ${otp}. Valid for 10 minutes. Do not share this code.`

  try {
    if (smsProvider === 'MOCK') {
      logger.info(`MOCK SMS OTP (not sent) to ${normalizedPhone}: ${otp} (${purpose})`)
      return { sent: false, channel: 'sms', provider: 'MOCK', error: 'sms_mock_mode' }
    }

    if (smsProvider !== 'TWILIO') {
      throw new Error(`Unsupported SMS_PROVIDER=${smsProvider}`)
    }

    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM
    if (!sid || !token || !from) throw new Error('Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM')

    const payload = new URLSearchParams({
      To: normalizedPhone,
      From: from,
      Body: body,
    })

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    })

    const raw = await res.text()
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${raw.slice(0, 220)}`)

    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }

    logger.info(`OTP SMS sent to ${normalizedPhone} (provider=TWILIO, sid=${parsed?.sid || 'n/a'})`)
    return { sent: true, channel: 'sms', provider: 'TWILIO', sid: parsed?.sid || null }
  } catch (e) {
    logger.warn(`SMS failed (${normalizedPhone}): ${e.message}`)
    if (strict) throw e
    if (process.env.NODE_ENV === 'development') logger.info(`DEV SMS OTP for ${normalizedPhone}: ${otp}`)
    return { sent: false, channel: 'sms', error: e.message }
  }
}

const sendOtpChannels = async ({ email, phone, otp, purpose }) => {
  const [emailResult, smsResult] = await Promise.all([
    sendOtpEmail(email, otp, purpose, { strict: false }),
    sendOtpSms(phone, otp, purpose, { strict: false }),
  ])

  const sentAny = Boolean(emailResult?.sent || smsResult?.sent)
  return {
    sentAny,
    email: emailResult,
    sms: smsResult,
  }
}

const createNotification = async (userId, type, title, body, data={}) => {
  try {
    await prisma.notification.create({ data:{ id:createId(), userId, type, title, body, data } })
  } catch(e) { logger.error(`Notification failed: ${e.message}`) }
}

module.exports = { sendOtpEmail, sendOtpSms, sendOtpChannels, smsRealEnabled, createNotification }
