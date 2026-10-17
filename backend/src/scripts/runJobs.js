#!/usr/bin/env node
/**
 * Off-instance job runner.
 *
 * The API process schedules the delinquency sweep and the maintenance cleanup
 * in-process (see `src/index.js`). On a single free Render instance that is
 * fine, but it silently stops running whenever the dyno sleeps and cannot be
 * scaled horizontally without duplicate work.
 *
 * This script runs both jobs exactly once and exits, so it can be wired to any
 * external scheduler (Render cron job, GitHub Action, cron, Kubernetes CronJob)
 * without keeping a web process awake. It is safe to run alongside the API:
 * every operation is idempotent and scoped by a time predicate.
 *
 * Usage: npm run jobs:run
 */

require('dotenv').config()

const prisma = require('../config/db')
const logger = require('../config/logger')
const { sweepDelinquency } = require('../services/loan.service')
const { cleanupExpired } = require('../jobs/maintenance')

const run = async () => {
  const results = { sweep: null, maintenance: null, errors: [] }

  try {
    results.sweep = await sweepDelinquency()
    logger.info(`[jobs:run] delinquency sweep: ${JSON.stringify(results.sweep)}`)
  } catch (e) {
    logger.error(`[jobs:run] delinquency sweep failed: ${e.message}`)
    results.errors.push(`sweep: ${e.message}`)
  }

  try {
    results.maintenance = await cleanupExpired()
    logger.info(`[jobs:run] maintenance cleanup: ${JSON.stringify(results.maintenance)}`)
  } catch (e) {
    logger.error(`[jobs:run] maintenance cleanup failed: ${e.message}`)
    results.errors.push(`maintenance: ${e.message}`)
  }

  return results
}

run()
  .then(async (results) => {
    await prisma.$disconnect()
    // Non-zero exit on failure so the external scheduler surfaces the error
    // instead of reporting a green run.
    process.exit(results.errors.length ? 1 : 0)
  })
  .catch(async (e) => {
    logger.error(`[jobs:run] fatal: ${e.message}`)
    await prisma.$disconnect().catch(() => {})
    process.exit(1)
  })
