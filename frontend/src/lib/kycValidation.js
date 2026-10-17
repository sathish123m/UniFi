// Client-side KYC format validation — mirrors backend/src/utils/kycValidation.js
// for instant feedback in the form. The server re-runs these checks (plus real
// image magic-byte sniffing) as the authoritative gate; this is UX only.

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

export const normalizeAadhaar = (raw) => String(raw || '').replace(/[\s-]/g, '')

export const isValidAadhaar = (raw) => {
  const num = normalizeAadhaar(raw)
  if (!/^[2-9][0-9]{11}$/.test(num)) return false
  return passesVerhoeff(num)
}

const PAN_ENTITY_TYPES = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G'])

export const normalizePan = (raw) => String(raw || '').trim().toUpperCase()

export const isValidPan = (raw) => {
  const pan = normalizePan(raw)
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return false
  return PAN_ENTITY_TYPES.has(pan[3])
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// Returns '' if the file looks OK, or a human-readable error string.
export const imageFileError = (file, label = 'File') => {
  if (!file) return `${label} is required.`
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return `${label} must be a JPG, PNG or WEBP image.`
  if (file.size > MAX_IMAGE_BYTES) return `${label} is too large (max 5MB).`
  return ''
}
