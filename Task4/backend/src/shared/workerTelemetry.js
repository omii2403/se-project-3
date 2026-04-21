const redisConnection = require("./redis");
const { workerReadyStaleMs } = require("./config");

const KEY_PREFIX = "task4:worker";
const KEYS = {
  heartbeat: `${KEY_PREFIX}:heartbeat`,
  counters: `${KEY_PREFIX}:counters`,
  lastFailure: `${KEY_PREFIX}:last-failure`,
  queueWaitSamples: `${KEY_PREFIX}:queue-wait-ms`,
  evalSamples: `${KEY_PREFIX}:eval-ms`
};

const SAMPLE_LIMIT = 300;

function toSafeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return n;
}

function round(value) {
  return Number(toSafeNumber(value).toFixed(2));
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function withRedis(operation, fallbackValue = null) {
  try {
    if (redisConnection.status === "wait") {
      await redisConnection.connect();
    }

    return await operation();
  } catch (error) {
    return fallbackValue;
  }
}

async function pushSample(key, value) {
  const cleanValue = Math.max(0, Math.round(toSafeNumber(value)));

  await withRedis(async () => {
    const pipeline = redisConnection.pipeline();
    pipeline.lpush(key, String(cleanValue));
    pipeline.ltrim(key, 0, SAMPLE_LIMIT - 1);
    await pipeline.exec();
    return true;
  });
}

async function recordWorkerHeartbeat(extra = {}) {
  const now = Date.now();

  await withRedis(async () => {
    await redisConnection.hset(KEYS.heartbeat, {
      lastSeenMs: String(now),
      lastSeenAt: new Date(now).toISOString(),
      pid: String(process.pid),
      status: String(extra.status || "running")
    });
    return true;
  });
}

async function recordQueueAndEvaluationMetrics(queueWaitMs, evaluationMs) {
  await Promise.all([
    pushSample(KEYS.queueWaitSamples, queueWaitMs),
    pushSample(KEYS.evalSamples, evaluationMs)
  ]);
}

async function recordWorkerCompleted(fields = {}) {
  await withRedis(async () => {
    const pipeline = redisConnection.pipeline();
    pipeline.hincrby(KEYS.counters, "completed", 1);
    pipeline.hset(KEYS.counters, {
      lastCompletedAt: new Date().toISOString(),
      lastJobId: String(fields.jobId || ""),
      lastSubmissionId: String(fields.submissionId || "")
    });
    await pipeline.exec();
    return true;
  });
}

async function recordWorkerFailure(fields = {}) {
  await withRedis(async () => {
    const pipeline = redisConnection.pipeline();
    pipeline.hincrby(KEYS.counters, "failed", 1);
    pipeline.hset(KEYS.lastFailure, {
      at: new Date().toISOString(),
      jobId: String(fields.jobId || ""),
      submissionId: String(fields.submissionId || ""),
      reason: String(fields.reason || "Unknown failure")
    });
    await pipeline.exec();
    return true;
  });
}

function buildStats(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      count: 0,
      avgMs: 0,
      p95Ms: 0,
      maxMs: 0
    };
  }

  const values = samples.map((item) => toSafeNumber(item)).filter((item) => item >= 0);
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    count: values.length,
    avgMs: round(total / values.length),
    p95Ms: round(percentile(values, 95)),
    maxMs: round(Math.max(...values))
  };
}

async function getWorkerTelemetrySnapshot() {
  const data = await withRedis(async () => {
    const [heartbeat, counters, lastFailure, queueWaitSamples, evalSamples] = await Promise.all([
      redisConnection.hgetall(KEYS.heartbeat),
      redisConnection.hgetall(KEYS.counters),
      redisConnection.hgetall(KEYS.lastFailure),
      redisConnection.lrange(KEYS.queueWaitSamples, 0, SAMPLE_LIMIT - 1),
      redisConnection.lrange(KEYS.evalSamples, 0, SAMPLE_LIMIT - 1)
    ]);

    return {
      heartbeat,
      counters,
      lastFailure,
      queueWaitSamples,
      evalSamples
    };
  });

  if (!data) {
    return {
      available: false,
      ready: false,
      heartbeat: null,
      counters: { completed: 0, failed: 0 },
      queueWait: buildStats([]),
      evaluation: buildStats([]),
      lastFailure: null
    };
  }

  const lastSeenMs = toSafeNumber(data.heartbeat?.lastSeenMs);
  const ready = lastSeenMs > 0 && Date.now() - lastSeenMs <= workerReadyStaleMs;

  return {
    available: true,
    ready,
    heartbeat: {
      lastSeenMs,
      lastSeenAt: data.heartbeat?.lastSeenAt || null,
      pid: data.heartbeat?.pid || null,
      status: data.heartbeat?.status || "unknown"
    },
    counters: {
      completed: toSafeNumber(data.counters?.completed),
      failed: toSafeNumber(data.counters?.failed),
      lastCompletedAt: data.counters?.lastCompletedAt || null,
      lastJobId: data.counters?.lastJobId || null,
      lastSubmissionId: data.counters?.lastSubmissionId || null
    },
    queueWait: buildStats(data.queueWaitSamples),
    evaluation: buildStats(data.evalSamples),
    lastFailure: data.lastFailure?.at
      ? {
          at: data.lastFailure.at,
          jobId: data.lastFailure.jobId || null,
          submissionId: data.lastFailure.submissionId || null,
          reason: data.lastFailure.reason || null
        }
      : null
  };
}

module.exports = {
  recordWorkerHeartbeat,
  recordQueueAndEvaluationMetrics,
  recordWorkerCompleted,
  recordWorkerFailure,
  getWorkerTelemetrySnapshot
};
