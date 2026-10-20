#!/usr/bin/env node
/**
 * Provider-agnostic mail smoke test.
 *
 * `smtp:test` only proves the SMTP credentials; this goes through the exact
 * dispatcher the app uses in production (`sendOtpEmail`), so it exercises the
 * configured provider, the fallback chain and the retry wrapper.
 *
 * Usage:
 *   npm run mail:test -- you@example.com
 */
require('dotenv').config()

const { sendOtpEmail } = require('../services/notification.service')

const to = process.argv[2] || process.env.MAIL_TEST_TO || process.env.SMTP_FROM
if (!to) {
  console.error('Missing recipient. Usage: npm run mail:test -- you@example.com')
  process.exit(1)
}

const configured = [
  ['SMTP', Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)],
  ['RESEND_API', Boolean(String(process.env.RESEND_API_KEY || '').trim())],
  ['BREVO_API', Boolean(String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim())],
  ['MAILJET_API', Boolean(String(process.env.MAILJET_API_KEY || '').trim() && String(process.env.MAILJET_API_SECRET || '').trim())],
]

console.log(`sender          : ${process.env.SMTP_FROM || '(unset)'}`)
console.log(`preferred       : ${process.env.EMAIL_PROVIDER || 'SMTP'}`)
console.log('configured      :')
for (const [name, ok] of configured) console.log(`  ${ok ? 'yes' : 'no '}  ${name}`)
console.log(`recipient       : ${to}`)
console.log('')

const startedAt = Date.now()

sendOtpEmail(to, '000000', 'EMAIL_VERIFY', { strict: true })
  .then((result) => {
    console.log(`PASS: delivered via ${result.provider} in ${Date.now() - startedAt}ms`)
    console.log(`messageId: ${result.messageId || '(none)'}`)
    process.exit(0)
  })
  .catch((e) => {
    console.error(`FAIL: ${e.message}`)
    console.error(`(after ${Date.now() - startedAt}ms)`)
    process.exit(1)
  })
