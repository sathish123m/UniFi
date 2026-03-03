const router = require('express').Router()
const prisma = require('../config/db')
const { protect, requireKyc } = require('../middleware/auth')
const { validate, upiSchema } = require('../middleware/validate')
const { encrypt, decrypt } = require('../utils/encryption')
const { ok } = require('../utils/response')
const multer = require('multer')
const { createId } = require('@paralleldrive/cuid2')

const upload = multer({
  dest: 'uploads/kyc/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.mimetype)) return cb(new Error('Only JPG, PNG, WEBP files are allowed'))
    cb(null, true)
  },
})

router.use(protect)

router.get('/profile', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      phone: true,
      kycStatus: true,
      creditScore: true,
      borrowLimit: true,
      upiVerified: true,
      emailVerified: true,
      createdAt: true,
      university: { select: { name: true, shortName: true } },
    },
  })
  ok(res, user)
})

router.get('/dashboard', async (req, res) => {
  if (req.user.role === 'BORROWER') {
    const [loans, unread] = await Promise.all([
      prisma.loan.findMany({
        where: { borrowerId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ])

    const active = loans.find((l) => ['PENDING', 'FUNDED', 'ACTIVE'].includes(l.status)) || null
    return ok(res, {
      role: 'BORROWER',
      unreadNotifications: unread,
      activeLoan: active,
      totalLoans: loans.length,
      repaidLoans: loans.filter((l) => l.status === 'REPAID').length,
      totalBorrowed: loans.reduce((sum, l) => sum + l.principalAmount, 0),
      recentLoans: loans.slice(0, 5),
    })
  }

  if (req.user.role === 'PROVIDER') {
    const [fundedLoans, unread] = await Promise.all([
      prisma.loan.findMany({
        where: { providerId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ])

    const principalDeployed = fundedLoans.reduce((sum, l) => sum + l.principalAmount, 0)
    const earned = fundedLoans
      .filter((l) => l.status === 'REPAID')
      .reduce((sum, l) => sum + (l.providerEarning || 0), 0)

    return ok(res, {
      role: 'PROVIDER',
      unreadNotifications: unread,
      activeFundings: fundedLoans.filter((l) => l.status === 'ACTIVE').length,
      totalFundings: fundedLoans.length,
      principalDeployed,
      earned,
      recentFundings: fundedLoans.slice(0, 8),
    })
  }

  return ok(res, { role: req.user.role })
})

router.post(
  '/kyc',
  upload.fields([
    { name: 'studentIdFront', maxCount: 1 },
    { name: 'studentIdBack', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  async (req, res) => {
    if (!req.files?.studentIdFront || !req.files?.selfie) {
      return res.status(400).json({ success: false, message: 'Upload studentIdFront and selfie' })
    }

    const existing = await prisma.kycDocument.findUnique({ where: { userId: req.user.id } })
    if (existing) return res.status(409).json({ success: false, message: 'KYC already submitted' })

    await prisma.kycDocument.create({
      data: {
        id: createId(),
        userId: req.user.id,
        studentIdFrontKey: req.files.studentIdFront[0].path,
        studentIdBackKey: req.files.studentIdBack?.[0]?.path || null,
        selfieKey: req.files.selfie[0].path,
      },
    })

    ok(res, {}, 'KYC submitted. Under review.', 201)
  }
)

router.post('/upi', validate(upiSchema), async (req, res) => {
  const encrypted = encrypt(req.body.upiId)
  await prisma.user.update({ where: { id: req.user.id }, data: { upiId: encrypted, upiVerified: true } })
  ok(res, { upiVerified: true }, 'UPI ID linked')
})

router.get('/upi', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { upiId: true, upiVerified: true } })
  let upiId = null
  try {
    upiId = user.upiId ? decrypt(user.upiId) : null
  } catch {
    upiId = null
  }
  ok(res, { upiId, upiVerified: user.upiVerified })
})

router.get('/notifications', async (req, res) => {
  const n = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 50 })
  ok(res, n)
})

router.patch('/notifications/:id/read', async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { isRead: true, readAt: new Date() } })
  ok(res, {}, 'Marked as read')
})

router.get('/credit-history', requireKyc, async (req, res) => {
  const h = await prisma.creditScoreHistory.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 20 })
  ok(res, h)
})

module.exports = router
