const fs = require('fs')
const path = require('path')
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
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

module.exports = {
  isR2Configured,
  uploadFile,
}
