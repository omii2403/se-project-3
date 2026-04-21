const API_SAMPLE_LIMIT = 800;
const apiSamples = [];

function toSafeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return n;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function round(value) {
  return Number(toSafeNumber(value).toFixed(2));
}

function recordApiLatency(sample) {
  const latencyMs = toSafeNumber(sample?.latencyMs);

  apiSamples.push({
    latencyMs,
    method: String(sample?.method || ""),
    path: String(sample?.path || ""),
    statusCode: Number(sample?.statusCode || 0),
    recordedAt: Date.now()
  });

  if (apiSamples.length > API_SAMPLE_LIMIT) {
    apiSamples.splice(0, apiSamples.length - API_SAMPLE_LIMIT);
  }
}

function getApiLatencySnapshot(windowMs = 5 * 60 * 1000) {
  const now = Date.now();
  const windowStart = now - toSafeNumber(windowMs);

  const recent = apiSamples.filter((item) => item.recordedAt >= windowStart);
  const values = recent.map((item) => item.latencyMs);
  const count = values.length;

  if (count === 0) {
    return {
      count: 0,
      avgMs: 0,
      p95Ms: 0,
      maxMs: 0,
      windowMs: toSafeNumber(windowMs)
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    count,
    avgMs: round(total / count),
    p95Ms: round(percentile(values, 95)),
    maxMs: round(Math.max(...values)),
    windowMs: toSafeNumber(windowMs)
  };
}

module.exports = {
  recordApiLatency,
  getApiLatencySnapshot
};
