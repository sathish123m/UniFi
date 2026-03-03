const Razorpay = require('razorpay')
const crypto = require('crypto')
const prisma = require('../config/db')
const loanSvc = require('./loan.service')
const { createNotification } = require('./notification.service')
const { createId } = require('@paralleldrive/cuid2')
const { paymentProvider } = require('../config/env')

const provider = paymentProvider()
const isRazorpay = provider === 'RAZORPAY'
const verifyWithApi = String(process.env.RAZORPAY_VERIFY_API || 'true').toLowerCase() !== 'false'

const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder',
})

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code })

const normalizeRazorpayMessage = (value) => {
  const text = String(value || '').trim()
  if (!text) return null
  if (/cannot read properties of undefined \(reading 'status'\)/i.test(text)) return null
  return text
}

const parseRazorpayError = (cause) => {
  const status = Number(cause?.statusCode || cause?.status || cause?.response?.status || 0) || null
  const code = String(
    cause?.error?.code ||
      cause?.response?.data?.error?.code ||
      cause?.code ||
      ''
  ).trim() || null
  const description =
    normalizeRazorpayMessage(cause?.error?.description) ||
    normalizeRazorpayMessage(cause?.response?.data?.error?.description) ||
    normalizeRazorpayMessage(cause?.message) ||
    null

  return { status, code, description }
}

const gatewayError = (cause, context) => {
  const info = parseRazorpayError(cause)
  if (!info.status) {
    const reason = info.code ? ` (${info.code})` : ''
    return err(`${context}: unable to reach Razorpay${reason}`, 502)
  }
  if (info.status === 401 || info.status === 403) {
    return err(`${context}: Razorpay authentication failed`, 502)
  }
  if (info.status >= 500) {
    return err(`${context}: Razorpay service unavailable`, 502)
  }
  if (info.description) {
    return err(`${context}: ${info.description}`, 502)
  }
  return err(`${context}: Razorpay request failed (HTTP ${info.status})`, 502)
}

const VERIFY_TYPE = {
  FUNDING: 'FUNDING',
  REPAYMENT: 'REPAYMENT',
}

const TX_TYPE_BY_VERIFY = {
  [VERIFY_TYPE.FUNDING]: 'DISBURSEMENT',
  [VERIFY_TYPE.REPAYMENT]: 'REPAYMENT',
}

const getPublicPaymentConfig = () => ({
  provider,
  currency: 'INR',
  razorpayKeyId: isRazorpay ? process.env.RAZORPAY_KEY_ID : null,
  verifyWithApi: isRazorpay ? verifyWithApi : false,
})

const ensureRazorpayMode = () => {
  if (!isRazorpay) throw err('This action is only available when PAYMENT_PROVIDER=RAZORPAY', 400)
}

const normalizeVerifyType = (value) => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
  if (!Object.values(VERIFY_TYPE).includes(normalized)) throw err('Unsupported payment type', 422)
  return normalized
}

const assertFundingEligibility = async (loanId, providerId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan || loan.status !== 'FUNDED' || loan.providerId !== providerId) {
    throw err('Loan not available for funding payment')
  }
  return loan
}

const assertRepaymentEligibility = async (loanId, borrowerId) => {
  const loan = await loanSvc.refreshLoanDelinquency(loanId)
  if (!loan || !['ACTIVE', 'DEFAULTED'].includes(loan.status) || loan.borrowerId !== borrowerId) {
    throw err('Loan not available for repayment')
  }
  return loan
}

const upsertInitiatedTransaction = async ({ loanId, userId, type, amount, orderId, description, idempotencyKey }) => {
  const existing = await prisma.transaction.findFirst({
    where: {
      loanId,
      userId,
      type,
      status: { in: ['INITIATED', 'PENDING'] },
    },
    orderBy: { initiatedAt: 'desc' },
  })

  if (existing) {
    return prisma.transaction.update({
      where: { id: existing.id },
      data: {
        amount,
        rzpOrderId: orderId,
        idempotencyKey,
        description,
        failureReason: null,
      },
    })
  }

  return prisma.transaction.create({
    data: {
      id: createId(),
      loanId,
      userId,
      type,
      status: 'INITIATED',
      amount,
      rzpOrderId: orderId,
      idempotencyKey,
      description,
    },
  })
}

const findLoanByOrder = async (orderId) => {
  return prisma.loan.findFirst({
    where: {
      OR: [{ rzpOrderId: orderId }, { rzpRepayOrderId: orderId }],
    },
  })
}

