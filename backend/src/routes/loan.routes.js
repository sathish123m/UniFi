const router = require('express').Router()
const loanSvc = require('../services/loan.service')
const { protect, restrictTo, requireKyc, requireUpi } = require('../middleware/auth')
const { validate, loanRequestSchema } = require('../middleware/validate')
const { ok } = require('../utils/response')
router.use(protect)

// Marketplace (providers only)
router.get('/marketplace', restrictTo('PROVIDER'), async (req,res) => ok(res, await loanSvc.getMarketplace(req.user.id, req.query)))

// Create loan request (borrowers only) — supports both POST /loans and POST /loans/request
const handleCreateLoan = async (req, res) =>
  ok(res, await loanSvc.createLoan(req.user.id, req.body), 'Loan request created', 201)

router.post('/', restrictTo('BORROWER'), requireKyc, requireUpi, validate(loanRequestSchema), handleCreateLoan)
router.post('/request', restrictTo('BORROWER'), requireKyc, requireUpi, validate(loanRequestSchema), handleCreateLoan)

// My loans
router.get('/my', async (req,res) => ok(res, await loanSvc.myLoans(req.user.id, req.user.role)))

// Single loan detail
router.get('/:id', async (req,res) => ok(res, await loanSvc.getLoan(req.params.id, req.user.id)))

// Fund a loan (providers only) — a commitment to lend peer-to-peer
router.post('/:id/fund', restrictTo('PROVIDER'), requireKyc, requireUpi, async (req,res) => ok(res, await loanSvc.fundLoan(req.user.id, req.params.id)))

// Dual confirmation of the handover (record-only, no money moves through UniFi)
router.post('/:id/handover', restrictTo('PROVIDER'), async (req,res) => ok(res, await loanSvc.markFundingSent(req.params.id, req.user.id), 'Handover recorded'))
router.post('/:id/received', restrictTo('BORROWER'), async (req,res) => ok(res, await loanSvc.confirmFundingReceived(req.params.id, req.user.id), 'Receipt confirmed'))

// Dual confirmation of the repayment
router.post('/:id/repay-claimed', restrictTo('BORROWER'), async (req,res) => ok(res, await loanSvc.claimRepayment(req.params.id, req.user.id), 'Repayment marked'))
router.post('/:id/confirm-repayment', restrictTo('PROVIDER'), async (req,res) => ok(res, await loanSvc.confirmRepaymentReceived(req.params.id, req.user.id), 'Repayment confirmed'))

// Dispute (either party)
router.post('/:id/dispute', async (req,res) => ok(res, await loanSvc.raiseDispute(req.params.id, req.user.id, req.body?.reason), 'Dispute raised'))

// Cancel loan request (borrowers only)
router.post('/:id/cancel', restrictTo('BORROWER'), async (req,res) => ok(res, await loanSvc.cancelLoan(req.user.id, req.params.id), 'Loan request cancelled'))

// Get platform config (for loan calculator in frontend)
router.get('/meta/config', async (req,res) => ok(res, await loanSvc.getConfig()))

module.exports = router
