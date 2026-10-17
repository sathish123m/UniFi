const fs = require('fs')
const path = require('path')
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const logger = require('../config/logger')
const { createId } = require('@paralleldrive/cuid2')

const isR2Configured = () => {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  )
}

let s3Client = null
if (isR2Configured()) {
  const accountId = process.env.R2_ACCOUNT_ID
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  logger.info('✅ Cloudflare R2 storage initialized')
} else {
  logger.info('ℹ️ Cloudflare R2 credentials missing — falling back to local filesystem storage')
}

/**
 * Upload file buffer or file path to R2 or Local Storage
 */
const uploadFile = async ({ filePath, buffer, originalname, mimetype, folder = 'kyc' }) => {
  const fileExt = path.extname(originalname || 'file.png') || '.png'
  const fileKey = `${folder}/${createId()}${fileExt}`

  const fileData = buffer || (filePath ? fs.readFileSync(filePath) : null)
  if (!fileData) throw new Error('No file content provided for upload')

  if (isR2Configured() && s3Client) {
    const bucketName = process.env.R2_BUCKET_NAME
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: fileData,
      ContentType: mimetype || 'application/octet-stream',
    })
    await s3Client.send(command)

    // Clean up temporary local file if created by multer
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath) } catch {}
    }

    return {
      storage: 'R2',
      key: fileKey,
      url: process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL}/${fileKey}` : fileKey,
    }
  }

  // Local storage is development-only. Render/Neon deployments lose local files
  // on restart/redeploy, so fail loudly in production when R2 is missing.
  if ((process.env.NODE_ENV || 'development') === 'production') {
    throw new Error(
      'Cloudflare R2 (or another persistent object store) must be configured in production; refusing local filesystem KYC storage.'
    )
  }

  // Local Storage Fallback
  const targetDir = path.join(process.cwd(), 'uploads', folder)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const targetPath = path.join(targetDir, path.basename(fileKey))
  if (filePath && fs.existsSync(filePath)) {
    fs.renameSync(filePath, targetPath)
  } else {
    fs.writeFileSync(targetPath, fileData)
  }

  return {
    storage: 'LOCAL',
    key: `uploads/${folder}/${path.basename(fileKey)}`,
    url: `/uploads/${folder}/${path.basename(fileKey)}`,
  }
}

const CONTENT_TYPE_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

const contentTypeForKey = (key) =>
  CONTENT_TYPE_BY_EXT[path.extname(key || '').toLowerCase()] || 'application/octet-stream'

/**
 * Fetch a previously uploaded object by its storage key. Returns the raw bytes
 * plus a best-effort content type so callers (e.g. the admin KYC document
 * viewer) can stream it back. Works against both R2 and the local fallback.
 */
const getFile = async (key) => {
  if (!key) throw new Error('Storage key is required')

  if (isR2Configured() && s3Client) {
    // Keys are stored as `${folder}/${id}${ext}` for R2 objects.
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    })
    const response = await s3Client.send(command)
    const chunks = []
    for await (const chunk of response.Body) chunks.push(chunk)
    return {
      buffer: Buffer.concat(chunks),
      contentType: response.ContentType || contentTypeForKey(key),
    }
  }

  // Local fallback: keys are stored as `uploads/${folder}/${file}`. Resolve
  // relative to cwd and guard against path traversal escaping the uploads dir.
  const uploadsRoot = path.join(process.cwd(), 'uploads')
  const resolved = path.resolve(process.cwd(), key)
  if (!resolved.startsWith(uploadsRoot + path.sep)) {
    throw new Error('Invalid storage key')
  }
  if (!fs.existsSync(resolved)) throw new Error('File not found')
  return {
    buffer: fs.readFileSync(resolved),
    contentType: contentTypeForKey(resolved),
  }
}

/**
 * Best-effort delete of a previously uploaded object. Used when a KYC document
 * is replaced on resubmission so orphaned identity scans don't accumulate (and
 * aren't left behind in storage). Never throws: a failed cleanup must not break
 * the user's submission.
 */
const deleteFile = async (key) => {
  if (!key) return { deleted: false, reason: 'no_key' }
  try {
    if (isR2Configured() && s3Client) {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key })
      )
      return { deleted: true }
    }

    // Local fallback: only ever touch files inside the uploads directory.
    const uploadsRoot = path.join(process.cwd(), 'uploads')
    const resolved = path.resolve(process.cwd(), key)
    if (!resolved.startsWith(uploadsRoot + path.sep)) {
      return { deleted: false, reason: 'outside_uploads' }
    }
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved)
      return { deleted: true }
    }
    return { deleted: false, reason: 'not_found' }
  } catch (e) {
    logger.warn(`Storage delete failed for ${key}: ${e.message}`)
    return { deleted: false, reason: 'error' }
  }
}

module.exports = {
  isR2Configured,
  uploadFile,
  getFile,
  deleteFile,
}
