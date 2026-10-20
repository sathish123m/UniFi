const Redis = require('ioredis')
const logger = require('./logger')
const { normalizeRedisUrl } = require('./redisUrl')

let errorLogCount = 0
const MAX_ERROR_LOGS = 3

const redis = new Redis(normalizeRedisUrl(process.env.REDIS_URL), {
  connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) return null
    return Math.min(times * 100, 1000)
  },
  lazyConnect: true,
})
redis.on('connect', () => {
  errorLogCount = 0
  logger.info('✅ Redis connected')
})
redis.on('error', (e) => {
  errorLogCount += 1
  if (errorLogCount <= MAX_ERROR_LOGS) {
    logger.warn(`Redis: ${e.message}`)
    if (errorLogCount === MAX_ERROR_LOGS) {
      logger.warn('Redis retry limit reached; suppressing further connection warnings')
    }
  }
})
module.exports = redis
