const router = require('express').Router()
const prisma = require('../config/db')
const { protect, requireKyc } = require('../middleware/auth')
const { validate, upiSchema, updateProfileSchema, changePasswordSchema } = require('../middleware/validate')
const authSvc = require('../services/auth.service')
const { encrypt, decrypt } = require('../utils/encryption')
const {
  isValidAadhaar,
  normalizeAadhaar,
  isValidPan,
  normalizePan,
  validateDocumentImage,
} = require('../utils/kycValidation')
const { ok } = require('../utils/response')
const multer = require('multer')
const { createId } = require('@paralleldrive/cuid2')

const storageService = require('../services/storage.service')

const upload = multer({
  storage: multer.memoryStorage(),
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
      studentIdNumber: true,
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

// ── PATCH /users/profile — update editable profile fields ───────────────────
router.patch('/profile', validate(updateProfileSchema), async (req, res) => {
  const updated = await authSvc.updateProfile(req.user.id, req.body)
  ok(res, updated, 'Profile updated')
})

// ── PATCH /users/password — change password for a signed-in user ────────────
router.patch('/password', validate(changePasswordSchema), async (req, res) => {
  const result = await authSvc.changePassword(req.user.id, req.body)
  ok(res, {}, result.message)
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

    const principalDeployed = fundedLoans
      .filter((l) => ['FUNDED', 'ACTIVE', 'DEFAULTED'].includes(l.status))
      .reduce((sum, l) => sum + l.principalAmount, 0)
    const principalReturned = fundedLoans
      .filter((l) => l.status === 'REPAID')
      .reduce((sum, l) => sum + (l.totalRepayAmount || l.principalAmount), 0)
    const awaitingConfirmation = fundedLoans.filter((l) => l.status === 'FUNDED').length

    return ok(res, {
      role: 'PROVIDER',
      unreadNotifications: unread,
      activeFundings: fundedLoans.filter((l) => l.status === 'ACTIVE').length,
      totalFundings: fundedLoans.length,
      principalDeployed,
      principalReturned,
      awaitingConfirmation,
      recentFundings: fundedLoans.slice(0, 8),
    })
  }

  return ok(res, { role: req.user.role })
})

const MAX_BASE64_IMAGE_BYTES = 5 * 1024 * 1024

const parseBase64Image = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  // Only accept raster image types we actually store/validate. The old \w+ regex
  // also matched image/svg+xml, which can carry scripts.
  const matches = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i)
  if (!matches) return null
  const buffer = Buffer.from(matches[2], 'base64')
  if (!buffer.length || buffer.length > MAX_BASE64_IMAGE_BYTES) return null
  const mimetype = matches[1].toLowerCase().replace('jpg', 'jpeg')
  return {
    mimetype,
    buffer,
    originalname: `selfie_${Date.now()}.${mimetype.split('/')[1] || 'jpg'}`,
  }
}

// ── GET /users/kyc — Fetch user KYC status and documents ────────────────────
router.get('/kyc', async (req, res) => {
  const [user, kycDoc] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user.id },
      select: { kycStatus: true, kycReviewedAt: true, kycRejectReason: true, studentIdNumber: true },
    }),
    prisma.kycDocument.findUnique({ where: { userId: req.user.id } }),
  ])
  ok(res, {
    kycStatus: user?.kycStatus || 'PENDING',
    kycReviewedAt: user?.kycReviewedAt,
    kycRejectReason: user?.kycRejectReason,
    studentIdNumber: user?.studentIdNumber,
    hasStudentIdDoc: Boolean(kycDoc?.studentIdFrontKey),
    hasSelfie: Boolean(kycDoc?.selfieKey),
    hasAadhaar: Boolean(kycDoc?.aadhaarNumberEnc && kycDoc?.aadhaarFrontKey && kycDoc?.aadhaarBackKey),
    hasPan: Boolean(kycDoc?.panNumberEnc && kycDoc?.panDocKey),
    submittedAt: kycDoc?.submittedAt,
  })
})

