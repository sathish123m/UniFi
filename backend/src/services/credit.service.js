const prisma = require('../config/db')
const { createId } = require('@paralleldrive/cuid2')

const SCORE_MIN = 300; const SCORE_MAX = 900

const updateScore = async (userId, delta, reason, loanId=null) => {
  const user = await prisma.user.findUnique({ where:{id:userId}, select:{creditScore:true} })
  const prev = user.creditScore
  const next = Math.min(SCORE_MAX, Math.max(SCORE_MIN, prev + delta))
  const borrowLimit = next >= 750 ? 10000 : next >= 600 ? 5000 : 2000
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
  ACCOUNT_AGE_30D:   +10,
  FIRST_LOAN:        +5,
}

module.exports = { updateScore, SCORE_EVENTS }
