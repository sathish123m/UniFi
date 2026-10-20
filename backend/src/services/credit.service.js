const prisma = require('../config/db')
const { createId } = require('@paralleldrive/cuid2')
const { getPlatformConfig } = require('./platformConfig.service')

const SCORE_MIN = 300; const SCORE_MAX = 900

// Fallback tiers used only when no PlatformConfig row exists yet. These mirror
// the schema defaults for PlatformConfig.scoreTier* so behaviour is identical.
const DEFAULT_TIERS = { t1: 2000, t2Min: 600, t2: 5000, t3Min: 750, t3: 10000 }

// Borrow limit is derived from the credit score using admin-configurable tiers
// (PlatformConfig.scoreTier*), not hardcoded numbers, so finance admins can tune
// limits without a code change.
const borrowLimitForScore = (score, cfg) => {
  const t2Min = Number(cfg?.scoreTier2MinScore ?? DEFAULT_TIERS.t2Min)
  const t3Min = Number(cfg?.scoreTier3MinScore ?? DEFAULT_TIERS.t3Min)
  const t1 = Number(cfg?.scoreTier1Limit ?? DEFAULT_TIERS.t1)
  const t2 = Number(cfg?.scoreTier2Limit ?? DEFAULT_TIERS.t2)
  const t3 = Number(cfg?.scoreTier3Limit ?? DEFAULT_TIERS.t3)
  if (score >= t3Min) return t3
  if (score >= t2Min) return t2
  return t1
}

const updateScore = async (userId, delta, reason, loanId=null) => {
  const user = await prisma.user.findUnique({ where:{id:userId}, select:{creditScore:true} })
  const prev = user.creditScore
  const next = Math.min(SCORE_MAX, Math.max(SCORE_MIN, prev + delta))
  const cfg = await getPlatformConfig()
  const borrowLimit = borrowLimitForScore(next, cfg)
  await prisma.$transaction([
    prisma.user.update({ where:{id:userId}, data:{creditScore:next, borrowLimit} }),
    prisma.creditScoreHistory.create({ data:{ id:createId(), userId, previousScore:prev, newScore:next, delta:next-prev, reason, loanId } })
  ])
  return { previousScore:prev, newScore:next, delta:next-prev }
}

const SCORE_EVENTS = {
  ON_TIME_REPAYMENT: +30,
  LATE_REPAYMENT:    -20,
  DEFAULT:           -80,
}

module.exports = { updateScore, SCORE_EVENTS }
