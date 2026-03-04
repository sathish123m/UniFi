const Redis = require('ioredis')
const logger = require('./logger')

const normalizeRedisUrl = (raw) => {
  const value = String(raw || '').trim()
  if (!value) return 'redis://localhost:6379'

  // Upstash dashboard also shows a CLI command (`redis-cli --tls -u ...`).
  // If that full command is pasted into REDIS_URL, extract the actual URI.
  if (value.startsWith('redis-cli')) {
    const match = value.match(/rediss?:\/\/\S+/i)
    if (match?.[0]) {
      const hasTlsFlag = /\s--tls(\s|$)/i.test(value)
      const uri = hasTlsFlag && match[0].startsWith('redis://')
        ? `rediss://${match[0].slice('redis://'.length)}`
        : match[0]
      logger.warn('REDIS_URL looked like a redis-cli command; extracted Redis URI automatically')
      return uri
    }
  }

  return value
}

const redis = new Redis(normalizeRedisUrl(process.env.REDIS_URL), {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
})
redis.on('connect', () => logger.info('✅ Redis connected'))
redis.on('error', (e) => logger.warn(`Redis: ${e.message}`))
module.exports = redis
