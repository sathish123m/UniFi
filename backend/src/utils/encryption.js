const crypto = require('crypto')

// Authenticated encryption. GCM gives us integrity (tamper detection via the
// auth tag) on top of confidentiality, which plain CBC does not.
const GCM = 'aes-256-gcm'
const LEGACY_CBC = 'aes-256-cbc'

// No insecure default key. A missing/short key is a hard failure — we never fall
// back to an all-zero key, which would make every ciphertext trivially readable.
const getKey = () => {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes).')
  }
  return Buffer.from(raw, 'hex')
}

const encrypt = (text) => {
  const iv = crypto.randomBytes(12) // 96-bit nonce recommended for GCM
  const cipher = crypto.createCipheriv(GCM, getKey(), iv)
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

const decrypt = (payload) => {
  const parts = String(payload).split(':')

  if (parts.length === 3) {
    const [ivH, tagH, dataH] = parts
    const decipher = crypto.createDecipheriv(GCM, getKey(), Buffer.from(ivH, 'hex'))
    decipher.setAuthTag(Buffer.from(tagH, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(dataH, 'hex')), decipher.final()]).toString('utf8')
  }

  // Backward compatibility: legacy AES-256-CBC values were stored as iv:data.
  if (parts.length === 2) {
    const [ivH, dataH] = parts
    const decipher = crypto.createDecipheriv(LEGACY_CBC, getKey(), Buffer.from(ivH, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(dataH, 'hex')), decipher.final()]).toString('utf8')
  }

  throw new Error('Malformed encrypted payload')
}

module.exports = { encrypt, decrypt }
