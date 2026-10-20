const { Worker } = require('bullmq')
const logger = require('../config/logger')
const { QUEUE_NAME } = require('../queues/maintenance.queue')
const { getQueueConnection } = require('../queues/connection')
const { sweepDelinquency } = require('../services/loan.service')
const { cleanupExpired } = require('../jobs/maintenance')

let worker = null

const runJob = async (job) => {
  switch (job.name) {
    case 'sweep':
      return sweepDelinquency()
    case 'cleanup':
      return cleanupExpired()
    default:
      throw new Error(`Unknown job: ${job.name}`)
  }
}

const createMaintenanceWorker = () => {
  if (worker) return worker

  worker = new Worker(QUEUE_NAME, runJob, {
    connection: getQueueConnection(),
    // One job at a time: the sweep mutates loan state and must not overlap.
    concurrency: 1,
    // How long an idle worker blocks on Redis before polling again. The default
    // (5s) can burn a free Upstash daily command quota; hourly jobs do not care
    // about 30s of extra latency.
    drainDelay: Number(process.env.QUEUE_DRAIN_DELAY_MS || 30000),
  })

  worker.on('completed', (job, result) => {
    logger.info(`[queue] ${job.name} completed: ${JSON.stringify(result)}`)
  })
  worker.on('failed', (job, err) => {
    logger.error(`[queue] ${job ? job.name : 'job'} failed (attempt ${job ? job.attemptsMade : '?'}): ${err.message}`)
  })
  worker.on('error', (err) => {
    logger.warn(`[queue] worker error: ${err.message}`)
  })

  return worker
}

const closeWorker = async () => {
  if (!worker) return
  const w = worker
  worker = null
  try {
    await w.close()
  } catch {
    /* already closed */
  }
}

module.exports = { createMaintenanceWorker, closeWorker, runJob }
