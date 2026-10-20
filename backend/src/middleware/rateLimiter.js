const rateLimit = require('express-rate-limit')
const { MemoryStore } = require('express-rate-limit')
const redis = require('../config/redis')
const logger = require('../config/logger')

const asPositiveInt = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

// ── Redis store ──────────────────────────────────────────────────────────────
// A fixed-window counter backed by Redis so limits are shared across every
// instance and survive restarts. Falls back to in-process memory whenever Redis
// is unavailable, so a Redis outage degrades the limit rather than breaking the
// API entirely.
class RedisRateLimitStore {
  constructor(prefix = 'rl:') {
    this.prefix = prefix
    this.windowMs = 60 * 1000
    this.localKeys = false
  }

  init(options) {
    this.windowMs = options.windowMs
  }

  async increment(key) {
    const redisKey = `${this.prefix}${key}`
    const results = await redis.multi().incr(redisKey).pttl(redisKey).exec()
    const totalHits = Number(results?.[0]?.[1] || 1)
    let ttl = Number(results?.[1]?.[1])
    if (!Number.isFinite(ttl) || ttl < 0) {
      await redis.pexpire(redisKey, this.windowMs)
      ttl = this.windowMs
    }
    return { totalHits, resetTime: new Date(Date.now() + ttl) }
  }

  async decrement(key) {
    await redis.decr(`${this.prefix}${key}`)
  }

  async resetKey(key) {
    await redis.del(`${this.prefix}${key}`)
  }

  async resetAll() {
    const keys = await redis.keys(`${this.prefix}*`)
    if (keys.length) await redis.del(keys)
  }
}

class HybridRateLimitStore {
  constructor(prefix) {
    this.memory = new MemoryStore()
    this.redisStore = new RedisRateLimitStore(prefix)
    this.useRedis = Boolean(String(process.env.REDIS_URL || '').trim())
    this.localKeys = false
  }

  init(options) {
    this.memory.init(options)
    this.redisStore.init(options)
  }

  async increment(key) {
    if (this.useRedis) {
      try {
        return await this.redisStore.increment(key)
      } catch (e) {
        this.useRedis = false
        logger.warn(`Rate-limit Redis store unavailable, using in-memory fallback: ${e.message}`)
      }
    }
    return this.memory.increment(key)
  }

  async decrement(key) {
    if (this.useRedis) {
      try {
        return await this.redisStore.decrement(key)
      } catch {
        /* fall through to memory below */
      }
    }
    return this.memory.decrement(key)
  }

  async resetKey(key) {
    if (this.useRedis) {
      try {
        await this.redisStore.resetKey(key)
      } catch {
        /* ignore */
      }
    }
    return this.memory.resetKey(key)
  }

  async resetAll() {
    if (this.useRedis) {
      try {
        await this.redisStore.resetAll()
      } catch {
        /* ignore */
      }
    }
    return this.memory.resetAll()
  }
}

// Each limiter gets its own Redis prefix. Sharing one prefix made the global
// (1/min) and auth (15 min) windows collide on the same key: whichever ran
// second reset the other's TTL, so the login limit was effectively "100 per
// minute" instead of "20 per 15 minutes".
const store = (name) => new HybridRateLimitStore(`unifi:rl:${name}:`)

// Authenticated callers are keyed by user id so a shared campus NAT gateway does
// not cause one student's requests to throttle their peers. Pre-auth routes
// (login/register/OTP) fall back to the client IP.
const userOrIpKey = (req) => req.user?.id || req.ip

const make = (windowMs, max, msg, { keyGenerator, name } = {}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: store(name),
    keyGenerator,
    message: { success: false, message: msg },
  })

const globalRateLimiter = make(
  asPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
  asPositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  'Too many requests',
  { keyGenerator: userOrIpKey, name: 'global' }
)

// Login/register/OTP are unauthenticated, so they must be keyed by IP. The
// window is long to blunt credential stuffing; the ceiling is configurable
// because campus NAT can legitimately share one IP.
const authRateLimiter = make(
  15 * 60 * 1000,
  asPositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 20),
  'Too many auth attempts, try again in 15 minutes',
  { name: 'auth' }
)

const otpRateLimiter = make(
  60 * 1000,
  asPositiveInt(process.env.OTP_RATE_LIMIT_MAX, 3),
  'Too many OTP requests',
  { name: 'otp' }
)

module.exports = { globalRateLimiter, authRateLimiter, otpRateLimiter, HybridRateLimitStore }
