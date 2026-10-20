const { Queue } = require('bullmq')
const { getQueueConnection } = require('./connection')

const QUEUE_NAME = process.env.QUEUE_NAME || 'unifi-maintenance'

const JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 100 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
}

let queue = null

const getQueue = () => {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: getQueueConnection() })
  return queue
}

/**
 * Register the repeating jobs.
 *
 * `upsertJobScheduler` is idempotent and keyed by scheduler id, so every API
 * instance can call this on boot and BullMQ still keeps exactly one scheduled
 * job per key — the reason to use a queue at all instead of `setInterval`,
 * which would run the sweep once per instance.
 */
const ensureSchedules = async () => {
  const q = getQueue()
  const sweepEvery = Number(process.env.SWEEP_INTERVAL_MS || 60 * 60 * 1000)
  const cleanupEvery = Number(process.env.MAINTENANCE_INTERVAL_MS || 6 * 60 * 60 * 1000)

  await q.upsertJobScheduler(
    'delinquency-sweep',
    { every: sweepEvery },
    { name: 'sweep', opts: JOB_DEFAULTS },
  )
  await q.upsertJobScheduler(
    'maintenance-cleanup',
    { every: cleanupEvery },
    { name: 'cleanup', opts: JOB_DEFAULTS },
  )
}

/** Enqueue one run now (used by ops tooling / manual triggers). */
const enqueueNow = async (name) => {
  if (!['sweep', 'cleanup'].includes(name)) throw new Error(`Unknown job: ${name}`)
  return getQueue().add(name, { triggeredAt: new Date().toISOString() }, JOB_DEFAULTS)
}

const closeQueue = async () => {
  if (!queue) return
  const q = queue
  queue = null
  try {
    await q.close()
  } catch {
    /* already closed */
  }
}

module.exports = { QUEUE_NAME, JOB_DEFAULTS, getQueue, ensureSchedules, enqueueNow, closeQueue }
