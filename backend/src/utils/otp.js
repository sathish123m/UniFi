const bcrypt = require('bcrypt')
const crypto = require('crypto')
// Cryptographically secure 6-digit OTP (100000–999999). Math.random() is not
// suitable for security tokens as its output is predictable.
const generateOtp  = () => String(crypto.randomInt(100000, 1000000))
const hashOtp      = (otp)      => bcrypt.hash(otp, 10)
const verifyOtp    = (otp, hash) => bcrypt.compare(otp, hash)
const otpExpiresAt = (mins = 10) => { const d = new Date(); d.setMinutes(d.getMinutes()+mins); return d }
module.exports = { generateOtp, hashOtp, verifyOtp, otpExpiresAt }
