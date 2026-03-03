const TENURE_DAYS = { SEVEN: 7, FOURTEEN: 14, THIRTY: 30 }
const calculateLoan = (principal, tenure, interestRate, platformFeeRate) => {
  const interestAmount    = Math.round(principal * (interestRate   / 100))
  const platformFeeAmount = Math.round(interestAmount * (platformFeeRate / 100))
  const totalRepayAmount  = principal + interestAmount
  const providerEarning   = interestAmount - platformFeeAmount
  const dueAt = new Date(); dueAt.setDate(dueAt.getDate() + TENURE_DAYS[tenure])
  return { interestAmount, platformFeeAmount, totalRepayAmount, providerEarning, dueAt }
}
const generatePublicId = (seq) => `UniFi#${String(seq).padStart(5,'0')}`
module.exports = { calculateLoan, generatePublicId, TENURE_DAYS }
