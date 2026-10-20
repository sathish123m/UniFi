require("dotenv").config();
require("express-async-errors");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const hpp = require("hpp");
const { errorHandler } = require("./middleware/errorHandler");
const { globalRateLimiter } = require("./middleware/rateLimiter");
const { corsOrigins } = require("./config/env");

/**
 * The Express app, with no side effects: importing this file does not connect
 * to Postgres/Redis and does not listen on a port. `src/index.js` is the
 * process entrypoint; tests import this module directly with Supertest.
 */
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

module.exports = app;
