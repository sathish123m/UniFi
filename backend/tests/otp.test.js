const test = require('node:test')
const assert = require('node:assert/strict')

const { generateOtp, hashOtp, verifyOtp, otpExpiresAt } = require('../src/utils/otp')

test('generateOtp returns a 6-digit numeric string (100000-999999)', () => {
  for (let i = 0; i < 50; i += 1) {
    const otp = generateOtp()
    assert.match(otp, /^[0-9]{6}$/)
    const n = Number(otp)
    assert.ok(n >= 100000 && n <= 999999)
  }
})

test('hashOtp + verifyOtp accept the right code and reject the wrong one', async () => {
  const otp = generateOtp()
  const hash = await hashOtp(otp)
  assert.notEqual(hash, otp)
  assert.equal(await verifyOtp(otp, hash), true)
  assert.equal(await verifyOtp(`${otp}0`, hash), false)
})

test('otpExpiresAt returns a future date roughly N minutes ahead', () => {
  const before = Date.now()
  const exp = otpExpiresAt(10).getTime()
  const delta = exp - before
  assert.ok(delta > 9 * 60 * 1000 && delta <= 10 * 60 * 1000 + 2000)
})
