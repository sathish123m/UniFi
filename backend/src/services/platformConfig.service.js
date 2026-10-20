const prisma = require('../config/db')
const cache = require('../utils/cache')

/**
 * The latest PlatformConfig row (config is append-only/versioned).
 *
 * This is read on nearly every loan and credit-score operation but changes
 * only when an admin submits the config form, so it is a perfect cache
 * candidate. Admin writes call `invalidatePlatformConfig()`.
 */
const FALLBACK = { minLoanAmount: 500, maxLoanAmount: 10000 }

const getPlatformConfig = async () => {
  const cfg = await cache.wrap(cache.KEYS.platformConfig, 60, () =>
    prisma.platformConfig.findFirst({ orderBy: { createdAt: 'desc' } }),
  )
  return cfg || FALLBACK
}

const invalidatePlatformConfig = () => cache.del(cache.KEYS.platformConfig)

module.exports = { getPlatformConfig, invalidatePlatformConfig, FALLBACK }
