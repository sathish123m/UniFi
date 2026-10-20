const logger = require('./logger')

/**
 * Normalise whatever was pasted into REDIS_URL.
 *
 * Real-world values we have seen:
 *   - a plain URI            redis://host:6379 / rediss://host:6379
 *   - an Upstash CLI string  redis-cli --tls -u redis://default:pw@host:6379
 *
 * Upstash requires TLS, so a bare redis:// pointing at upstash.io is upgraded.
 */
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

  // Upstash requires TLS in production environments.
  if (/^redis:\/\//i.test(value)) {
    try {
      const parsed = new URL(value)
      if ((parsed.hostname || '').toLowerCase().includes('upstash.io')) {
        const upgraded = `rediss://${value.slice('redis://'.length)}`
        logger.warn('REDIS_URL used redis:// with Upstash; upgraded to rediss:// automatically')
        return upgraded
      }
    } catch (e) {
      // ignore parse error and return original value
    }
  }

  return value
}

module.exports = { normalizeRedisUrl }
