const test = require('node:test')
const assert = require('node:assert/strict')

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret'
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret'

const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
} = require('../src/utils/jwt')

test('refresh tokens are unique per issuance, even within the same second', () => {
  // Regression: identical payloads + identical `iat` produced byte-identical
  // JWTs, which collided with the UNIQUE constraint on refresh_tokens.tokenHash
  // whenever a user refreshed within a second of logging in.
  const payload = { userId: 'user_1', role: 'BORROWER' }
  const tokens = new Set()
  for (let i = 0; i < 25; i += 1) tokens.add(signRefreshToken(payload))

  assert.equal(tokens.size, 25)
  assert.equal(new Set([...tokens].map(hashToken)).size, 25)
})

test('refresh token carries a jti and still verifies', () => {
  const token = signRefreshToken({ userId: 'user_1', role: 'BORROWER' })
  const decoded = verifyRefreshToken(token)

  assert.equal(decoded.userId, 'user_1')
  assert.match(decoded.jti, /^[0-9a-f-]{36}$/)
})

test('access tokens verify and reject the wrong secret', () => {
  const token = signAccessToken({ userId: 'user_1', role: 'BORROWER' })

  assert.equal(verifyAccessToken(token).userId, 'user_1')
  assert.throws(() => verifyRefreshToken(token))
})
