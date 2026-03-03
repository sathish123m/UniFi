require('dotenv').config()
const nodemailer = require('nodemailer')

const smtpPort = Number(process.env.SMTP_PORT || '587')
const smtpSecure = process.env.SMTP_SECURE
  ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
  : smtpPort === 465

const to = process.argv[2] || process.env.SMTP_TEST_TO || process.env.SMTP_FROM
if (!to) {
  console.error('Missing recipient. Usage: npm run smtp:test -- you@example.com')
  process.exit(1)
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpSecure,
  requireTLS: String(process.env.SMTP_REQUIRE_TLS || 'false').toLowerCase() === 'true',
  tls: {
    rejectUnauthorized: String(process.env.SMTP_ALLOW_SELF_SIGNED || 'false').toLowerCase() !== 'true',
  },
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

async function main() {
  await transporter.verify()
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'UniFi SMTP Test',
    text: 'SMTP credentials are working for UniFi.',
    html: '<p><b>UniFi SMTP Test</b><br/>SMTP credentials are working.</p>',
  })

  console.log('SMTP verify: OK')
  console.log(`Message ID: ${info.messageId}`)
}

main().catch((e) => {
  console.error('SMTP test failed:', e.message)
  process.exit(1)
})
