const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const signAccessToken  = (p) => jwt.sign(p, process.env.JWT_ACCESS_SECRET,  { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN  || '15m' })
const signRefreshToken = (p) => jwt.sign(p, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'  })
const verifyAccessToken  = (t) => jwt.verify(t, process.env.JWT_ACCESS_SECRET)
const verifyRefreshToken = (t) => jwt.verify(t, process.env.JWT_REFRESH_SECRET)
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex')
module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, hashToken }
