const router = require('express').Router()
const bcrypt = require('bcrypt')
const prisma = require('../config/db')
const { protect, restrictTo } = require('../middleware/auth')
const { ok } = require('../utils/response')
const { createId } = require('@paralleldrive/cuid2')
const loanSvc = require('../services/loan.service')

const isAdmin = [protect, restrictTo('SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN')]
router.use(...isAdmin)

router.get('/stats', async (req, res) => {
  const [users, loans, activeLoan, revenue, pendingKyc] = await Promise.all([
    prisma.user.count({ where: { role: { in: ['BORROWER', 'PROVIDER'] } } }),
    prisma.loan.count(),
    prisma.loan.count({ where: { status: 'ACTIVE' } }),
    prisma.transaction.aggregate({
      where: { type: 'PLATFORM_FEE', status: 'SUCCESS' },
      _sum: { amount: true },
    }),
    prisma.user.count({ where: { kycStatus: 'PENDING' } }),
  ])

  ok(res, {
    users,
    loans,
    activeLoan,
    revenue: revenue._sum.amount || 0,
    pendingKyc,
  })
})

router.get('/kyc/queue', async (req, res) => {
  const queue = await prisma.user.findMany({
    where: { kycStatus: 'PENDING' },
    include: { kycDocument: true, university: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  ok(res, queue)
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

  await prisma.user.update({ where: { id: req.params.id }, data })
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

router.post('/admins', restrictTo('SUPER_ADMIN'), async (req, res) => {
  const { email, password, firstName, lastName, role } = req.body
  if (!['MOD_ADMIN', 'FINANCE_ADMIN'].includes(role)) {
    return res.status(400).json({ success: false, message: 'role must be MOD_ADMIN or FINANCE_ADMIN' })
  }

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ success: false, message: 'email, password, firstName, lastName are required' })
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

router.post('/config', restrictTo('SUPER_ADMIN', 'FINANCE_ADMIN'), async (req, res) => {
  const cfg = await prisma.platformConfig.create({
    data: {
      id: createId(),
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

  ok(res, cfg, 'Config updated', 201)
})

module.exports = router
