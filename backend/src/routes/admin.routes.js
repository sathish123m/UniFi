const router = require('express').Router()
const bcrypt = require('bcrypt')
const prisma = require('../config/db')
const { protect, restrictTo } = require('../middleware/auth')
const { ok } = require('../utils/response')
const { createId } = require('@paralleldrive/cuid2')
const { validate, platformConfigSchema, adminCreateSchema } = require('../middleware/validate')
const loanSvc = require('../services/loan.service')
const storageService = require('../services/storage.service')
const { decrypt } = require('../utils/encryption')
const cache = require('../utils/cache')
const { invalidatePlatformConfig } = require('../services/platformConfig.service')

const isAdmin = [protect, restrictTo('SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN')]
router.use(...isAdmin)

router.get('/stats', async (req, res) => {
  const [users, loans, activeLoan, disputes, pendingKyc] = await Promise.all([
    prisma.user.count({ where: { role: { in: ['BORROWER', 'PROVIDER'] } } }),
    prisma.loan.count(),
    prisma.loan.count({ where: { status: 'ACTIVE' } }),
    prisma.loan.count({ where: { disputedAt: { not: null } } }),
    prisma.user.count({ where: { kycStatus: 'PENDING' } }),
  ])

  ok(res, {
    users,
    loans,
    activeLoan,
    disputes,
    pendingKyc,
  })
})

// Decrypt the identity numbers for admin review and drop the raw ciphertext so
// the encrypted blobs never leave the server. Returns a display-safe copy.
// Only SUPER_ADMIN / MOD_ADMIN see the plaintext ID numbers; FINANCE_ADMIN
// gets the queue shape without decrypted government IDs.
const safeKycDocument = (doc, { decryptPii = true } = {}) => {
  if (!doc) return doc
  const { aadhaarNumberEnc, panNumberEnc, ...rest } = doc
  if (!decryptPii) return { ...rest, aadhaarNumber: null, panNumber: null }
  let aadhaarNumber = null
  let panNumber = null
  try { aadhaarNumber = aadhaarNumberEnc ? decrypt(aadhaarNumberEnc) : null } catch { aadhaarNumber = null }
  try { panNumber = panNumberEnc ? decrypt(panNumberEnc) : null } catch { panNumber = null }
  return { ...rest, aadhaarNumber, panNumber }
}

// Columns the admin queue / user drawer really needs. Explicit select prevents
// accidentially leaking passwordHash, upiId ciphertext and other private rows.
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  phone: true,
  studentIdNumber: true,
  kycStatus: true,
  kycRejectReason: true,
  creditScore: true,
  borrowLimit: true,
  isSuspended: true,
  isBanned: true,
  createdAt: true,
  university: { select: { name: true, shortName: true } },
}

