const prisma = require('../config/db')
const { calculateLoan, generatePublicId } = require('../utils/loanCalc')
const { createNotification } = require('./notification.service')
const { updateScore, SCORE_EVENTS } = require('./credit.service')
const { createId } = require('@paralleldrive/cuid2')

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code })
const DAY_MS = 24 * 60 * 60 * 1000
const defaultAfterDays = Math.max(Number(process.env.DEFAULT_AFTER_DAYS || 15), 1)
const lateFeePerDayBps = Math.max(Number(process.env.LATE_FEE_PER_DAY_BPS || 50), 0) // 50 bps = 0.5% / day
const maxLateFeePct = Math.max(Number(process.env.MAX_LATE_FEE_PCT || 20), 0)

const calcOverdueDays = (dueAt, now = new Date()) => {
  if (!dueAt) return 0
  const diff = now.getTime() - new Date(dueAt).getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / DAY_MS)
}

const calcLateFeeAmount = (principalAmount, overdueDays) => {
  if (!overdueDays) return 0
  const raw = Math.round(principalAmount * (lateFeePerDayBps / 10000) * overdueDays)
  const cap = Math.round(principalAmount * (maxLateFeePct / 100))
  return Math.min(raw, cap)
}

const getRepaymentPayable = (loan) => (loan.totalRepayAmount || 0) + (loan.lateFeeAmount || 0)

const getConfig = async () => {
  const cfg = await prisma.platformConfig.findFirst({ orderBy: { createdAt: 'desc' } })
  return cfg || { interestRatePercent: 5, platformFeePercent: 10, minLoanAmount: 500, maxLoanAmount: 10000 }
}

const refreshLoanDelinquency = async (loanId, now = new Date()) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) return null
  if (!loan.dueAt || !['ACTIVE', 'DEFAULTED'].includes(loan.status)) return loan

  const overdueDays = calcOverdueDays(loan.dueAt, now)
  const isOverdue = overdueDays > 0
  const lateFeeAmount = calcLateFeeAmount(loan.principalAmount, overdueDays)
  const shouldDefault = loan.status === 'ACTIVE' && overdueDays >= defaultAfterDays
  const patch = {}

  if (loan.isOverdue !== isOverdue) patch.isOverdue = isOverdue
  if (loan.overdueDays !== overdueDays) patch.overdueDays = overdueDays
  if (loan.lateFeeAmount !== lateFeeAmount) patch.lateFeeAmount = lateFeeAmount

  if (shouldDefault) {
    patch.status = 'DEFAULTED'
    patch.defaultedAt = loan.defaultedAt || now
  }

  if (!Object.keys(patch).length) return loan

  const updated = await prisma.loan.update({ where: { id: loan.id }, data: patch })

  if (isOverdue && !loan.isOverdue) {
    await Promise.all([
      createNotification(
        updated.borrowerId,
        'REPAYMENT_OVERDUE',
        'Repayment Overdue',
        `${updated.publicId} is overdue by ${overdueDays} day(s). Late fee applies until repayment.`,
        { loanId: updated.id, overdueDays, lateFeeAmount: updated.lateFeeAmount }
      ),
      updated.providerId
        ? createNotification(
            updated.providerId,
            'GENERAL',
            'Borrower Repayment Overdue',
            `${updated.publicId} is overdue by ${overdueDays} day(s).`,
            { loanId: updated.id, overdueDays }
          )
        : Promise.resolve(),
    ])
  }

  if (shouldDefault) {
    await updateScore(updated.borrowerId, SCORE_EVENTS.DEFAULT, 'Loan defaulted', updated.id)
    await prisma.user.updateMany({
      where: { id: updated.borrowerId, isBanned: false, isSuspended: false },
      data: { isSuspended: true, suspendReason: `Auto-suspended after default on ${updated.publicId}` },
    })
    await Promise.all([
      createNotification(
        updated.borrowerId,
        'ACCOUNT_SUSPENDED',
        'Account Suspended',
        `Your account was auto-suspended due to default on ${updated.publicId}. Contact support after repayment.`,
        { loanId: updated.id }
      ),
      updated.providerId
        ? createNotification(
            updated.providerId,
            'GENERAL',
            'Loan Marked Defaulted',
            `${updated.publicId} has crossed the default threshold and is marked DEFAULTED.`,
            { loanId: updated.id, overdueDays: updated.overdueDays }
          )
        : Promise.resolve(),
    ])
  }

  return updated
}