const verifyPaymentWithGateway = async ({ orderId, paymentId, expectedAmount }) => {
  if (!isRazorpay || !verifyWithApi) return

  let payment
  try {
    payment = await rzp.payments.fetch(paymentId)
  } catch (e) {
    throw gatewayError(e, 'Unable to fetch payment details from Razorpay')
  }

  if (!payment || payment.order_id !== orderId) throw err('Payment order mismatch', 409)
  if (String(payment.status || '').toLowerCase() !== 'captured') throw err('Payment is not captured yet', 409)
  if (String(payment.currency || '').toUpperCase() !== 'INR') throw err('Unexpected payment currency', 409)
  if (Number(payment.amount) !== Number(expectedAmount) * 100) throw err('Payment amount mismatch', 409)
}

const verifySignature = (orderId, paymentId, signature) => {
  const body = `${orderId}|${paymentId}`
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'placeholder').update(body).digest('hex')
  return expected === signature
}

const assertClientActorAccess = ({ verifyType, loan, actor }) => {
  if (!actor?.id || !actor?.role) throw err('Unauthorized actor', 401)

  if (verifyType === VERIFY_TYPE.FUNDING) {
    if (actor.role !== 'PROVIDER' || loan.providerId !== actor.id) {
      throw err('Only assigned provider can verify this funding payment', 403)
    }
    return
  }

  if (verifyType === VERIFY_TYPE.REPAYMENT) {
    if (actor.role !== 'BORROWER' || loan.borrowerId !== actor.id) {
      throw err('Only borrower can verify this repayment payment', 403)
    }
  }
}

const assertLoanOrderMapping = ({ verifyType, loan, orderId }) => {
  if (verifyType === VERIFY_TYPE.FUNDING && loan.rzpOrderId !== orderId) {
    throw err('Funding order does not match this loan', 409)
  }
  if (verifyType === VERIFY_TYPE.REPAYMENT && loan.rzpRepayOrderId !== orderId) {
    throw err('Repayment order does not match this loan', 409)
  }
}

const markFundingCaptured = async ({ loanId, orderId, paymentId, signature }) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.rzpOrderId && orderId && loan.rzpOrderId !== orderId) throw err('Funding order mismatch', 409)

  if (loan.status === 'ACTIVE' || loan.status === 'REPAID') {
    return { alreadyProcessed: true, loanId, status: loan.status }
  }
  if (loan.status !== 'FUNDED') throw err('Loan is not in FUNDED state', 409)

  const resolvedOrderId = orderId || loan.rzpOrderId

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      rzpOrderId: resolvedOrderId,
      rzpPaymentId: paymentId,
    },
  })

  const updatedTx = await prisma.transaction.updateMany({
    where: {
      loanId,
      type: 'DISBURSEMENT',
      rzpOrderId: resolvedOrderId,
      status: { in: ['INITIATED', 'PENDING', 'FAILED'] },
    },
    data: {
      status: 'SUCCESS',
      rzpPaymentId: paymentId,
      rzpSignature: signature || null,
      failureReason: null,
      completedAt: new Date(),
    },
  })

  if (!updatedTx.count) {
    await prisma.transaction.updateMany({
      where: {
        loanId,
        type: 'DISBURSEMENT',
        status: { not: 'SUCCESS' },
      },
      data: {
        status: 'SUCCESS',
        rzpOrderId: resolvedOrderId,
        rzpPaymentId: paymentId,
        rzpSignature: signature || null,
        failureReason: null,
        completedAt: new Date(),
      },
    })
  }

  await loanSvc.markDisbursed(loanId)

  const updated = await prisma.loan.findUnique({ where: { id: loanId } })
  await createNotification(
    updated.borrowerId,
    'LOAN_DISBURSED',
    'Loan Disbursed',
    `INR ${updated.principalAmount} for ${updated.publicId} has been disbursed.`,
    { loanId }
  )

  return { success: true, loanId, status: 'ACTIVE' }
}