router.get('/kyc/queue', async (req, res) => {
  const canSeeGovernmentIds = ['SUPER_ADMIN', 'MOD_ADMIN'].includes(req.user.role)
  const queue = await prisma.user.findMany({
    where: { kycStatus: 'PENDING' },
    select: { ...ADMIN_USER_SELECT, kycDocument: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  ok(res, queue.map((u) => ({ ...u, kycDocument: safeKycDocument(u.kycDocument, { decryptPii: canSeeGovernmentIds }) })))
})

// ── GET /admin/kyc/:userId/document/:type — stream a KYC document image ──────
// Reviewers need to actually see the uploaded ID / selfie, not just booleans.
// Access is already gated to MOD/SUPER admins by the router-level restrictTo.
const KYC_DOC_KEY_FIELD = {
  idFront: 'studentIdFrontKey',
  idBack: 'studentIdBackKey',
  selfie: 'selfieKey',
  aadhaarFront: 'aadhaarFrontKey',
  aadhaarBack: 'aadhaarBackKey',
  panDoc: 'panDocKey',
}

router.get('/kyc/:userId/document/:type', restrictTo('SUPER_ADMIN', 'MOD_ADMIN'), async (req, res) => {
  const field = KYC_DOC_KEY_FIELD[req.params.type]
  if (!field) {
    return res.status(400).json({ success: false, message: 'type must be idFront, idBack, selfie, aadhaarFront, aadhaarBack or panDoc' })
  }

  const doc = await prisma.kycDocument.findUnique({ where: { userId: req.params.userId } })
  const key = doc?.[field]
  if (!key) return res.status(404).json({ success: false, message: 'Document not found' })

  let file
  try {
    file = await storageService.getFile(key)
  } catch {
    return res.status(404).json({ success: false, message: 'Document not available' })
  }

  res.setHeader('Content-Type', file.contentType)
  res.setHeader('Cache-Control', 'private, no-store')
  return res.send(file.buffer)
})

router.patch('/kyc/:userId', restrictTo('SUPER_ADMIN', 'MOD_ADMIN'), async (req, res) => {
  const { action, reason } = req.body
  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return res.status(400).json({ success: false, message: 'action must be APPROVED or REJECTED' })
  }

  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: {
      kycStatus: action,
      kycReviewedAt: new Date(),
      kycReviewedById: req.user.id,
      ...(action === 'REJECTED' && { kycRejectReason: reason || 'Not specified' }),
    },
  })

  await prisma.auditLog.create({
    data: {
      id: createId(),
      adminId: req.user.id,
      action: 'KYC_REVIEWED',
      targetType: 'User',
      targetId: user.id,
      description: `KYC ${action} for ${user.email}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    },
  })

  ok(res, { kycStatus: user.kycStatus }, `KYC ${action}`)
})

router.get('/users', async (req, res) => {
  const { role, kyc, q, page = 1 } = req.query
  const numericPage = Math.max(Number(page) || 1, 1)
  const where = {}
  if (role) where.role = role
  if (kyc) where.kycStatus = kyc
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (numericPage - 1) * 20,
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        kycStatus: true,
        creditScore: true,
        isSuspended: true,
        isBanned: true,
        createdAt: true,
        university: { select: { shortName: true } },
      },
    }),
    prisma.user.count({ where }),
  ])

  ok(res, { users, total, pages: Math.ceil(total / 20) })
})

router.patch('/users/:id/status', restrictTo('SUPER_ADMIN', 'MOD_ADMIN'), async (req, res) => {
  const { action, reason } = req.body
  const data =
    action === 'SUSPEND'
      ? { isSuspended: true, suspendReason: reason || 'Suspended by admin' }
      : action === 'BAN'
      ? { isBanned: true, suspendReason: reason || 'Banned by admin' }
      : action === 'RESTORE'
      ? { isSuspended: false, isBanned: false, suspendReason: null }
      : null

  if (!data) return res.status(400).json({ success: false, message: 'Invalid action' })

  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, role: true, isSuspended: true, isBanned: true },
  })
  if (!target) return res.status(404).json({ success: false, message: 'User not found' })

  // Moderators may not act on admin accounts or on themselves.
  const isAdminRole = ['SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN'].includes(target.role)
  if (target.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot change your own account status' })
  }
  if (isAdminRole && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Only the super admin can moderate admin accounts' })
  }
  // Never lock out the platform: keep at least one active SUPER_ADMIN.
  if (target.role === 'SUPER_ADMIN' && action !== 'RESTORE') {
    const activeSupers = await prisma.user.count({
      where: { role: 'SUPER_ADMIN', isBanned: false, isSuspended: false, isActive: true },
    })
    if (activeSupers <= 1) {
      return res.status(400).json({ success: false, message: 'Cannot disable the last active super admin' })
    }
  }

  await prisma.user.update({ where: { id: req.params.id }, data })
  // Revoke sessions so a banned/suspended account cannot keep refreshing tokens.
  if (action !== 'RESTORE') {
    await prisma.refreshToken.updateMany({
      where: { userId: req.params.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
  await prisma.auditLog.create({
    data: {
      id: createId(),
      adminId: req.user.id,
      action: action === 'SUSPEND' ? 'USER_SUSPENDED' : action === 'BAN' ? 'USER_BANNED' : 'USER_RESTORED',
      targetType: 'User',
      targetId: req.params.id,
      description: `${action} by admin: ${reason || ''}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    },
  })

  ok(res, {}, `User ${action.toLowerCase()}d`)
})

router.get('/loans', async (req, res) => {
  const { status, page = 1 } = req.query
  const numericPage = Math.max(Number(page) || 1, 1)
  const where = status ? { status } : {}

  const [loans, total] = await Promise.all([
    prisma.loan.findMany({
      where,
      skip: (numericPage - 1) * 20,
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        borrower: { select: { email: true, firstName: true } },
        provider: { select: { email: true, firstName: true } },
      },
    }),
    prisma.loan.count({ where }),
  ])

  ok(res, { loans, total, pages: Math.ceil(total / 20) })
})

router.post('/collections/sweep', restrictTo('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  ok(res, await loanSvc.sweepDelinquency(), 'Collections sweep completed')
})