const sweepDelinquency = async () => {
  const now = new Date()
  const loans = await prisma.loan.findMany({
    where: {
      status: { in: ['ACTIVE', 'DEFAULTED'] },
      dueAt: { not: null },
      isArchived: false,
    },
    select: { id: true, status: true, isOverdue: true, overdueDays: true, lateFeeAmount: true },
  })

  let updated = 0
  let defaulted = 0
  let overdue = 0

  for (const row of loans) {
    const before = row.status
    const result = await refreshLoanDelinquency(row.id, now)
    if (!result) continue
    if (
      before !== result.status ||
      row.isOverdue !== result.isOverdue ||
      row.overdueDays !== result.overdueDays ||
      row.lateFeeAmount !== result.lateFeeAmount
    ) {
      updated += 1
    }
    if (before !== 'DEFAULTED' && result.status === 'DEFAULTED') defaulted += 1
    if (result.isOverdue) overdue += 1
  }

  return {
    scanned: loans.length,
    updated,
    overdue,
    defaulted,
    defaultAfterDays,
    lateFeePerDayBps,
    maxLateFeePct,
  }
}

const createLoan = async (userId, { principalAmount, tenure, purpose, purposeNote }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user.kycStatus !== 'APPROVED') throw err('KYC not approved', 403)
  if (!user.upiVerified) throw err('Link your UPI ID first', 403)
  if (principalAmount > user.borrowLimit) throw err(`Borrow limit is INR ${user.borrowLimit}`)

  const active = await prisma.loan.findFirst({
    where: {
      borrowerId: userId,
      status: { in: ['PENDING', 'FUNDED', 'ACTIVE'] },
    },
  })
  if (active) throw err('You already have an active loan')

  const cfg = await getConfig()
  const calc = calculateLoan(principalAmount, tenure, Number(cfg.interestRatePercent), Number(cfg.platformFeePercent))
  const count = await prisma.loan.count()
  const publicId = generatePublicId(count + 1)

  const loan = await prisma.loan.create({
    data: {
      id: createId(),
      borrowerId: userId,
      principalAmount,
      tenure,
      purpose,
      purposeNote,
      publicId,
      interestRate: cfg.interestRatePercent,
      platformFeeRate: cfg.platformFeePercent,
      ...calc,
    },
  })

  await createNotification(
    userId,
    'GENERAL',
    'Loan Request Created',
    `Your request for INR ${principalAmount} (${publicId}) is now in the marketplace.`,
    { loanId: loan.id }
  )

  return loan
}

const getMarketplace = async (providerId, filters = {}) => {
  const { tenure, minScore, maxAmount, page = 1, limit = 20 } = filters
  const safePage = Number(page) || 1
  const safeLimit = Math.min(Number(limit) || 20, 50)

  // Get provider's university for campus-only filtering
  const provider = await prisma.user.findUnique({ where: { id: providerId } })
  const providerUniversityId = provider?.universityId

  const where = {
    status: 'PENDING',
    isArchived: false,
    borrower: providerUniversityId ? { universityId: providerUniversityId } : undefined
  }

  const loans = await prisma.loan.findMany({
    where,
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
    orderBy: { requestedAt: 'desc' },
    include: {
      borrower: {
        select: {
          creditScore: true,
          universityId: true,
          university: { select: { shortName: true } },
        },
      },
    },
  })

  return loans
    .filter((l) => !minScore || l.borrower.creditScore >= Number(minScore))
    .filter((l) => !maxAmount || l.principalAmount <= Number(maxAmount))
    .map((l) => ({
      id: l.id,
      publicId: l.publicId,
      principalAmount: l.principalAmount,
      totalRepayAmount: l.totalRepayAmount,
      providerEarning: l.providerEarning,
      tenure: l.tenure,
      purpose: l.purpose,
      purposeNote: l.purposeNote,
      interestRate: l.interestRate,
      creditScore: l.borrower.creditScore,
      university: l.borrower.university?.shortName,
      requestedAt: l.requestedAt,
    }))
}

