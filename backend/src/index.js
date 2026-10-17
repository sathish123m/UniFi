require("dotenv").config();
require("express-async-errors");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const hpp = require("hpp");
const { errorHandler } = require("./middleware/errorHandler");
const { globalRateLimiter } = require("./middleware/rateLimiter");
const { validateEnv, corsOrigins } = require("./config/env");
const logger = require("./config/logger");

const { checkAndConnectAll } = require("./utils/connectionChecks");

validateEnv();

const app = express();

app.disable("x-powered-by");
if ((process.env.NODE_ENV || "development") === "production") {
  // Required behind managed proxies/load balancers (Render, Fly, etc.)
  app.set("trust proxy", 1);
}
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(hpp());
app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients (curl, server-to-server, health checks) send no Origin.
      if (!origin) return callback(null, true);
      const allowedList = corsOrigins();
      const isProd = (process.env.NODE_ENV || "development") === "production";
      // In production the only accepted origins are the explicit allowlist
      // (CORS_ORIGINS env + configured frontend URLs). We deliberately do NOT
      // trust every *.vercel.app host: with credentials enabled that would let
      // any attacker-controlled Vercel deployment call the API on a user's
      // behalf. Preview deployments should be added to CORS_ORIGINS explicitly.
      if (allowedList.includes(origin)) return callback(null, true);
      // Outside production, allow localhost dev servers and Vercel preview
      // builds for convenience only.
      if (!isProd) {
        const isVercelPreview = /\.vercel\.app$/i.test(new URL(origin).hostname);
        const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin);
        if (isVercelPreview || isLocalhost) return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));
app.use("/api", globalRateLimiter);

app.get("/health", (_, res) =>
  res.json({
    status: "ok",
    time: new Date(),
    mode: "record-only",
  }),
);

app.get("/", (_, res) =>
  res.json({
    success: true,
    message: "UniFi backend is running",
    health: "/health",
    apiBase: "/api",
  }),
);

app.get("/api", (_, res) =>
  res.json({
    success: true,
    message: "UniFi API is running",
    routes: [
      "/api/auth",
      "/api/users",
      "/api/loans",
      "/api/payments",
      "/api/admin",
    ],
  }),
);

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/loans", require("./routes/loan.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
app.use((_, res) =>
  res.status(404).json({ success: false, message: "Route not found" }),
);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const { sweepDelinquency } = require('./services/loan.service')
const { runMaintenance } = require('./jobs/maintenance')

const startBackgroundJobs = () => {
  const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS || 60 * 60 * 1000) // 1 hour
  const MAINTENANCE_INTERVAL_MS = Number(process.env.MAINTENANCE_INTERVAL_MS || 6 * 60 * 60 * 1000) // 6 hours

  // In-process re-entrancy guard: a slow sweep must not overlap the next tick
  // (overlapping sweeps previously double-applied delinquency penalties).
  let sweepRunning = false
  let maintenanceRunning = false

  const runSweep = async (label) => {
    if (sweepRunning) {
      logger.warn(`[Background Job] Sweep already running; skipping ${label}`)
      return
    }
    sweepRunning = true
    try {
      const stats = await sweepDelinquency()
      logger.info(`[Background Job] ${label} delinquency sweep: ${JSON.stringify(stats)}`)
    } catch (e) {
      logger.error(`[Background Job] ${label} delinquency sweep failed: ${e.message}`)
    } finally {
      sweepRunning = false
    }
  }

  const runCleanup = async (label) => {
    if (maintenanceRunning) return
    maintenanceRunning = true
    try {
      await runMaintenance()
      if (label) logger.info(`[Background Job] ${label} maintenance complete`)
    } finally {
      maintenanceRunning = false
    }
  }

  setTimeout(() => runSweep('Initial'), 10000)
  setTimeout(() => runCleanup('Initial'), 30000)

  setInterval(() => runSweep('Scheduled'), SWEEP_INTERVAL_MS)
  setInterval(() => runCleanup('Scheduled'), MAINTENANCE_INTERVAL_MS)
}

const start = async () => {
  try {
    await checkAndConnectAll();
    app.listen(PORT, () => {
      logger.info(`UniFi API -> http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info("Mode: record-only (non-custodial)");
      startBackgroundJobs();
    });
  } catch (e) {
    logger.error(`Startup failed: ${e.message}`);
    process.exit(1);
  }
};

start();

module.exports = app;
