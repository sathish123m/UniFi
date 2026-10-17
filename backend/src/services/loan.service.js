const prisma = require('../config/db')
const { calculateLoan, generatePublicId } = require('../utils/loanCalc')
const { createNotification } = require('./notification.service')
const { updateScore, SCORE_EVENTS } = require('./credit.service')
const { createId } = require('@paralleldrive/cuid2')

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code })
const DAY_MS = 24 * 60 * 60 * 1000
const defaultAfterDays = Math.max(Number(process.env.DEFAULT_AFTER_DAYS || 15), 1)

const calcOverdueDays = (dueAt, now = new Date()) => {
  if (!dueAt) return 0
  const diff = now.getTime() - new Date(dueAt).getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / DAY_MS)
}

const TENURE_DAYS = { SEVEN: 7, FOURTEEN: 14, THIRTY: 30 }

// A loan's repayable figure is exactly its principal — UniFi is non-custodial and
// charges no interest, no platform fee and no late fee.
const getRepaymentPayable = (loan) => loan.totalRepayAmount || loan.principalAmount || 0

const getConfig = async () => {
  const cfg = await prisma.platformConfig.findFirst({ orderBy: { createdAt: 'desc' } })
  return cfg || { minLoanAmount: 500, maxLoanAmount: 10000 }
}

// Record-only ledger: an audit trail of what each peer attested to. It never
// represents money held or moved by UniFi. Keyed so repeated confirmations are
// idempotent.
const recordLedger = async ({ loanId, userId, type, amount, description, key, status = 'SUCCESS' }) =>
  prisma.transaction.upsert({
    where: { idempotencyKey: `record:${key}` },
    update: { status, description, completedAt: new Date() },
    create: {
      id: createId(),
      loanId,
      userId,
      type,
      status,
      amount,
      description,
      idempotencyKey: `record:${key}`,
      completedAt: new Date(),
    },
  })

