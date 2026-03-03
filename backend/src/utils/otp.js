const bcrypt = require('bcrypt')
const generateOtp  = () => String(Math.floor(100000 + Math.random() * 900000))
const hashOtp      = (otp)      => bcrypt.hash(otp, 10)
const verifyOtp    = (otp, hash) => bcrypt.compare(otp, hash)
const otpExpiresAt = (mins = 10) => { const d = new Date(); d.setMinutes(d.getMinutes()+mins); return d }
module.exports = { generateOtp, hashOtp, verifyOtp, otpExpiresAt }
