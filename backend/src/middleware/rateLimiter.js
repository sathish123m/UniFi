const rateLimit = require('express-rate-limit')
const make = (windowMs,max,msg) => rateLimit({windowMs,max,standardHeaders:true,legacyHeaders:false,message:{success:false,message:msg}})
const globalRateLimiter = make(60*1000, 100, 'Too many requests')
const authRateLimiter   = make(15*60*1000, 10, 'Too many auth attempts, try again in 15 minutes')
const otpRateLimiter    = make(60*1000, 3, 'Too many OTP requests')
module.exports = { globalRateLimiter, authRateLimiter, otpRateLimiter }
