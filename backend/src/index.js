require("dotenv").config();
require("express-async-errors");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const hpp = require("hpp");
const { errorHandler } = require("./middleware/errorHandler");
const { globalRateLimiter } = require("./middleware/rateLimiter");
const { validateEnv, corsOrigins, paymentProvider } = require("./config/env");
const logger = require("./config/logger");

const { checkAndConnectAll } = require("./utils/connectionChecks");

try {
  validateEnv();
} catch (e) {
  if (
    /razorpay/i.test(String(e.message || "")) &&
    /placeholder|PASTE_/i.test(String(e.message || ""))
  ) {
    logger.warn(`ENV warning: ${e.message}`);
  } else {
    throw e;
  }
}

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
      if (!origin) return callback(null, true);
      return corsOrigins().includes(origin)
        ? callback(null, true)
        : callback(new Error("CORS blocked"));
    },
    credentials: true,
  }),
);
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));
app.use("/api", (req, res, next) => {
  if (req.path === "/payments/webhook") return next();
  return globalRateLimiter(req, res, next);
});

app.get("/health", (_, res) =>
  res.json({
    status: "ok",
    time: new Date(),
    paymentProvider: paymentProvider(),
  }),
);

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/loans", require("./routes/loan.routes"));
app.use("/api/payments", require("./routes/payment.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
app.use((_, res) =>
  res.status(404).json({ success: false, message: "Route not found" }),
);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await checkAndConnectAll();
    app.listen(PORT, () => {
      logger.info(`UniFi API -> http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info(`Payment provider: ${paymentProvider()}`);
    });
  } catch (e) {
    logger.error(`Startup failed: ${e.message}`);
    process.exit(1);
  }
};

start();

module.exports = app;