const refreshLoanDelinquency = async (loanId, now = new Date()) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) return null
  if (!loan.dueAt || !['ACTIVE', 'DEFAULTED'].includes(loan.status)) return loan

  const overdueDays = calcOverdueDays(loan.dueAt, now)
  const isOverdue = overdueDays > 0
  const shouldDefault = loan.status === 'ACTIVE' && overdueDays >= defaultAfterDays
  const patch = {}

  if (loan.isOverdue !== isOverdue) patch.isOverdue = isOverdue
  if (loan.overdueDays !== overdueDays) patch.overdueDays = overdueDays

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
        `${updated.publicId} is overdue by ${overdueDays} day(s). Repay to protect your campus trust score.`,
        { loanId: updated.id, overdueDays }
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
    // NOTE: We intentionally do NOT hard-suspend the borrower here. The `protect`
    // middleware rejects suspended accounts entirely, which would lock a defaulter
    // out of the very repayment flow they need to clear the default — a deadlock.
    // New borrowing is blocked instead (see createLoan), and repayment stays open.
    await Promise.all([
      createNotification(
        updated.borrowerId,
        'REPAYMENT_OVERDUE',
        'Loan Defaulted',
        `${updated.publicId} has crossed the default threshold and is marked DEFAULTED. Repay now to restore your standing and borrowing access.`,
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
  const cfg = await getConfig()
  const acceptWindowHours = Number(cfg.providerAcceptWindowHours) || 24
  const fundWindowHours = Number(cfg.providerFundWindowHours) || 2
  const expiredCutoff = new Date(now.getTime() - acceptWindowHours * 60 * 60 * 1000)
  const fundCutoff = new Date(now.getTime() - fundWindowHours * 60 * 60 * 1000)

  // Auto-cancel unfunded PENDING loans older than acceptWindowHours
  const expiredPendingResult = await prisma.loan.updateMany({
    where: {
      status: 'PENDING',
      requestedAt: { lt: expiredCutoff },
      isArchived: false,
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: now,
    },
  })

  // Auto-release FUNDED loans whose provider never completed payment within the
  // fund window. Reservation reverts to PENDING so the loan re-enters the market.
  const staleFundings = await prisma.loan.findMany({
    where: {
      status: 'FUNDED',
      fundedAt: { lt: fundCutoff },
      isArchived: false,
    },
    select: { id: true, publicId: true, borrowerId: true, providerId: true },
  })

  let fundReservationsReleased = 0
  for (const loan of staleFundings) {
    // Conditional update guards against a race with an in-flight payment capture.
    const released = await prisma.loan.updateMany({
      where: { id: loan.id, status: 'FUNDED', fundedAt: { lt: fundCutoff } },
      data: {
        status: 'PENDING',
        providerId: null,
        fundedAt: null,
        fundingSentAt: null,
        fundingReceivedAt: null,
      },
    })
    if (!released.count) continue
    fundReservationsReleased += 1

    await prisma.transaction.updateMany({
      where: { loanId: loan.id, type: 'DISBURSEMENT', status: { in: ['INITIATED', 'PENDING'] } },
      data: { status: 'FAILED', failureReason: 'Peer did not complete the handover within the allowed window' },
    })

    await Promise.all([
      createNotification(
        loan.borrowerId,
        'GENERAL',
        'Funding Slot Reopened',
        `${loan.publicId} is back in the marketplace because the previous funding was not completed in time.`,
        { loanId: loan.id }
      ),
      loan.providerId
        ? createNotification(
            loan.providerId,
            'GENERAL',
            'Funding Reservation Expired',
            `Your reserved slot for ${loan.publicId} expired because payment was not completed in time.`,
            { loanId: loan.id }
          )
        : Promise.resolve(),
    ])
  }

  const loans = await prisma.loan.findMany({
    where: {
      status: { in: ['ACTIVE', 'DEFAULTED'] },
      dueAt: { not: null },
      isArchived: false,
    },
    select: { id: true, status: true, isOverdue: true, overdueDays: true },
  })

  let updated = expiredPendingResult.count + fundReservationsReleased
  let defaulted = 0
  let overdue = 0

  for (const row of loans) {
    const before = row.status
    const result = await refreshLoanDelinquency(row.id, now)
    if (!result) continue
    if (
      before !== result.status ||
      row.isOverdue !== result.isOverdue ||
      row.overdueDays !== result.overdueDays
    ) {
      updated += 1
    }
    if (before !== 'DEFAULTED' && result.status === 'DEFAULTED') defaulted += 1
    if (result.isOverdue) overdue += 1
  }

  return {
    scanned: loans.length + expiredPendingResult.count + staleFundings.length,
    expiredPendingCancelled: expiredPendingResult.count,
    fundReservationsReleased,
    updated,
    overdue,
    defaulted,
    defaultAfterDays,
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
      status: { in: ['PENDING', 'FUNDED', 'ACTIVE', 'DEFAULTED'] },
    },
  })
  if (active) {
    if (active.status === 'DEFAULTED') {
      throw err('You have a defaulted loan. Repay it before requesting a new one.')
    }
    throw err('You already have an active loan')
  }

  const calc = calculateLoan(principalAmount)

  // publicId is a human-friendly sequential label (UniFi#00001). `count()+1` is
  // racy under concurrency (two requests read the same count) and brittle if any
  // row is ever deleted, so we retry on the unique-constraint violation (P2002)
  // and recompute from the current max sequence each attempt.
  let loan
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await prisma.loan.findFirst({
      where: { publicId: { startsWith: 'UniFi#' } },
      orderBy: { publicId: 'desc' },
      select: { publicId: true },
    })
    const lastSeq = last ? Number(String(last.publicId).replace('UniFi#', '')) || 0 : 0
    const publicId = generatePublicId(lastSeq + 1)

    try {
      loan = await prisma.loan.create({
        data: {
          id: createId(),
          borrowerId: userId,
          principalAmount,
          tenure,
          purpose,
          purposeNote,
          publicId,
          interestRate: 0,
          platformFeeRate: 0,
          ...calc,
        },
      })
      break
    } catch (e) {
      // P2002 = unique constraint failed (publicId collided with a concurrent
      // insert). Retry with a freshly recomputed sequence.
      if (e.code === 'P2002' && attempt < 4) continue
      throw e
    }
  }

  await createNotification(
    userId,
    'GENERAL',
    'Loan Request Created',
    `Your request for INR ${principalAmount} (${loan.publicId}) is now in the marketplace.`,
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

  // Campus isolation is a hard requirement: a provider only ever sees borrowers
  // from their own university. If the provider has no university assigned we must
  // return nothing rather than silently exposing every campus's loans.
  if (!providerUniversityId) return []

  const where = {
    status: 'PENDING',
    isArchived: false,
    borrower: { universityId: providerUniversityId },
  }

  // Apply score/amount filters inside the query so pagination is computed over
  // the filtered set. Filtering after skip/take (as before) produced short or
  // empty pages and made totals meaningless.
  if (maxAmount) {
    where.principalAmount = { lte: Number(maxAmount) }
  }
  if (minScore) {
    where.borrower = { ...where.borrower, creditScore: { gte: Number(minScore) } }
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

  return loans.map((l) => ({
    id: l.id,
    publicId: l.publicId,
    principalAmount: l.principalAmount,
    totalRepayAmount: l.totalRepayAmount,
    tenure: l.tenure,
    purpose: l.purpose,
    purposeNote: l.purposeNote,
    creditScore: l.borrower.creditScore,
    university: l.borrower.university?.shortName,
    requestedAt: l.requestedAt,
  }))
}

const fundLoan = async (providerId, loanId) => {
  const provider = await prisma.user.findUnique({ where: { id: providerId } })
  if (!provider) throw err('Provider not found', 404)
  if (!provider.upiVerified) throw err('Link your UPI ID first', 403)

  const current = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { borrower: { select: { universityId: true } } },
  })
  if (!current) throw err('Loan not found', 404)
  if (current.borrowerId === providerId) throw err('Cannot fund your own loan')

  // Campus isolation: a provider may only fund borrowers from their own
  // university. The marketplace filters by campus, but the filter alone must
  // not be the only access control (ids are not secrets).
  if (provider.universityId && current.borrower?.universityId && provider.universityId !== current.borrower.universityId) {
    throw err('You can only fund loan requests from your own university', 403)
  }

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
      `${loan.publicId} has been funded. Confirm once you have received the money in person.`,
      { loanId }
    ),
    createNotification(
      providerId,
      'GENERAL',
      'Funding Reserved',
      `You committed to ${loan.publicId}. Hand the money over, then mark it as sent.`,
      { loanId }
    ),
  ])

  return loan
}

