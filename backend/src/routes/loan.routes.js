const router = require('express').Router()
const loanSvc = require('../services/loan.service')
const { protect, restrictTo, requireKyc, requireUpi } = require('../middleware/auth')
const { validate, loanRequestSchema } = require('../middleware/validate')
const { ok } = require('../utils/response')
router.use(protect)

// Marketplace (providers only)
router.get('/marketplace', restrictTo('PROVIDER'), async (req,res) => ok(res, await loanSvc.getMarketplace(req.user.id, req.query)))

// Create loan request (borrowers only)
router.post('/', restrictTo('BORROWER'), requireKyc, requireUpi, validate(loanRequestSchema), async (req,res) => ok(res, await loanSvc.createLoan(req.user.id, req.body), 'Loan request created', 201))

// My loans
router.get('/my', async (req,res) => ok(res, await loanSvc.myLoans(req.user.id, req.user.role)))

// Single loan detail
router.get('/:id', async (req,res) => ok(res, await loanSvc.getLoan(req.params.id, req.user.id)))

// Fund a loan (providers only)
router.post('/:id/fund', restrictTo('PROVIDER'), requireKyc, requireUpi, async (req,res) => ok(res, await loanSvc.fundLoan(req.user.id, req.params.id)))

// Get platform config (for loan calculator in frontend)
router.get('/meta/config', async (req,res) => ok(res, await loanSvc.getConfig()))

module.exports = router