// ── POST /users/kyc & /users/kyc/submit — Upload multi-doc KYC ───────────────
const kycUploadFields = upload.fields([
  { name: 'studentIdFront', maxCount: 1 },
  { name: 'studentIdBack', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
  { name: 'collegeIdDoc', maxCount: 1 },
  { name: 'aadhaarFront', maxCount: 1 },
  { name: 'aadhaarBack', maxCount: 1 },
  { name: 'panDoc', maxCount: 1 },
])

const handleKycSubmission = async (req, res) => {
  const collegeIdNum = req.body?.collegeIdNum || req.body?.studentIdNumber
  const livenessSelfieBase64 = req.body?.livenessSelfie

  let frontFile = req.files?.collegeIdDoc?.[0] || req.files?.studentIdFront?.[0]
  let selfieFile = req.files?.selfie?.[0]
  let backFile = req.files?.studentIdBack?.[0]

  // Government identity (Aadhaar + PAN)
  const aadhaarNumber = normalizeAadhaar(req.body?.aadhaarNumber)
  const panNumber = normalizePan(req.body?.panNumber)
  const aadhaarFrontFile = req.files?.aadhaarFront?.[0]
  const aadhaarBackFile = req.files?.aadhaarBack?.[0]
  const panDocFile = req.files?.panDoc?.[0]

  if (!selfieFile && livenessSelfieBase64) {
    const parsed = parseBase64Image(livenessSelfieBase64)
    if (parsed) selfieFile = parsed
  }

  // Require the two mandatory documents. No placeholders, no auto-approval.
  if (!frontFile) {
    return res.status(400).json({ success: false, message: 'Student ID / college ID document is required.' })
  }
  if (!selfieFile) {
    return res.status(400).json({ success: false, message: 'A live selfie is required.' })
  }

  // ── Format gate ────────────────────────────────────────────────────────────
  // Validate identity numbers and document images BEFORE persisting anything, so
  // an admin only ever manually reviews structurally-valid submissions. These
  // are format checks (pattern + Aadhaar Verhoeff checksum + real image bytes),
  // not proof of authenticity.
  if (!aadhaarNumber) {
    return res.status(400).json({ success: false, message: 'Aadhaar number is required.' })
  }
  if (!isValidAadhaar(aadhaarNumber)) {
    return res.status(400).json({ success: false, message: 'Enter a valid 12-digit Aadhaar number (the checksum did not match).' })
  }
  if (!panNumber) {
    return res.status(400).json({ success: false, message: 'PAN number is required.' })
  }
  if (!isValidPan(panNumber)) {
    return res.status(400).json({ success: false, message: 'Enter a valid PAN in the format ABCPZ1234K.' })
  }

  for (const [file, label] of [
    [frontFile, 'Student ID / college ID image'],
    [backFile, 'Student ID back image'],
    [selfieFile, 'Selfie'],
    [aadhaarFrontFile, 'Aadhaar front image'],
    [aadhaarBackFile, 'Aadhaar back image'],
    [panDocFile, 'PAN card image'],
  ]) {
    if (!file) continue
    const result = validateDocumentImage(file, label)
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message })
    }
  }

  const uploadImage = (file) =>
    storageService.uploadFile({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      folder: 'kyc',
    })

  const [frontRes, selfieRes, backRes, aadhaarFrontRes, aadhaarBackRes, panDocRes] = await Promise.all([
    uploadImage(frontFile),
    uploadImage(selfieFile),
    backFile ? uploadImage(backFile) : Promise.resolve(null),
    uploadImage(aadhaarFrontFile),
    uploadImage(aadhaarBackFile),
    uploadImage(panDocFile),
  ])

  // Aadhaar/PAN numbers are encrypted at rest (AES-256-GCM); never stored plain.
  const aadhaarNumberEnc = encrypt(aadhaarNumber)
  const panNumberEnc = encrypt(panNumber)

  // Save / Upsert KYC document record
  const previous = await prisma.kycDocument.findUnique({ where: { userId: req.user.id } })
  await prisma.kycDocument.upsert({
    where: { userId: req.user.id },
    create: {
      id: createId(),
      userId: req.user.id,
      studentIdFrontKey: frontRes.key,
      studentIdBackKey: backRes?.key || null,
      selfieKey: selfieRes.key,
      aadhaarNumberEnc,
      aadhaarFrontKey: aadhaarFrontRes.key,
      aadhaarBackKey: aadhaarBackRes.key,
      panNumberEnc,
      panDocKey: panDocRes.key,
    },
    update: {
      studentIdFrontKey: frontRes.key,
      studentIdBackKey: backRes?.key || undefined,
      selfieKey: selfieRes.key,
      aadhaarNumberEnc,
      aadhaarFrontKey: aadhaarFrontRes.key,
      aadhaarBackKey: aadhaarBackRes.key,
      panNumberEnc,
      panDocKey: panDocRes.key,
      submittedAt: new Date(),
    },
  })

  // Delete any objects the resubmission replaced so identity scans don't pile up
  // in storage. Best-effort: cleanup failures never fail the submission.
  if (previous) {
    const newKeys = new Set(
      [
        frontRes.key,
        backRes?.key,
        selfieRes.key,
        aadhaarFrontRes.key,
        aadhaarBackRes.key,
        panDocRes.key,
      ].filter(Boolean)
    )
    const candidates = [
      previous.studentIdFrontKey,
      previous.studentIdBackKey,
      previous.selfieKey,
      previous.aadhaarFrontKey,
      previous.aadhaarBackKey,
      previous.panDocKey,
    ].filter((k) => k && !newKeys.has(k))
    await Promise.allSettled(candidates.map((k) => storageService.deleteFile(k)))
  }

  // Submission goes to PENDING for admin review. Clear any prior rejection.
  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      studentIdNumber: collegeIdNum || undefined,
      kycStatus: 'PENDING',
      kycRejectReason: null,
      kycReviewedAt: null,
    },
  })

  ok(res, { kycStatus: 'PENDING' }, 'KYC documents submitted. Your verification is pending admin review.', 201)
}