// ── Dual confirmation of handover ────────────────────────────────────────────
// UniFi never touches the money: the lender hands it over directly and both
// sides attest. The loan only becomes ACTIVE when BOTH have confirmed, which is
// what starts the repayment clock.

const activateIfHandoverComplete = async (loanId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.status !== 'FUNDED') return loan
  if (!loan.fundingSentAt || !loan.fundingReceivedAt) return loan

  const dueAt = new Date()
  dueAt.setDate(dueAt.getDate() + (TENURE_DAYS[loan.tenure] || 7))

  // Atomic claim: only the first caller flips FUNDED → ACTIVE, so the
  // notification below fires exactly once even if both sides confirm at once.
  const claim = await prisma.loan.updateMany({
    where: { id: loanId, status: 'FUNDED' },
    data: { status: 'ACTIVE', disbursedAt: new Date(), dueAt },
  })
  if (!claim.count) return prisma.loan.findUnique({ where: { id: loanId } })

  const activated = await prisma.loan.findUnique({ where: { id: loanId } })
  await Promise.all([
    createNotification(
      activated.borrowerId,
      'GENERAL',
      'Loan Active',
      `${activated.publicId} is now active. Repay INR ${getRepaymentPayable(activated)} by the due date.`,
      { loanId }
    ),
    activated.providerId
      ? createNotification(
          activated.providerId,
          'GENERAL',
          'Loan Active',
          `${activated.publicId} is active. The borrower's repayment clock has started.`,
          { loanId }
        )
      : Promise.resolve(),
  ])
  return activated
}

