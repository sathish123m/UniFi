const nodemailer = require('nodemailer')
const logger = require('../config/logger')
const prisma = require('../config/db')
const { createId } = require('@paralleldrive/cuid2')

const smtpPort = Number(process.env.SMTP_PORT || '587')
const smtpSecure = process.env.SMTP_SECURE
  ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
  : smtpPort === 465
const isProduction = (process.env.NODE_ENV || 'development') === 'production'
const strictEmailDelivery =
  String(process.env.SMTP_STRICT || (isProduction ? 'true' : 'false')).toLowerCase() === 'true'
const smtpFromAddress = process.env.SMTP_FROM || 'noreply@unifi.campus'
const smtpFromName = String(process.env.SMTP_FROM_NAME || 'UniFi').trim() || 'UniFi'
const smtpFrom = smtpFromAddress.includes('<') ? smtpFromAddress : `${smtpFromName} <${smtpFromAddress}>`
const smsProvider = String(process.env.SMS_PROVIDER || 'MOCK').trim().toUpperCase()
const strictSmsDelivery = String(process.env.SMS_STRICT || 'false').toLowerCase() === 'true'
const smsRealEnabled = smsProvider === 'TWILIO'
if (
  /mailjet/i.test(String(process.env.SMTP_HOST || '')) &&
  /@gmail\.com$/i.test(String(smtpFromAddress).trim())
) {
  logger.warn('SMTP_FROM uses gmail.com with Mailjet. This can fail DMARC at recipient. Prefer custom domain or Gmail SMTP.')
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: smtpPort,
  secure: smtpSecure,
  requireTLS: String(process.env.SMTP_REQUIRE_TLS || 'false').toLowerCase() === 'true',
  tls: {
    rejectUnauthorized: String(process.env.SMTP_ALLOW_SELF_SIGNED || 'false').toLowerCase() !== 'true',
  },
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

const normalizePhone = (phone) => String(phone || '').trim().replace(/\s+/g, '')

const sendOtpEmail = async (email, otp, purpose, options = {}) => {
  if (!email) return { sent: false, channel: 'email', error: 'missing_email' }
  const strict = Object.prototype.hasOwnProperty.call(options, 'strict')
    ? Boolean(options.strict)
    : strictEmailDelivery
  const subjects = { EMAIL_VERIFY:'Verify your UniFi email', LOGIN:'Your UniFi login OTP', UPI_VERIFY:'Verify your UPI ID' }
  const subject = subjects[purpose] || 'UniFi OTP'
  const text = `Your UniFi OTP is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`
  try {
    const info = await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject,
      text,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111;">
          <h2 style="margin-bottom:8px;">UniFi OTP</h2>
          <p>Your one-time password is:</p>
          <p style="font-size:30px;font-weight:700;letter-spacing:4px;margin:8px 0;">${otp}</p>
          <p>This OTP expires in 10 minutes.</p>
          <p style="font-size:12px;color:#666;">If you did not request this, ignore this email.</p>
        </div>
      `,
    })
    logger.info(`OTP sent to ${email} (messageId=${info.messageId || 'n/a'}, response=${info.response || 'n/a'})`)
    return { sent: true, channel: 'email', response: info.response, messageId: info.messageId }
  } catch(e) {
    logger.warn(`Email failed (${email}): ${e.message}`)
    if (strict) throw e
    if (process.env.NODE_ENV === 'development') logger.info(`DEV OTP for ${email}: ${otp}`)
    return { sent: false, channel: 'email', error: e.message }
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
