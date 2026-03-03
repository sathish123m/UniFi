require('dotenv').config()
const Razorpay = require('razorpay')

const provider = String(process.env.PAYMENT_PROVIDER || 'MOCK').toUpperCase()

if (provider !== 'RAZORPAY') {
  console.log('PAYMENT_PROVIDER is not RAZORPAY. Set PAYMENT_PROVIDER=RAZORPAY first.')
  process.exit(0)
}

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error('Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in .env')
  process.exit(1)
}

const amountInput = Number(process.argv[2] || '1')
if (!Number.isFinite(amountInput) || amountInput <= 0) {
  console.error('Usage: npm run payment:test -- 1')
  process.exit(1)
}

const amountPaise = Math.round(amountInput * 100)
const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

const normalizeMessage = (value) => {
  const text = String(value || '').trim()
  if (!text) return null
  if (/cannot read properties of undefined \(reading 'status'\)/i.test(text)) return null
  return text
}

const parseGatewayError = (cause) => {
  const status = Number(cause?.statusCode || cause?.status || cause?.response?.status || 0) || null
  const code = String(
    cause?.error?.code ||
      cause?.response?.data?.error?.code ||
      cause?.code ||
      ''
  ).trim() || null
  const description =
    normalizeMessage(cause?.error?.description) ||
    normalizeMessage(cause?.response?.data?.error?.description) ||
    normalizeMessage(cause?.message) ||
    null

  return { status, code, description }
}

async function main() {
  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: `unifi_test_${Date.now()}`,
    notes: {
      source: 'unifi-payment-test',
      env: process.env.NODE_ENV || 'development',
    },
  })

  console.log('Razorpay API: OK')
  console.log(`Created order: ${order.id}`)
  console.log(`Amount: INR ${(order.amount / 100).toFixed(2)} (${order.currency})`)
  console.log('No money is charged by creating an order. Charge happens only after checkout.')
}

main().catch((e) => {
  const info = parseGatewayError(e)
  console.error('Payment test failed.')
  if (!info.status) {
    console.error(`Reason: Unable to reach Razorpay API${info.code ? ` (${info.code})` : ''}`)
  } else if (info.status === 401 || info.status === 403) {
    console.error('Reason: Razorpay authentication failed. Check test key ID/secret.')
  } else if (info.description) {
    console.error(`Reason: ${info.description}`)
  } else {
    console.error(`Reason: Razorpay request failed (HTTP ${info.status})`)
  }
  process.exit(1)
})