/** Lender attests they handed the money over. */
const markFundingSent = async (loanId, providerId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.providerId !== providerId) throw err('Access denied', 403)
  if (loan.status === 'PENDING' || loan.status === 'CANCELLED') {
    throw err('This loan is not awaiting a handover', 409)
  }
  if (loan.status !== 'FUNDED') return loan

  if (!loan.fundingSentAt) {
    await prisma.loan.updateMany({
      where: { id: loanId, status: 'FUNDED', fundingSentAt: null },
      data: { fundingSentAt: new Date() },
    })
    await recordLedger({
      loanId,
      userId: providerId,
      type: 'DISBURSEMENT',
      amount: loan.principalAmount,
      description: 'Lender attested the money was handed over',
      key: `handover:${loanId}`,
    })
    const updated = await prisma.loan.findUnique({ where: { id: loanId } })
    if (updated.borrowerId) {
      await createNotification(
        updated.borrowerId,
        'GENERAL',
        'Money Handed Over',
        `${updated.publicId}: your lender marked the money as sent. Confirm once you have received it.`,
        { loanId }
      )
    }
  }

  return activateIfHandoverComplete(loanId)
}

/** Borrower confirms they received the money. */
const confirmFundingReceived = async (loanId, borrowerId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.borrowerId !== borrowerId) throw err('Access denied', 403)
  if (loan.status === 'PENDING' || loan.status === 'CANCELLED') {
    throw err('This loan is not awaiting a handover', 409)
  }
  if (loan.status !== 'FUNDED') return loan

  if (!loan.fundingReceivedAt) {
    await prisma.loan.updateMany({
      where: { id: loanId, status: 'FUNDED', fundingReceivedAt: null },
      data: { fundingReceivedAt: new Date() },
    })
    const updated = await prisma.loan.findUnique({ where: { id: loanId } })
    if (updated.providerId) {
      await createNotification(
        updated.providerId,
        'GENERAL',
        'Money Received',
        `${updated.publicId}: the borrower confirmed receiving the money.`,
        { loanId }
      )
    }
  }

  return activateIfHandoverComplete(loanId)
}

const markDisbursed = async (loanId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.status === 'ACTIVE' || loan.status === 'REPAID') return loan

  const dueAt = new Date()
  dueAt.setDate(dueAt.getDate() + (TENURE_DAYS[loan.tenure] || 7))

  // Admin override: force the loan active (e.g. both peers confirmed offline).
  const claim = await prisma.loan.updateMany({
    where: { id: loanId, status: 'FUNDED' },
    data: { status: 'ACTIVE', disbursedAt: new Date(), dueAt },
  })
  if (!claim.count) return prisma.loan.findUnique({ where: { id: loanId } })

  return prisma.loan.findUnique({ where: { id: loanId } })
}

// ── Dual confirmation of repayment ───────────────────────────────────────────
// The borrower attests they paid; the lender confirms they received it. The loan
// is only marked REPAID when both have confirmed.
const finalizeRepayment = async (loanId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.status === 'REPAID') return loan
  if (!loan.repayClaimedAt || !loan.repayConfirmedAt) return loan
  if (!['ACTIVE', 'DEFAULTED'].includes(loan.status)) return loan
  return markRepaid(loanId)
}

/** Borrower attests they repaid the lender. */
const claimRepayment = async (loanId, borrowerId) => {
  const loan = await refreshLoanDelinquency(loanId)
  if (!loan) throw err('Loan not found', 404)
  if (loan.borrowerId !== borrowerId) throw err('Access denied', 403)
  if (!['ACTIVE', 'DEFAULTED'].includes(loan.status)) {
    throw err('This loan is not awaiting repayment', 409)
  }
  if (loan.repayClaimedAt) return loan

  await prisma.loan.updateMany({
    where: { id: loanId, repayClaimedAt: null },
    data: { repayClaimedAt: new Date() },
  })
  await recordLedger({
    loanId,
    userId: borrowerId,
    type: 'REPAYMENT',
    status: 'PENDING',
    amount: getRepaymentPayable(loan),
    description: 'Borrower attested the loan was repaid',
    key: `repayment:${loanId}`,
  })
  const updated = await prisma.loan.findUnique({ where: { id: loanId } })
  if (updated.providerId) {
    await createNotification(
      updated.providerId,
      'GENERAL',
      'Repayment Marked',
      `${updated.publicId}: the borrower marked the loan as repaid. Confirm once you have received it.`,
      { loanId }
    )
  }
  return finalizeRepayment(loanId)
}

