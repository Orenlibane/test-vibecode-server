const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const pino = require("pino");
const pinoHttp = require("pino-http");
const { env, port, corsOrigins, trustProxy, baseUrl } = require("./config");

const app = express();

// ---------- Logging ----------
const logger = pino({
  level: env === "production" ? "info" : "debug",
  redact: ["req.headers.authorization", "req.headers.cookie"]
});

app.use(pinoHttp({
  logger,
  genReqId: (req) => req.headers["x-request-id"] || undefined,
  customLogLevel: function (_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`
}));

// ---------- Security & perf ----------
app.disable("x-powered-by");
app.use(helmet());
app.use(compression());

// ---------- Body parsing (tight limits) ----------
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// ---------- CORS ----------
const corsOptions = corsOrigins.length
  ? {
      origin: (origin, cb) => {
        // Allow curl/health/no-origin and whitelisted origins
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("Not allowed by CORS"));
      },
      credentials: true
    }
  : {}; // if not set, default to permissive for same-origin/no-origin
app.use(cors(corsOptions));

// ---------- Reverse proxy trust ----------
if (trustProxy) app.set("trust proxy", 1);

// ---------- Rate limiting (per IP) ----------
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api", apiLimiter);

// ---------- Health endpoints ----------
app.get("/livez", (_req, res) => res.status(200).send("OK"));
app.get("/readyz", (_req, res) => {
  // Add checks to dependencies here (DB/cache/etc.)
  res.status(200).send("READY");
});

// ---------- API routes ----------
app.get("/api/hello", (_req, res) => {
  res.json({
    ok: true,
    message: "Hello from Express (prod-ready)!",
    time: new Date().toISOString()
  });
});

// Optional root
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "prod-express-server",
    endpoints: ["/api/hello", "/livez", "/readyz"],
    env,
    baseUrl: baseUrl || "set BASE_URL in env to print public URL"
  });
});

// ---------- 404 ----------
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

// ---------- Error handler ----------
/* eslint-disable no-unused-vars */
app.use((err, req, res, _next) => {
  req.log?.error({ err }, "Unhandled error");
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: env === "production" ? "Internal Server Error" : err.message
  });
});
/* eslint-enable no-unused-vars */

// ---------- Start & graceful shutdown ----------
const server = app.listen(port, () => {
  logger.info(`Listening on port ${port}. Public URL: ${baseUrl || "N/A"}`);
});

function shutdown(signal) {
  logger.warn({ signal }, "Graceful shutdown start");
  server.close(err => {
    if (err) {
      logger.error({ err }, "Error closing server");
      process.exit(1);
    }
    logger.warn("HTTP server closed. Bye 👋");
    process.exit(0);
  });

  // Force-exit if not closed in 10s
  setTimeout(() => {
    logger.error("Forcing shutdown");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
