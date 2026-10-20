const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const signAccessToken  = (p) => jwt.sign(p, process.env.JWT_ACCESS_SECRET,  { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN  || '15m', algorithm: 'HS256' })
// A refresh token must be unique on every issuance: tokens are stored by
// SHA-256 hash with a UNIQUE constraint, and two signings of the same payload
// inside the same second would otherwise produce byte-identical JWTs (same
// `iat`). That made "refresh right after login" fail with a duplicate-key error.
const signRefreshToken = (p) => jwt.sign({ ...p, jti: crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', algorithm: 'HS256'  })
// Pin the accepted algorithm to HS256 so a token forged with `alg: none` (or any
// other algorithm) is rejected outright — defends against algorithm-confusion attacks.
const verifyAccessToken  = (t) => jwt.verify(t, process.env.JWT_ACCESS_SECRET,  { algorithms: ['HS256'] })
const verifyRefreshToken = (t) => jwt.verify(t, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] })
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex')
module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, hashToken }
