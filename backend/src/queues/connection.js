const Redis = require('ioredis')
const logger = require('../config/logger')
const { normalizeRedisUrl } = require('../config/redisUrl')

/**
 * BullMQ must NOT share the app's ioredis client.
 *
 * BullMQ uses blocking commands (BRPOPLPUSH/BZPOPMIN) and requires
 * `maxRetriesPerRequest: null`; the shared client deliberately sets a retry
 * limit and is used for cheap rate-limit/cache calls. Mixing the two causes
 * "maxRetriesPerRequest must be null" errors and one workload starving the
 * other.
 */
let connection = null

const getQueueConnection = () => {
  if (connection) return connection
  connection = new Redis(normalizeRedisUrl(process.env.REDIS_URL), {
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
  })
  connection.on('error', (e) => logger.warn(`[queue] redis: ${e.message}`))
  return connection
}

const closeQueueConnection = async () => {
  if (!connection) return
  const conn = connection
  connection = null
  try {
    await conn.quit()
  } catch {
    try {
      conn.disconnect()
    } catch {
      /* already gone */
    }
  }
}

module.exports = { getQueueConnection, closeQueueConnection }