const markRepaymentCaptured = async ({ loanId, orderId, paymentId, signature }) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.rzpRepayOrderId && orderId && loan.rzpRepayOrderId !== orderId) throw err('Repayment order mismatch', 409)

  if (loan.status === 'REPAID') {
    return { alreadyProcessed: true, loanId, status: 'REPAID' }
  }
  if (!['ACTIVE', 'DEFAULTED'].includes(loan.status)) throw err('Loan is not repayable in current state', 409)

  const resolvedOrderId = orderId || loan.rzpRepayOrderId

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      rzpRepayOrderId: resolvedOrderId,
      rzpRepayPaymentId: paymentId,
    },
  })

  const updatedTx = await prisma.transaction.updateMany({
    where: {
      loanId,
      type: 'REPAYMENT',
      rzpOrderId: resolvedOrderId,
      status: { in: ['INITIATED', 'PENDING', 'FAILED'] },
    },
    data: {
      status: 'SUCCESS',
      rzpPaymentId: paymentId,
      rzpSignature: signature || null,
      failureReason: null,
      completedAt: new Date(),
    },
  })

  if (!updatedTx.count) {
    await prisma.transaction.updateMany({
      where: {
        loanId,
        type: 'REPAYMENT',
        status: { not: 'SUCCESS' },
      },
      data: {
        status: 'SUCCESS',
        rzpOrderId: resolvedOrderId,
        rzpPaymentId: paymentId,
        rzpSignature: signature || null,
        failureReason: null,
        completedAt: new Date(),
      },
    })
  }

  await loanSvc.markRepaid(loanId)

  const refreshed = await prisma.loan.findUnique({ where: { id: loanId } })
  await prisma.transaction.upsert({
    where: { idempotencyKey: `fee_${loanId}` },
    update: {
      status: 'SUCCESS',
      amount: refreshed.platformFeeAmount,
      description: 'Platform fee',
      failureReason: null,
      completedAt: new Date(),
    },
    create: {
      id: createId(),
      loanId,
      userId: refreshed.borrowerId,
      type: 'PLATFORM_FEE',
      status: 'SUCCESS',
      amount: refreshed.platformFeeAmount,
      idempotencyKey: `fee_${loanId}`,
      description: 'Platform fee',
      completedAt: new Date(),
    },
  })

  return { success: true, loanId, status: 'REPAID' }
}

const releaseFundingReservation = async (loanId, providerId, reason = 'Funding payment was not completed') => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.status !== 'FUNDED' || loan.providerId !== providerId) throw err('No active funding reservation found', 409)

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      status: 'PENDING',
      providerId: null,
      fundedAt: null,
      rzpOrderId: null,
      rzpPaymentId: null,
    },
  })

  await prisma.transaction.updateMany({
    where: {
      loanId,
      type: 'DISBURSEMENT',
      status: { in: ['INITIATED', 'PENDING'] },
    },
    data: {
      status: 'FAILED',
      failureReason: reason,
    },
  })

  await Promise.all([
    createNotification(
      loan.borrowerId,
      'GENERAL',
      'Funding Slot Reopened',
      `${loan.publicId} is back in the marketplace because previous funding was not completed.`,
      { loanId: loan.id }
    ),
    createNotification(
      providerId,
      'GENERAL',
      'Funding Released',
      `Your reserved slot for ${loan.publicId} was released.`,
      { loanId: loan.id }
    ),
  ])

  return { released: true, loanId: loan.id, publicId: loan.publicId }
}

const releaseFundingReservationByOrder = async (orderId, reason = 'Funding payment failed') => {
  const loan = await prisma.loan.findFirst({ where: { rzpOrderId: orderId } })
  if (!loan || loan.status !== 'FUNDED' || !loan.providerId) return

  await prisma.loan.update({
    where: { id: loan.id },
    data: {
      status: 'PENDING',
      providerId: null,
      fundedAt: null,
      rzpOrderId: null,
      rzpPaymentId: null,
    },
  })

  await Promise.all([
    createNotification(
      loan.borrowerId,
      'GENERAL',
      'Funding Payment Failed',
      `${loan.publicId} is reopened in marketplace because provider payment failed.`,
      { loanId: loan.id }
    ),
    createNotification(
      loan.providerId,
      'GENERAL',
      'Funding Failed',
      `Your funding attempt for ${loan.publicId} failed. You can retry from marketplace.`,
      { loanId: loan.id }
    ),
  ])

  await prisma.transaction.updateMany({
    where: {
      loanId: loan.id,
      type: 'DISBURSEMENT',
      status: { in: ['INITIATED', 'PENDING'] },
    },
    data: {
      status: 'FAILED',
      failureReason: reason,
    },
  })
}

