/**
 * Server-side format validation for Indian KYC identity documents.
 *
 * This is the authoritative "format gate": submissions that fail here are
 * rejected with a 400 BEFORE a record is created, so an admin only ever
 * reviews well-formed documents. The frontend performs the same checks for
 * fast feedback, but client-side validation is never trusted on its own.
 *
 * Scope is FORMAT only — pattern + checksum for numbers, and real byte-level
 * type/size checks for images. It does NOT prove a document is authentic or
 * that the number belongs to the person; that remains the admin's manual call.
 */

// ── Aadhaar ──────────────────────────────────────────────────────────────────
// The Aadhaar number is a 12-digit code whose last digit is a Verhoeff
// checksum. A valid Aadhaar never starts with 0 or 1 (first digit is 2-9).

// Verhoeff multiplication (d) and permutation (p) tables.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

const passesVerhoeff = (digits) => {
  let c = 0
  const reversed = String(digits).split('').reverse()
  for (let i = 0; i < reversed.length; i++) {
    const n = Number(reversed[i])
    if (Number.isNaN(n)) return false
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][n]]
  }
  return c === 0
}

/** Strip spaces/hyphens so "1234 5678 9012" and "1234-5678-9012" both work. */
const normalizeAadhaar = (raw) => String(raw || '').replace(/[\s-]/g, '')

const isValidAadhaar = (raw) => {
  const num = normalizeAadhaar(raw)
  if (!/^[2-9][0-9]{11}$/.test(num)) return false
  return passesVerhoeff(num)
}

// ── PAN ──────────────────────────────────────────────────────────────────────
// Permanent Account Number: 5 letters + 4 digits + 1 letter, e.g. ABCDE1234F.
// The 4th character encodes holder type (P=Individual, C=Company, H=HUF,
// F=Firm, A/T/B/L/J/G=other entities). We accept the documented set.
const PAN_ENTITY_TYPES = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G'])

const normalizePan = (raw) => String(raw || '').trim().toUpperCase()

const isValidPan = (raw) => {
  const pan = normalizePan(raw)
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return false
  return PAN_ENTITY_TYPES.has(pan[3])
}

// ── Image files ────────────────────────────────────────────────────────────
// mimetype from the client is spoofable, so we sniff the leading "magic bytes"
// to confirm the upload is really a JPEG / PNG / WEBP image.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB, matches the multer limit

const sniffImageType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'image/png'
  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return 'image/webp'
  return null
}

/**
 * Validate an uploaded document image (multer memoryStorage file).
 * Returns { ok: true } or { ok: false, message }.
 */
const validateDocumentImage = (file, label = 'Document') => {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    return { ok: false, message: `${label} is required.` }
  }
  if (file.buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, message: `${label} is too large (max 5MB).` }
  }
  const detected = sniffImageType(file.buffer)
  if (!detected) {
    return { ok: false, message: `${label} must be a valid JPG, PNG or WEBP image.` }
  }
  return { ok: true, detectedType: detected }
}

module.exports = {
  isValidAadhaar,
  normalizeAadhaar,
  isValidPan,
  normalizePan,
  sniffImageType,
  validateDocumentImage,
  MAX_IMAGE_BYTES,
}