/** Lender confirms the repayment was received. */
const confirmRepaymentReceived = async (loanId, providerId) => {
  const loan = await refreshLoanDelinquency(loanId)
  if (!loan) throw err('Loan not found', 404)
  if (loan.providerId !== providerId) throw err('Access denied', 403)
  if (!['ACTIVE', 'DEFAULTED'].includes(loan.status)) return loan
  if (loan.repayConfirmedAt) return loan

  await prisma.loan.updateMany({
    where: { id: loanId, repayConfirmedAt: null },
    data: { repayConfirmedAt: new Date() },
  })
  return finalizeRepayment(loanId)
}

/** Either party flags a problem; surfaced to campus admins, status unchanged. */
const raiseDispute = async (loanId, userId, reason) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.borrowerId !== userId && loan.providerId !== userId) throw err('Access denied', 403)
  if (!['FUNDED', 'ACTIVE', 'DEFAULTED'].includes(loan.status)) {
    throw err('Only an in-progress loan can be disputed', 409)
  }

  const updated = await prisma.loan.update({
    where: { id: loanId },
    data: {
      disputedAt: loan.disputedAt || new Date(),
      disputeReason: String(reason || '').trim().slice(0, 500) || 'No reason provided',
      disputeBy: userId,
    },
  })

  const counterparty = loan.borrowerId === userId ? loan.providerId : loan.borrowerId
  if (counterparty) {
    await createNotification(
      counterparty,
      'GENERAL',
      'Loan Disputed',
      `${loan.publicId}: the other party raised a dispute. A campus admin will review it.`,
      { loanId }
    )
  }

  return updated
}

const markRepaid = async (loanId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.status === 'REPAID') return loan

  // Atomic claim: only the first caller flips ACTIVE/DEFAULTED → REPAID, so the
  // credit-score update and notifications below run exactly once even if both
  // parties confirm at the same moment.
  const claim = await prisma.loan.updateMany({
    where: { id: loanId, status: { in: ['ACTIVE', 'DEFAULTED'] } },
    data: { status: 'REPAID', repaidAt: new Date(), isOverdue: false },
  })
  if (!claim.count) return prisma.loan.findUnique({ where: { id: loanId } })

  const repaid = await prisma.loan.findUnique({ where: { id: loanId } })

  await recordLedger({
    loanId,
    userId: repaid.providerId || repaid.borrowerId,
    type: 'REPAYMENT',
    amount: getRepaymentPayable(repaid),
    description: 'Repayment confirmed and recorded',
    key: `repayment:${loanId}`,
  })

  const isLate = repaid.dueAt ? new Date(repaid.repaidAt) > repaid.dueAt : false
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

const cancelLoan = async (userId, loanId) => {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) throw err('Loan not found', 404)
  if (loan.borrowerId !== userId) throw err('Access denied', 403)

  // Atomic guard: a provider may have reserved the loan between the read and
  // the write, so only cancel while it is still PENDING with no provider.
  const cancelled = await prisma.loan.updateMany({
    where: { id: loanId, borrowerId: userId, status: 'PENDING', providerId: null },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  })
  if (cancelled.count === 0) throw err('Can only cancel pending loan requests', 400)

  await createNotification(
    userId,
    'GENERAL',
    'Loan Request Cancelled',
    `Your loan request ${loan.publicId} has been cancelled.`,
    { loanId }
  )

  return updated
}

module.exports = {
  createLoan,
  getMarketplace,
  fundLoan,
  cancelLoan,
  sweepDelinquency,
  refreshLoanDelinquency,
  getRepaymentPayable,
  markDisbursed,
  markRepaid,
  markFundingSent,
  confirmFundingReceived,
  claimRepayment,
  confirmRepaymentReceived,
  raiseDispute,
  myLoans,
  getLoan,
  getConfig,
}
