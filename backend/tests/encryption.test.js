const test = require('node:test')
const assert = require('node:assert/strict')

// encryption.js reads ENCRYPTION_KEY lazily inside getKey(), so setting it here
// is enough regardless of require order.
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

const { encrypt, decrypt } = require('../src/utils/encryption')

test('encrypt/decrypt round-trips a value', () => {
  const plain = 'ABCDE1234F'
  const cipher = encrypt(plain)
  assert.notEqual(cipher, plain)
  assert.equal(decrypt(cipher), plain)
})

test('encrypt is non-deterministic (random IV) yet decrypts to the same value', () => {
  const a = encrypt('999999999999')
  const b = encrypt('999999999999')
  assert.notEqual(a, b)
  assert.equal(decrypt(a), '999999999999')
  assert.equal(decrypt(b), '999999999999')
})

test('tampered ciphertext fails authentication (GCM auth tag)', () => {
  const cipher = encrypt('sensitive')
  const parts = cipher.split(':')
  // Flip a byte in the ciphertext body.
  const body = Buffer.from(parts[2], 'hex')
  body[0] = body[0] ^ 0xff
  parts[2] = body.toString('hex')
  assert.throws(() => decrypt(parts.join(':')))
})

test('malformed payload throws instead of returning garbage', () => {
  assert.throws(() => decrypt('not-a-valid-payload'))
})

test('missing/invalid ENCRYPTION_KEY is a hard failure, never a zero-key fallback', () => {
  const saved = process.env.ENCRYPTION_KEY
  process.env.ENCRYPTION_KEY = 'short'
  assert.throws(() => encrypt('x'))
  process.env.ENCRYPTION_KEY = saved
})
