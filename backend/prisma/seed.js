// prisma/seed.js
// Run with: node prisma/seed.js
// Or add to package.json: "prisma": { "seed": "node prisma/seed.js" }
require('dotenv').config()

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const { createId } = require('@paralleldrive/cuid2')
const crypto = require('crypto')

const prisma = new PrismaClient()
const ALG = 'aes-256-cbc'
const ENC_KEY = () => Buffer.from(process.env.ENCRYPTION_KEY || '0'.repeat(64), 'hex')
const encrypt = (text) => {
  const iv = crypto.randomBytes(16)
  const c = crypto.createCipheriv(ALG, ENC_KEY(), iv)
  return iv.toString('hex') + ':' + Buffer.concat([c.update(text, 'utf8'), c.final()]).toString('hex')
}

async function main() {
  console.log('🌱 Seeding UniFi database...\n')
  const allowedDomain = String(process.env.ALLOWED_UNIVERSITY_DOMAIN || 'lpu.in').trim().toLowerCase()
  const allowedUniversityId = 'uni_lpu'

  // ── Universities ──────────────────────────────────────
  console.log('📍 Creating universities...')
  const uni = {
    id: allowedUniversityId,
    name: 'Lovely Professional University',
    shortName: 'LPU',
    emailDomain: allowedDomain,
    city: 'Phagwara',
    state: 'Punjab',
    isActive: true,
  }

  await prisma.university.upsert({
    where: { emailDomain: uni.emailDomain },
    update: {
      name: uni.name,
      shortName: uni.shortName,
      city: uni.city,
      state: uni.state,
      isActive: true,
    },
    create: uni,
  })
  await prisma.university.updateMany({
    where: { emailDomain: { not: allowedDomain } },
    data: { isActive: false },
  })
  console.log(`   ✓ 1 university active (${allowedDomain})\n`)

  // ── Platform Config ───────────────────────────────────
  console.log('⚙️  Creating default platform config...')
  await prisma.platformConfig.upsert({
    where: { id: 'config_default' },
    update: {},
    create: {
      id: 'config_default',
      interestRatePercent: 5.0,
      platformFeePercent: 10.0,
      minLoanAmount: 500,
      maxLoanAmount: 10000,
      scoreTier1MinScore: 300, scoreTier1Limit: 2000,
      scoreTier2MinScore: 600, scoreTier2Limit: 5000,
      scoreTier3MinScore: 750, scoreTier3Limit: 10000,
      providerAcceptWindowHours: 24,
      providerFundWindowHours: 2,
      createdByAdminId: 'admin_super_001',
    },
  })
  console.log('   ✓ Platform config seeded\n')

  // ── Super Admin ───────────────────────────────────────
  console.log('🛡️  Creating super admin...')
  const adminPassword = await bcrypt.hash('Admin@UniFi#2025', 12)
  await prisma.user.upsert({
    where: { id: 'admin_super_001' },
    update: {},
    create: {
      id: 'admin_super_001',
      email: 'admin@unifi.campus',
      passwordHash: adminPassword,
      role: 'SUPER_ADMIN',
      firstName: 'UniFi',
      lastName: 'Admin',
      kycStatus: 'APPROVED',
      emailVerified: true,
      isActive: true,
    },
  })
  console.log('   ✓ Super admin created → admin@unifi.campus\n')

  // ── Demo Users (dev only) ─────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    console.log('👥 Creating demo users (dev only)...')

    const demoPass = await bcrypt.hash('Demo@1234', 12)

    // Demo Borrower
    await prisma.user.upsert({
      where: { email: `borrower@${allowedDomain}` },
      update: {},
      create: {
        id: 'demo_borrower_001',
        email: `borrower@${allowedDomain}`,
        passwordHash: demoPass,
        role: 'BORROWER',
        firstName: 'Arjun',
        lastName: 'Sharma',
        universityId: allowedUniversityId,
        studentIdNumber: 'LPU20CSE0042',
        kycStatus: 'APPROVED',
        emailVerified: true,
        upiId: encrypt('arjun.sharma@okicici'),
        upiVerified: true,
        creditScore: 680,
        borrowLimit: 5000,
        isActive: true,
      },
    })

    // Demo Provider
    await prisma.user.upsert({
      where: { email: `provider@${allowedDomain}` },
      update: {},
      create: {
        id: 'demo_provider_001',
        email: `provider@${allowedDomain}`,
        passwordHash: demoPass,
        role: 'PROVIDER',
        firstName: 'Rohan',
        lastName: 'Mehta',
        universityId: allowedUniversityId,
        studentIdNumber: 'LPU20CSE0089',
        kycStatus: 'APPROVED',
        emailVerified: true,
        upiId: encrypt('rohan.mehta@okhdfc'),
        upiVerified: true,
        creditScore: 750,
        isActive: true,
      },
    })

    // Demo Pending KYC user
    await prisma.user.upsert({
      where: { email: `newuser@${allowedDomain}` },
      update: {},
      create: {
        id: 'demo_pending_001',
        email: `newuser@${allowedDomain}`,
        passwordHash: demoPass,
        role: 'BORROWER',
        firstName: 'Priya',
        lastName: 'Nair',
        universityId: allowedUniversityId,
        kycStatus: 'PENDING',
        emailVerified: true,
        isActive: true,
      },
    })

    console.log(`   ✓ Demo borrower  → borrower@${allowedDomain} / Demo@1234`)
    console.log(`   ✓ Demo provider  → provider@${allowedDomain} / Demo@1234`)
    console.log(`   ✓ Demo pending   → newuser@${allowedDomain} / Demo@1234\n`)

    // Demo Loan (active)
    console.log('💳 Creating demo loan...')
    const existingLoan = await prisma.loan.findFirst({ where: { publicId: 'UniFi#0001' } })
    if (!existingLoan) {
      const now = new Date()
      const dueAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      await prisma.loan.create({
        data: {
          id: 'demo_loan_001',
          borrowerId: 'demo_borrower_001',
          providerId: 'demo_provider_001',
          principalAmount: 2000,
          interestAmount: 100,
          platformFeeAmount: 10,
          totalRepayAmount: 2100,
          providerEarning: 90,
          interestRate: 5.0,
          platformFeeRate: 10.0,
          tenure: 'THIRTY',
          purpose: 'FOOD',
          purposeNote: 'Mess fee',
          publicId: 'UniFi#0001',
          status: 'ACTIVE',
          fundedAt: now,
          disbursedAt: now,
          dueAt,
        },
      })
      console.log('   ✓ Demo loan UniFi#0001 created (ACTIVE)\n')
    }
  }

  console.log('✅ Seeding complete!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('IMPORTANT: Change the admin password immediately!')
  console.log('Admin: admin@unifi.campus / Admin@UniFi#2025')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
