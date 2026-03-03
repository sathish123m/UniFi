const router = require('express').Router()
const paySvc = require('../services/payment.service')
const { protect, restrictTo } = require('../middleware/auth')
const { validate } = require('../middleware/validate')
const { ok } = require('../utils/response')
const { z } = require('zod')

const verifyPaymentSchema = z.object({
  body: z.object({
    orderId: z.string().min(6),
    paymentId: z.string().min(6),
    signature: z.string().min(10),
    loanId: z.string().min(6),
    type: z.enum(['FUNDING', 'REPAYMENT']),
  }),
})

router.post('/webhook', async (req, res) => {
  if (!req.headers['x-razorpay-signature']) {
    return res.status(400).json({ success: false, message: 'Missing Razorpay signature header' })
  }
  await paySvc.handleWebhook(req.body, req.headers['x-razorpay-signature'])
  res.json({ received: true })
})

router.use(protect)

router.get('/config', async (req, res) => {
  ok(res, paySvc.getPublicPaymentConfig())
})

router.post('/fund/:loanId', restrictTo('PROVIDER'), async (req, res) => {
  ok(res, await paySvc.createFundingOrder(req.params.loanId, req.user.id))
})

router.post('/fund/:loanId/release', restrictTo('PROVIDER'), async (req, res) => {
  ok(res, await paySvc.releaseFundingReservation(req.params.loanId, req.user.id), 'Funding reservation released')
})

router.post('/fund/:loanId/confirm', restrictTo('PROVIDER'), async (req, res) => {
  ok(res, await paySvc.confirmFundingMock(req.params.loanId, req.user.id), 'Funding marked successful')
})

router.post('/repay/:loanId', restrictTo('BORROWER'), async (req, res) => {
  ok(res, await paySvc.createRepaymentOrder(req.params.loanId, req.user.id))
})

router.post('/repay/:loanId/confirm', restrictTo('BORROWER'), async (req, res) => {
  ok(res, await paySvc.confirmRepaymentMock(req.params.loanId, req.user.id), 'Repayment marked successful')
})

router.post('/verify', validate(verifyPaymentSchema), async (req, res) => {
  ok(res, await paySvc.verifyClientPayment(req.body, req.user), 'Payment verified')
})

module.exports = router
