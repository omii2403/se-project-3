const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");

const authRoutes = require("./auth/auth.routes");
const userRoutes = require("./users/users.routes");
const questionRoutes = require("./questions/questions.routes");
const testRoutes = require("./tests/tests.routes");
const submissionRoutes = require("./submissions/submissions.routes");
const analyticsRoutes = require("./analytics/analytics.routes");
const monitorRoutes = require("./monitor/monitor.routes");
const redisConnection = require("./shared/redis");
const requireAuth = require("./shared/middleware/requireAuth");
const { recordApiLatency } = require("./shared/runtimeMetrics");
const { getWorkerTelemetrySnapshot } = require("./shared/workerTelemetry");
const logger = require("./shared/logger");

const app = express();
app.use(express.json({ limit: "1mb" }));

function getRequestSessionId(req) {
  if (req.params && req.params.sessionId) {
    return String(req.params.sessionId);
  }

  if (req.body && req.body.sessionId) {
    return String(req.body.sessionId);
  }

  if (req.query && req.query.sessionId) {
    return String(req.query.sessionId);
  }

  return null;
}

function isPublicApiRoute(req) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || "");

  if (method === "POST" && path === "/auth/signup") {
    return true;
  }

  if (method === "POST" && path === "/auth/signin") {
    return true;
  }

  return false;
}

async function getRedisHealth() {
  const startedAt = Date.now();

  try {
    if (redisConnection.status === "wait") {
      await redisConnection.connect();
    }

    await redisConnection.ping();
    return {
      ready: true,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ready: false,
      latencyMs: Date.now() - startedAt,
      error: error.message
    };
  }
}

function getMongoHealth() {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };

  const stateCode = Number(mongoose.connection.readyState || 0);
  return {
    ready: stateCode === 1,
    state: states[stateCode] || "unknown"
  };
}

async function buildHealthSnapshot() {
  const [redis, worker] = await Promise.all([getRedisHealth(), getWorkerTelemetrySnapshot()]);
  const mongo = getMongoHealth();

  return {
    mongo,
    redis,
    worker: {
      ready: Boolean(worker.ready),
      heartbeat: worker.heartbeat || null,
      counters: worker.counters || { completed: 0, failed: 0 }
    },
    ready: Boolean(mongo.ready && redis.ready && worker.ready)
  };
}

app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  req.requestId = String(requestId);
  res.setHeader("x-request-id", req.requestId);

  const startedNs = process.hrtime.bigint();
  res.on("finish", () => {
    const elapsedNs = process.hrtime.bigint() - startedNs;
    const latencyMs = Number(elapsedNs) / 1e6;
    const sessionId = getRequestSessionId(req);

    recordApiLatency({
      latencyMs,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode
    });

    logger.info("http.request", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      latencyMs: Number(latencyMs.toFixed(2)),
      sessionId,
      userId: req.user?.userId || null
    });
  });

  next();
});

app.get("/health/live", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/health", async (req, res) => {
  const health = await buildHealthSnapshot();
  res.json(health);
});

app.get("/health/ready", async (req, res) => {
  const health = await buildHealthSnapshot();

  if (!health.ready) {
    return res.status(503).json(health);
  }

  return res.json(health);
});

app.get("/", (req, res) => {
  res.json({
    message: "Task4 backend API is running"
  });
});

app.use("/api", (req, res, next) => {
  if (isPublicApiRoute(req)) {
    return next();
  }

  return requireAuth(req, res, next);
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/monitor", monitorRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  logger.error("http.unhandled_error", {
    requestId: req.requestId || null,
    path: req.originalUrl,
    method: req.method,
    sessionId: getRequestSessionId(req),
    error: err.message
  });

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
