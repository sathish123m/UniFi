require("dotenv").config();
const logger = require("./config/logger");
const { validateEnv } = require("./config/env");
const { checkAndConnectAll } = require("./utils/connectionChecks");
const app = require("./app");
const { sweepDelinquency } = require("./services/loan.service");
const { runMaintenance } = require("./jobs/maintenance");

const PORT = process.env.PORT || 5000;

const queueEnabled = () =>
  String(process.env.QUEUE_ENABLED || "false").toLowerCase() === "true";

/**
 * Single-instance fallback (also the default).
 *
 * Runs the sweep/cleanup on timers inside the API process: zero extra infra,
 * but it does not dedupe across instances and stops when the instance sleeps.
 * Enable BullMQ with QUEUE_ENABLED=true to get dedupe + retries + backoff.
 */
const startIntervalJobs = () => {
  const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS || 60 * 60 * 1000); // 1 hour
  const MAINTENANCE_INTERVAL_MS = Number(process.env.MAINTENANCE_INTERVAL_MS || 6 * 60 * 60 * 1000); // 6 hours

  // In-process re-entrancy guard: a slow sweep must not overlap the next tick
  // (overlapping sweeps previously double-applied delinquency penalties).
  let sweepRunning = false;
  let maintenanceRunning = false;

  const runSweep = async (label) => {
    if (sweepRunning) {
      logger.warn(`[Background Job] Sweep already running; skipping ${label}`);
      return;
    }
    sweepRunning = true;
    try {
      const stats = await sweepDelinquency();
      logger.info(`[Background Job] ${label} delinquency sweep: ${JSON.stringify(stats)}`);
    } catch (e) {
      logger.error(`[Background Job] ${label} delinquency sweep failed: ${e.message}`);
    } finally {
      sweepRunning = false;
    }
  };

  const runCleanup = async (label) => {
    if (maintenanceRunning) return;
    maintenanceRunning = true;
    try {
      await runMaintenance();
      if (label) logger.info(`[Background Job] ${label} maintenance complete`);
    } finally {
      maintenanceRunning = false;
    }
  };

  const timers = [
    setTimeout(() => runSweep("Initial"), 10000),
    setTimeout(() => runCleanup("Initial"), 30000),
    setInterval(() => runSweep("Scheduled"), SWEEP_INTERVAL_MS),
    setInterval(() => runCleanup("Scheduled"), MAINTENANCE_INTERVAL_MS),
  ];

  return { mode: "interval", stop: () => timers.forEach((t) => clearTimeout(t)) };
};

const startQueueJobs = async () => {
  const { ensureSchedules } = require("./queues/maintenance.queue");
  const { createMaintenanceWorker } = require("./workers/maintenance.worker");
  await ensureSchedules();
  createMaintenanceWorker();
  logger.info("[queue] BullMQ worker started (sweep + cleanup)");
  return { mode: "queue", stop: () => {} };
};

let backgroundJobs = null;

const startBackgroundJobs = async () => {
  if (!queueEnabled()) {
    backgroundJobs = startIntervalJobs();
    logger.info("[jobs] in-process scheduler active (set QUEUE_ENABLED=true to use BullMQ)");
    return;
  }
  try {
    backgroundJobs = await startQueueJobs();
  } catch (e) {
    logger.warn(`[queue] unavailable (${e.message}); falling back to in-process scheduler`);
    backgroundJobs = startIntervalJobs();
  }
};

const shutdown = async (signal) => {
  logger.info(`[shutdown] ${signal} received; closing cleanly`);
  try {
    if (backgroundJobs && backgroundJobs.stop) backgroundJobs.stop();

    const { closeWorker } = require("./workers/maintenance.worker");
    const { closeQueue } = require("./queues/maintenance.queue");
    const { closeQueueConnection } = require("./queues/connection");
    await closeWorker();
    await closeQueue();
    await closeQueueConnection();

    const redis = require("./config/redis");
    await redis.quit().catch(() => {});

    const prisma = require("./config/db");
    await prisma.$disconnect().catch(() => {});
  } catch (e) {
    logger.warn(`[shutdown] cleanup error: ${e.message}`);
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

const start = async () => {
  try {
    validateEnv();
    await checkAndConnectAll();
    app.listen(PORT, () => {
      logger.info(`UniFi API -> http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info("Mode: record-only (non-custodial)");
      startBackgroundJobs().catch((e) =>
        logger.error(`[jobs] failed to start: ${e.message}`),
      );
    });
  } catch (e) {
    logger.error(`Startup failed: ${e.message}`);
    process.exit(1);
  }
};

start();

module.exports = app;
