const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isValidAadhaar,
  normalizeAadhaar,
  isValidPan,
  normalizePan,
  sniffImageType,
  validateDocumentImage,
  MAX_IMAGE_BYTES,
} = require('../src/utils/kycValidation')

test('Aadhaar: accepts a Verhoeff-valid number, with spaces/hyphens', () => {
  assert.equal(isValidAadhaar('234123412346'), true)
  assert.equal(isValidAadhaar('2341 2341 2346'), true)
  assert.equal(isValidAadhaar('2341-2341-2346'), true)
})

test('Aadhaar: rejects bad checksum, leading 0/1 and wrong length', () => {
  assert.equal(isValidAadhaar('234123412347'), false) // checksum off by one
  assert.equal(isValidAadhaar('134123412346'), false) // must start 2-9
  assert.equal(isValidAadhaar('23412341234'), false) // 11 digits
  assert.equal(isValidAadhaar(''), false)
})

test('Aadhaar: normalize strips separators only', () => {
  assert.equal(normalizeAadhaar(' 2341-2341 2346 '), '234123412346')
})

test('PAN: accepts entity-typed PAN, normalizes case', () => {
  assert.equal(isValidPan('ABCPZ1234K'), true)
  assert.equal(isValidPan('abcpz1234k'), true)
  assert.equal(normalizePan(' abcde1234f '), 'ABCDE1234F')
})

test('PAN: rejects bad holder-type digit and malformed lengths', () => {
  assert.equal(isValidPan('ABCXZ1234K'), false) // 4th char must be a valid type
  assert.equal(isValidPan('ABCD1234K'), false) // only 4 leading letters
  assert.equal(isValidPan('ABCDE1234'), false)
})

test('image sniffing detects jpeg/png/webp magic bytes', () => {
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg')
  assert.equal(
    sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
    'image/png'
  )
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])
  assert.equal(sniffImageType(webp), 'image/webp')
  assert.equal(sniffImageType(Buffer.from('not-an-image-at-all')), null)
})

test('validateDocumentImage enforces presence, size and real image bytes', () => {
  assert.equal(validateDocumentImage(null).ok, false)
  const jpeg = { buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(20)]) }
  assert.equal(validateDocumentImage(jpeg).ok, true)
  assert.equal(validateDocumentImage({ buffer: Buffer.from('plain text document') }).ok, false)
  const tooBig = { buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_IMAGE_BYTES)]) }
  assert.equal(validateDocumentImage(tooBig).ok, false)
})