router.post('/kyc', kycUploadFields, handleKycSubmission)
router.post('/kyc/submit', kycUploadFields, handleKycSubmission)

// ── POST /users/kyc/liveness — Camera selfie upload (one step of KYC) ────────
router.post('/kyc/liveness', upload.single('selfie'), async (req, res) => {
  let selfieData = req.file
  if (!selfieData && req.body?.selfie) {
    selfieData = parseBase64Image(req.body.selfie)
  }

  if (!selfieData) {
    return res.status(400).json({ success: false, message: 'Selfie image is required (upload file or base64)' })
  }

  const selfieCheck = validateDocumentImage(selfieData, 'Selfie')
  if (!selfieCheck.ok) {
    return res.status(400).json({ success: false, message: selfieCheck.message })
  }

  const uploaded = await storageService.uploadFile({
    buffer: selfieData.buffer,
    originalname: selfieData.originalname,
    mimetype: selfieData.mimetype,
    folder: 'kyc',
  })

  const previousSelfie = await prisma.kycDocument.findUnique({
    where: { userId: req.user.id },
    select: { selfieKey: true },
  })

  await prisma.kycDocument.upsert({
    where: { userId: req.user.id },
    create: {
      id: createId(),
      userId: req.user.id,
      selfieKey: uploaded.key,
    },
    update: {
      selfieKey: uploaded.key,
      submittedAt: new Date(),
    },
  })

  if (previousSelfie?.selfieKey && previousSelfie.selfieKey !== uploaded.key) {
    await storageService.deleteFile(previousSelfie.selfieKey)
  }

  // Storing a document does NOT verify the user. Keep/return to PENDING.
  await prisma.user.update({
    where: { id: req.user.id },
    data: { kycStatus: 'PENDING' },
  })

  ok(res, { selfieKey: uploaded.key, kycStatus: 'PENDING' }, 'Liveness selfie saved. KYC pending admin review.')
})

// ── POST /users/kyc/id-card — Direct ID card upload (one step of KYC) ────────
router.post('/kyc/id-card', upload.single('idCard'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'ID card file is required' })
  }

  const idCheck = validateDocumentImage(req.file, 'ID card')
  if (!idCheck.ok) {
    return res.status(400).json({ success: false, message: idCheck.message })
  }

  const uploaded = await storageService.uploadFile({
    buffer: req.file.buffer,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    folder: 'kyc',
  })

  const previousIdCard = await prisma.kycDocument.findUnique({
    where: { userId: req.user.id },
    select: { studentIdFrontKey: true },
  })

  await prisma.kycDocument.upsert({
    where: { userId: req.user.id },
    create: {
      id: createId(),
      userId: req.user.id,
      studentIdFrontKey: uploaded.key,
    },
    update: {
      studentIdFrontKey: uploaded.key,
      submittedAt: new Date(),
    },
  })

  if (previousIdCard?.studentIdFrontKey && previousIdCard.studentIdFrontKey !== uploaded.key) {
    await storageService.deleteFile(previousIdCard.studentIdFrontKey)
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      studentIdNumber: req.body?.collegeIdNum || undefined,
      kycStatus: 'PENDING',
    },
  })

  ok(res, { studentIdFrontKey: uploaded.key, kycStatus: 'PENDING' }, 'ID card saved. KYC pending admin review.')
})

router.post('/upi', validate(upiSchema), async (req, res) => {
  const encrypted = encrypt(req.body.upiId)
  // NOTE: upiSchema validates the VPA format only. There is no bank/penny-drop
  // verification in this build, so "verified" here means "format-validated + linked".
  // A production system should confirm ownership via a penny-drop or UPI_VERIFY OTP.
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
