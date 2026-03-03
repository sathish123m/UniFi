const Redis = require('ioredis')
const logger = require('./logger')
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
})
redis.on('connect', () => logger.info('✅ Redis connected'))
redis.on('error', (e) => logger.warn(`Redis: ${e.message}`))
module.exports = redis
