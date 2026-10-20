/**
 * Close the long-lived handles the app opens (Prisma pool + Redis sockets) so
 * Jest can exit on its own instead of relying on `--forceExit`.
 */
const { afterAll } = require('@jest/globals')

afterAll(async () => {
  // Loaded lazily so a suite that never touched the DB still exits cleanly.
  const prisma = require('../../src/config/db')
  const redis = require('../../src/config/redis')

  await prisma.$disconnect().catch(() => {})
  await redis.quit().catch(() => {})
})
