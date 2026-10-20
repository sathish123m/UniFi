const redis = require('../config/redis')
const logger = require('../config/logger')

/**
 * Small read-through cache on top of the shared ioredis client.
 *
 * Design rules:
 *  - Never let a cache problem break a request: every operation degrades to a
 *    miss (or a no-op write) instead of throwing.
 *  - Only cache values that are cheap to recompute and expensive to fetch.
 *  - Always invalidate explicitly on write (see the admin routes), so an admin
 *    change is visible immediately instead of after the TTL.
 */

const PREFIX = process.env.CACHE_PREFIX || 'unifi:cache:'
const DEFAULT_TTL_SECONDS = Math.max(Number(process.env.CACHE_TTL_SECONDS || 60), 1)

const key = (name) => `${PREFIX}${name}`

const isReady = () => redis.status === 'ready'

const get = async (name) => {
  if (!isReady()) return null
  try {
    const raw = await redis.get(key(name))
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    logger.warn(`[cache] get ${name} failed: ${e.message}`)
    return null
  }
}

const set = async (name, value, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  if (!isReady()) return
  try {
    await redis.set(key(name), JSON.stringify(value), 'EX', Math.max(Number(ttlSeconds) || 1, 1))
  } catch (e) {
    logger.warn(`[cache] set ${name} failed: ${e.message}`)
  }
}

const del = async (...names) => {
  if (!isReady() || !names.length) return
  try {
    await redis.del(...names.map(key))
  } catch (e) {
    logger.warn(`[cache] del failed: ${e.message}`)
  }
}

/**
 * Read-through helper:
 *   const cfg = await cache.wrap('platform-config', 60, () => prisma...)
 *
 * A cached `null`/`undefined` is stored as JSON `null` and treated as a miss,
 * so "not found" results are never cached. That is intentional: they are rare
 * and caching them tends to hide newly-created rows.
 */
const wrap = async (name, ttlSeconds, loader) => {
  const hit = await get(name)
  if (hit !== null && hit !== undefined) return hit
  const value = await loader()
  if (value !== null && value !== undefined) await set(name, value, ttlSeconds)
  return value
}

module.exports = {
  get,
  set,
  del,
  wrap,
  DEFAULT_TTL_SECONDS,
  // Cache keys, centralised so invalidation can never drift from reads.
  KEYS: {
    platformConfig: 'platform-config',
    publicUniversities: 'universities:public',
  },
}
