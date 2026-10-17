// UniFi is non-custodial and interest-free. Peers settle money directly between
// themselves, so the platform never computes interest, fees or earnings: a
// loan's repayable amount is exactly its principal.
const calculateLoan = (principalAmount) => ({
  interestAmount: 0,
  platformFeeAmount: 0,
  totalRepayAmount: principalAmount,
  providerEarning: 0,
})

const generatePublicId = (seq) => `UniFi#${String(seq).padStart(5, '0')}`

module.exports = { calculateLoan, generatePublicId }