router.get('/collections/queue', async (req, res) => {
  const { minDays = 1 } = req.query
  await loanSvc.sweepDelinquency()

  const queue = await prisma.loan.findMany({
    where: {
      OR: [
        { status: 'DEFAULTED' },
        { status: 'ACTIVE', isOverdue: true, overdueDays: { gte: Number(minDays) || 1 } },
      ],
    },
    orderBy: [{ overdueDays: 'desc' }, { dueAt: 'asc' }],
    take: 200,
    include: {
      borrower: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, isSuspended: true } },
      provider: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  })

  ok(res, queue)
})

// ── Disputes & admin overrides (record-only) ─────────────────────────────────
// Either peer can flag a dispute; these are surfaced here for campus admins to
// review. Admins can also force a stuck loan forward when both peers confirmed
// offline (or resolve it as repaid).
router.get('/disputes', async (req, res) => {
  const disputes = await prisma.loan.findMany({
    where: { disputedAt: { not: null } },
    orderBy: { disputedAt: 'desc' },
    take: 200,
    include: {
      borrower: { select: { id: true, email: true, firstName: true, lastName: true } },
      provider: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  })
  ok(res, disputes)
})

router.post('/loans/:id/force-active', restrictTo('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  const loan = await loanSvc.markDisbursed(req.params.id)
  await prisma.auditLog.create({
    data: {
      id: createId(),
      adminId: req.user.id,
      action: 'LOAN_FORCE_ACTIVE',
      targetType: 'Loan',
      targetId: req.params.id,
      description: 'Admin forced the loan active (handover confirmed offline)',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    },
  })
  ok(res, loan, 'Loan marked active')
})

router.post('/loans/:id/force-repaid', restrictTo('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  const loan = await loanSvc.markRepaid(req.params.id)
  await prisma.auditLog.create({
    data: {
      id: createId(),
      adminId: req.user.id,
      action: 'LOAN_FORCE_REPAID',
      targetType: 'Loan',
      targetId: req.params.id,
      description: 'Admin marked the loan repaid (repayment confirmed offline)',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    },
  })
  ok(res, loan, 'Loan marked repaid')
})

router.get('/audit', restrictTo('SUPER_ADMIN'), async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { admin: { select: { email: true, firstName: true } } },
  })
  ok(res, logs)
})

router.get('/admins', restrictTo('SUPER_ADMIN'), async (req, res) => {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN'] } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isSuspended: true,
      isBanned: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  ok(res, admins)
})