const fundLoan = async (providerId, loanId) => {
  const provider = await prisma.user.findUnique({ where: { id: providerId } })
  if (!provider) throw err('Provider not found', 404)
  if (!provider.upiVerified) throw err('Link your UPI ID first', 403)

  const current = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!current) throw err('Loan not found', 404)
  if (current.borrowerId === providerId) throw err('Cannot fund your own loan')

  const updated = await prisma.loan.updateMany({
    where: { id: loanId, status: 'PENDING', providerId: null },
    data: { providerId, status: 'FUNDED', fundedAt: new Date() },
  })
  if (updated.count === 0) throw err('Loan is no longer available')

  const loan = await prisma.loan.findUnique({ where: { id: loanId } })

  await Promise.all([
    createNotification(
      loan.borrowerId,
      'LOAN_FUNDED',
      'Loan Funded',
      `${loan.publicId} has been funded. Complete disbursal payment next.`,
      { loanId }
    ),
    createNotification(
      providerId,
      'GENERAL',
      'Funding Reserved',
      `You reserved ${loan.publicId}. Proceed to payment to disburse money.`,
      { loanId }
    ),
  ])

  return loan
}

const markDisbursed = async (loanId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.status === 'ACTIVE' || loan.status === 'REPAID') return loan

  const dueAt = new Date()
  dueAt.setDate(
    dueAt.getDate() +
      ({
        SEVEN: 7,
        FOURTEEN: 14,
        THIRTY: 30,
      }[loan.tenure] || 7)
  )

  return prisma.loan.update({
    where: { id: loanId },
    data: { status: 'ACTIVE', disbursedAt: new Date(), dueAt },
  })
}

const markRepaid = async (loanId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.status === 'REPAID') return loan

  const repaid = await prisma.loan.update({
    where: { id: loanId },
    data: { status: 'REPAID', repaidAt: new Date(), isOverdue: false },
  })

  const isLate = repaid.dueAt ? new Date() > repaid.dueAt : false
  await updateScore(
    repaid.borrowerId,
    isLate ? SCORE_EVENTS.LATE_REPAYMENT : SCORE_EVENTS.ON_TIME_REPAYMENT,
    isLate ? 'Late repayment' : 'On-time repayment',
    loanId
  )

  await Promise.all([
    createNotification(
      repaid.borrowerId,
      'REPAYMENT_SUCCESS',
      'Repayment Successful',
      `${repaid.publicId} is fully repaid.`,
      { loanId }
    ),
    repaid.providerId
      ? createNotification(
          repaid.providerId,
          'REPAYMENT_SUCCESS',
          'Payment Received',
          `INR ${getRepaymentPayable(repaid)} received for ${repaid.publicId}.`,
          { loanId }
        )
      : Promise.resolve(),
  ])

  return repaid
}

const myLoans = async (userId, role) => {
  const where = role === 'PROVIDER' ? { providerId: userId } : { borrowerId: userId }
  return prisma.loan.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 })
}

const getLoan = async (loanId, userId) => {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: {
      borrower: {
        select: {
          firstName: true,
          lastName: true,
          creditScore: true,
          university: { select: { name: true, shortName: true } },
        },
      },
      provider: { select: { firstName: true, lastName: true } },
      transactions: { orderBy: { initiatedAt: 'desc' } },
    },
  })
  if (!loan) throw err('Loan not found', 404)
  if (loan.borrowerId !== userId && loan.providerId !== userId) throw err('Access denied', 403)
  return loan
}

module.exports = {
  createLoan,
  getMarketplace,
  fundLoan,
  sweepDelinquency,
  refreshLoanDelinquency,
  getRepaymentPayable,
  markDisbursed,
  markRepaid,
  myLoans,
  getLoan,
  getConfig,
}
