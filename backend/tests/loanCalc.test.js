const test = require('node:test')
const assert = require('node:assert/strict')

const { calculateLoan, generatePublicId } = require('../src/utils/loanCalc')

test('calculateLoan is interest-free: repayable equals principal', () => {
  const r = calculateLoan(10000)
  assert.equal(r.interestAmount, 0)
  assert.equal(r.platformFeeAmount, 0)
  assert.equal(r.totalRepayAmount, 10000)
  assert.equal(r.providerEarning, 0)
})

test('calculateLoan never adds a fee regardless of principal', () => {
  for (const amount of [1, 500, 999, 5000, 10000]) {
    const r = calculateLoan(amount)
    assert.equal(r.totalRepayAmount, amount)
    assert.equal(r.interestAmount + r.platformFeeAmount + r.providerEarning, 0)
  }
})

test('calculateLoan ignores any legacy rate arguments', () => {
  const r = calculateLoan(2500, 30, 10, 5)
  assert.deepEqual(
    { i: r.interestAmount, f: r.platformFeeAmount, t: r.totalRepayAmount, p: r.providerEarning },
    { i: 0, f: 0, t: 2500, p: 0 }
  )
})

test('generatePublicId zero-pads to 5 digits and stays unique', () => {
  assert.equal(generatePublicId(1), 'UniFi#00001')
  assert.equal(generatePublicId(99999), 'UniFi#99999')
  assert.notEqual(generatePublicId(99999), generatePublicId(100000))
})
