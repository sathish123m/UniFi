const prisma = require('../config/db')
const logger = require('../config/logger')

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Periodic housekeeping. Without this, transient rows (spent/expired OTPs,
 * expired refresh tokens, stale device sessions and old read notifications)
 * accumulate forever — painful on a small/free Postgres tier.
 *
 * Safe to run concurrently: each delete is scoped by a time predicate.
 */
const cleanupExpired = async (now = new Date()) => {
  const staleSessionCutoff = new Date(now.getTime() - 90 * DAY_MS)
  const readNotificationCutoff = new Date(now.getTime() - 60 * DAY_MS)

  const [otpCodes, refreshTokens, deviceSessions, notifications] = await Promise.all([
    prisma.otpCode.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { used: true }] },
    }),
    prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    prisma.deviceSession.deleteMany({
      where: { lastSeenAt: { lt: staleSessionCutoff } },
    }),
    prisma.notification.deleteMany({
      where: { isRead: true, createdAt: { lt: readNotificationCutoff } },
    }),
  ])

  return {
    otpCodes: otpCodes.count,
    refreshTokens: refreshTokens.count,
    deviceSessions: deviceSessions.count,
    notifications: notifications.count,
  }
}

/**
 * Run the maintenance job now, logging and swallowing failures so a cleanup
 * error never takes down the process.
 */
const runMaintenance = async () => {
  try {
    const stats = await cleanupExpired()
    logger.info(`[Background Job] Maintenance cleanup: ${JSON.stringify(stats)}`)
    return stats
  } catch (e) {
    logger.error(`[Background Job] Maintenance cleanup failed: ${e.message}`)
    return null
  }
}

module.exports = { cleanupExpired, runMaintenance }