const createFundingOrder = async (loanId, providerId) => {
  const loan = await assertFundingEligibility(loanId, providerId)

  if (provider === 'MOCK') {
    const orderId = `mock_fund_${loanId}_${Date.now()}`
    await prisma.loan.update({ where: { id: loanId }, data: { rzpOrderId: orderId } })
    await upsertInitiatedTransaction({
      loanId,
      userId: providerId,
      type: 'DISBURSEMENT',
      amount: loan.principalAmount,
      orderId,
      idempotencyKey: `mock_fund_${orderId}`,
      description: `Mock provider funding for ${loan.publicId}`,
    })

    return {
      provider: 'MOCK',
      orderId,
      amount: loan.principalAmount,
      currency: 'INR',
      loanId,
      publicId: loan.publicId,
      nextAction: 'Call /api/payments/fund/:loanId/confirm to complete payment in dev.',
    }
  }

  let order
  try {
    order = await rzp.orders.create({
      amount: loan.principalAmount * 100,
      currency: 'INR',
      receipt: `fund_${loanId}`,
      notes: { loanId, type: VERIFY_TYPE.FUNDING, actorId: providerId },
    })
  } catch (e) {
    throw gatewayError(e, 'Unable to create funding payment order')
  }

  await prisma.loan.update({ where: { id: loanId }, data: { rzpOrderId: order.id } })
  await upsertInitiatedTransaction({
    loanId,
    userId: providerId,
    type: 'DISBURSEMENT',
    amount: loan.principalAmount,
    orderId: order.id,
    idempotencyKey: `fund_${order.id}`,
    description: `Provider funding for ${loan.publicId}`,
  })

  return {
    provider: 'RAZORPAY',
    orderId: order.id,
    amount: loan.principalAmount,
    currency: 'INR',
    loanId,
    publicId: loan.publicId,
    keyId: process.env.RAZORPAY_KEY_ID,
  }
}

const createRepaymentOrder = async (loanId, borrowerId) => {
  const loan = await assertRepaymentEligibility(loanId, borrowerId)
  const repayAmount = loanSvc.getRepaymentPayable(loan)

  if (provider === 'MOCK') {
    const orderId = `mock_repay_${loanId}_${Date.now()}`
    await prisma.loan.update({ where: { id: loanId }, data: { rzpRepayOrderId: orderId } })
    await upsertInitiatedTransaction({
      loanId,
      userId: borrowerId,
      type: 'REPAYMENT',
      amount: repayAmount,
      orderId,
      idempotencyKey: `mock_repay_${orderId}`,
      description: `Mock repayment for ${loan.publicId}`,
    })

    return {
      provider: 'MOCK',
      orderId,
      amount: repayAmount,
      currency: 'INR',
      loanId,
      publicId: loan.publicId,
      baseAmount: loan.totalRepayAmount,
      lateFeeAmount: loan.lateFeeAmount || 0,
      nextAction: 'Call /api/payments/repay/:loanId/confirm to complete payment in dev.',
    }
  }

  let order
  try {
    order = await rzp.orders.create({
      amount: repayAmount * 100,
      currency: 'INR',
      receipt: `repay_${loanId}`,
      notes: { loanId, type: VERIFY_TYPE.REPAYMENT, actorId: borrowerId },
    })
  } catch (e) {
    throw gatewayError(e, 'Unable to create repayment payment order')
  }

  await prisma.loan.update({ where: { id: loanId }, data: { rzpRepayOrderId: order.id } })
  await upsertInitiatedTransaction({
    loanId,
    userId: borrowerId,
    type: 'REPAYMENT',
    amount: repayAmount,
    orderId: order.id,
    idempotencyKey: `repay_${order.id}`,
    description: `Repayment for ${loan.publicId}`,
  })

  return {
    provider: 'RAZORPAY',
    orderId: order.id,
    amount: repayAmount,
    currency: 'INR',
    loanId,
    publicId: loan.publicId,
    baseAmount: loan.totalRepayAmount,
    lateFeeAmount: loan.lateFeeAmount || 0,
    keyId: process.env.RAZORPAY_KEY_ID,
  }
}