router.post('/admins', restrictTo('SUPER_ADMIN'), validate(adminCreateSchema), async (req, res) => {
  const { email, password, firstName, lastName, role } = req.body
  if (!['MOD_ADMIN', 'FINANCE_ADMIN'].includes(role)) {
    return res.status(400).json({ success: false, message: 'role must be MOD_ADMIN or FINANCE_ADMIN' })
  }

  const normalizedEmail = String(email).trim().toLowerCase()
  const existing = await prisma.user.findFirst({ where: { email: normalizedEmail, role: { in: ['SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN'] } } })
  if (existing) return res.status(409).json({ success: false, message: 'Email already exists' })

  const passwordHash = await bcrypt.hash(password, 12)
  const admin = await prisma.user.create({
    data: {
      id: createId(),
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      role,
      emailVerified: true,
      isActive: true,
      kycStatus: 'APPROVED',
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true,
    },
  })

  await prisma.auditLog.create({
    data: {
      id: createId(),
      adminId: req.user.id,
      action: 'ADMIN_CREATED',
      targetType: 'User',
      targetId: admin.id,
      description: `Admin ${admin.email} created as ${role}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    },
  })

  ok(res, admin, 'Admin created', 201)
})

router.get('/config', async (req, res) => {
  ok(res, await prisma.platformConfig.findFirst({ orderBy: { createdAt: 'desc' } }))
})

router.post('/config', restrictTo('SUPER_ADMIN', 'FINANCE_ADMIN'), validate(platformConfigSchema), async (req, res) => {
  // Config is versioned by inserting a new row (getConfig reads the latest by
  // createdAt). A bare create with only the submitted fields would reset every
  // field the admin didn't send back to the Prisma column default, silently
  // wiping the current borrowing limits / score tiers. Carry forward the
  // current config and overlay just the submitted changes.
  const current = await prisma.platformConfig.findFirst({ orderBy: { createdAt: 'desc' } })
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    createdByAdminId: _prevAdmin,
    ...carried
  } = current || {}

  const cfg = await prisma.platformConfig.create({
    data: {
      id: createId(),
      ...carried,
      ...req.body,
      createdByAdminId: req.user.id,
    },
  })

  await prisma.auditLog.create({
    data: {
      id: createId(),
      adminId: req.user.id,
      action: 'PLATFORM_CONFIG_CHANGED',
      targetType: 'Config',
      targetId: cfg.id,
      description: 'Platform config updated',
      metadata: req.body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
    },
  })

  await invalidatePlatformConfig()
  ok(res, cfg, 'Config updated', 201)
})

// ── Universities (multi-campus management) ───────────────────────────────────
// The database is the source of truth for which campuses may sign up. The
// ALLOWED_UNIVERSITY_DOMAINS env var only bootstraps/self-heals rows, so a
// SUPER_ADMIN can onboard a new campus here without a redeploy.
router.get('/universities', restrictTo('SUPER_ADMIN'), async (req, res) => {
  const list = await prisma.university.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { users: true } } },
  })
  ok(res, list)
})

router.post('/universities', restrictTo('SUPER_ADMIN'), async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const shortName = String(req.body?.shortName || '').trim()
  const emailDomain = String(req.body?.emailDomain || '').trim().toLowerCase().replace(/^@/, '')
  const city = String(req.body?.city || '').trim()
  const state = String(req.body?.state || '').trim()

  if (!name || !shortName || !emailDomain || !city || !state) {
    return res.status(400).json({ success: false, message: 'name, shortName, emailDomain, city and state are required' })
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(emailDomain)) {
    return res.status(400).json({ success: false, message: 'emailDomain must look like "college.edu.in"' })
  }

  const existing = await prisma.university.findFirst({
    where: { OR: [{ emailDomain }, { shortName }] },
    select: { id: true },
  })
  if (existing) {
    return res.status(409).json({ success: false, message: 'A university with that domain or short name already exists' })
  }

  const created = await prisma.university.create({
    data: { id: createId(), name, shortName, emailDomain, city, state, isActive: true },
  })
  await cache.del(cache.KEYS.publicUniversities)
  ok(res, created, 'University added', 201)
})

router.patch('/universities/:id', restrictTo('SUPER_ADMIN'), async (req, res) => {
  const data = {}
  for (const field of ['name', 'shortName', 'city', 'state']) {
    if (typeof req.body?.[field] === 'string') data[field] = req.body[field].trim()
  }
  if (typeof req.body?.isActive === 'boolean') data.isActive = req.body.isActive
  if (req.body?.emailDomain) {
    const domain = String(req.body.emailDomain).trim().toLowerCase().replace(/^@/, '')
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      return res.status(400).json({ success: false, message: 'emailDomain must look like "college.edu.in"' })
    }
    data.emailDomain = domain
  }
  if (!Object.keys(data).length) {
    return res.status(400).json({ success: false, message: 'No supported fields to update' })
  }

  try {
    const updated = await prisma.university.update({ where: { id: req.params.id }, data })
    await cache.del(cache.KEYS.publicUniversities)
    ok(res, updated, 'University updated')
  } catch {
    res.status(404).json({ success: false, message: 'University not found' })
  }
})

// ── GET /admin/ledger/summary — record-only campus ledger (read model) ───────
// UniFi is non-custodial: there are no payouts to settle. This shows, per peer
// who has lent, how much principal is currently out and how much has come back,
// plus a platform-wide dispute count for follow-up.
router.get('/ledger/summary', restrictTo('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  const loans = await prisma.loan.findMany({
    where: { status: { in: ['FUNDED', 'ACTIVE', 'REPAID', 'DEFAULTED'] }, providerId: { not: null } },
    select: { providerId: true, status: true, principalAmount: true },
  })

  const byProvider = new Map()
  const totals = { deployedPrincipal: 0, returnedPrincipal: 0 }
  for (const loan of loans) {
    const key = loan.providerId
    if (!byProvider.has(key)) {
      byProvider.set(key, { providerId: key, deployedPrincipal: 0, returnedPrincipal: 0 })
    }
    const row = byProvider.get(key)
    if (loan.status === 'REPAID') {
      row.returnedPrincipal += loan.principalAmount
      totals.returnedPrincipal += loan.principalAmount
    } else {
      row.deployedPrincipal += loan.principalAmount
      totals.deployedPrincipal += loan.principalAmount
    }
  }

  const [providers, disputeCount] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...byProvider.keys()] } },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
    prisma.loan.count({ where: { disputedAt: { not: null } } }),
  ])
  const nameById = new Map(providers.map((p) => [p.id, p]))

  const rows = [...byProvider.values()]
    .map((r) => ({ ...r, provider: nameById.get(r.providerId) || null }))
    .sort((a, b) => b.deployedPrincipal - a.deployedPrincipal)

  ok(res, { totals: { ...totals, disputeCount }, providers: rows })
})

module.exports = router