const verifyClientPayment = async ({ orderId, paymentId, signature, loanId, type }, actor) => {
  ensureRazorpayMode()
  const verifyType = normalizeVerifyType(type)
  if (!orderId || !paymentId || !signature || !loanId) throw err('Missing payment verification fields', 422)
  if (!verifySignature(orderId, paymentId, signature)) throw err('Invalid payment signature', 401)

  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  assertLoanOrderMapping({ verifyType, loan, orderId })
  assertClientActorAccess({ verifyType, loan, actor })

  const txType = TX_TYPE_BY_VERIFY[verifyType]
  const tx = await prisma.transaction.findFirst({
    where: {
      loanId,
      userId: actor.id,
      type: txType,
      rzpOrderId: orderId,
    },
    orderBy: { initiatedAt: 'desc' },
  })
  if (!tx) throw err('No initiated transaction found for this order', 404)
  if (tx.status === 'SUCCESS') return { alreadyProcessed: true, loanId, status: verifyType === 'FUNDING' ? 'ACTIVE' : 'REPAID' }

  await verifyPaymentWithGateway({ orderId, paymentId, expectedAmount: tx.amount })

  if (verifyType === VERIFY_TYPE.FUNDING) {
    return markFundingCaptured({ loanId, orderId, paymentId, signature })
  }
  return markRepaymentCaptured({ loanId, orderId, paymentId, signature })
}

const confirmFundingMock = async (loanId, providerId) => {
  if (provider !== 'MOCK') throw err('Mock confirm is disabled. Configure PAYMENT_PROVIDER=MOCK', 403)
  const loan = await assertFundingEligibility(loanId, providerId)
  return markFundingCaptured({
    loanId,
    orderId: loan.rzpOrderId,
    paymentId: `mock_pay_${Date.now()}`,
    signature: 'mock-signature',
  })
}

const confirmRepaymentMock = async (loanId, borrowerId) => {
  if (provider !== 'MOCK') throw err('Mock confirm is disabled. Configure PAYMENT_PROVIDER=MOCK', 403)
  const loan = await assertRepaymentEligibility(loanId, borrowerId)
  return markRepaymentCaptured({
    loanId,
    orderId: loan.rzpRepayOrderId,
    paymentId: `mock_pay_${Date.now()}`,
    signature: 'mock-signature',
  })
}

const handleWebhook = async (rawBody, signature) => {
  ensureRazorpayMode()
  if (!signature) throw err('Missing Razorpay signature header', 400)

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'placeholder'
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '')
  const digest = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex')
  if (digest !== signature) throw err('Invalid webhook signature', 401)

  const event = JSON.parse(payload.toString('utf8'))
  const { event: eventName, payload: eventPayload } = event
  const payment = eventPayload?.payment?.entity
  if (!payment) return

  if (eventName === 'payment.captured') {
    const notes = payment.notes || {}
    let loanId = notes.loanId
    let type = String(notes.type || '').toUpperCase()

    if (!loanId || !Object.values(VERIFY_TYPE).includes(type)) {
      const mappedLoan = await findLoanByOrder(payment.order_id)
      if (!mappedLoan) return
      loanId = mappedLoan.id
      type = mappedLoan.rzpOrderId === payment.order_id ? VERIFY_TYPE.FUNDING : VERIFY_TYPE.REPAYMENT
    }

    if (type === VERIFY_TYPE.FUNDING) {
      await markFundingCaptured({
        loanId,
        orderId: payment.order_id,
        paymentId: payment.id,
        signature,
      })
      return
    }

    if (type === VERIFY_TYPE.REPAYMENT) {
      await markRepaymentCaptured({
        loanId,
        orderId: payment.order_id,
        paymentId: payment.id,
        signature,
      })
    }
    return
  }

  if (eventName === 'payment.failed') {
    const reason = payment.error_description || 'Payment failed'
    await prisma.transaction.updateMany({
      where: { rzpOrderId: payment.order_id, status: { not: 'SUCCESS' } },
      data: { status: 'FAILED', failureReason: reason },
    })

    const notes = payment.notes || {}
    const type = String(notes.type || '').toUpperCase()
    if (type === VERIFY_TYPE.FUNDING) {
      await releaseFundingReservationByOrder(payment.order_id, reason)
      return
    }

    const loan = await findLoanByOrder(payment.order_id)
    if (loan?.rzpOrderId === payment.order_id) {
      await releaseFundingReservationByOrder(payment.order_id, reason)
    }
  }
}

module.exports = {
  getPublicPaymentConfig,
  createFundingOrder,
  createRepaymentOrder,
  releaseFundingReservation,
  confirmFundingMock,
  confirmRepaymentMock,
  verifyClientPayment,
  verifySignature,
  handleWebhook,
}
