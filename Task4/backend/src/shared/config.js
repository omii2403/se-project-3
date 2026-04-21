const dotenv = require("dotenv");

dotenv.config();

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

module.exports = {
  port: toNumber(process.env.PORT, 5000),
  mongoUri:
    process.env.MONGO_URI || "mongodb://localhost:27017/interview_platform",
  jwtSecret: process.env.JWT_SECRET || "change_this_in_real_deployment",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
  queueName: process.env.QUEUE_NAME || "submission-jobs",
  deadLetterQueueName: process.env.DEAD_LETTER_QUEUE_NAME || "submission-jobs-dead-letter",
  workerConcurrency: toNumber(process.env.WORKER_CONCURRENCY, 2),
  workerHeartbeatIntervalMs: toNumber(process.env.WORKER_HEARTBEAT_INTERVAL_MS, 5000),
  workerReadyStaleMs: toNumber(process.env.WORKER_READY_STALE_MS, 30000),
  dockerTimeoutSec: toNumber(process.env.DOCKER_TIMEOUT_SEC, 10),
  dockerPullTimeoutSec: toNumber(process.env.DOCKER_PULL_TIMEOUT_SEC, 45),
  prePullImagesOnWorkerStart: toBoolean(process.env.PRE_PULL_IMAGES_ON_WORKER_START, true),
  summaryCacheTtlMs: toNumber(process.env.SUMMARY_CACHE_TTL_MS, 15000),
  summaryCacheMaxEntries: toNumber(process.env.SUMMARY_CACHE_MAX_ENTRIES, 2000),
  submissionsListCacheTtlMs: toNumber(process.env.SUBMISSIONS_LIST_CACHE_TTL_MS, 8000),
  questionTopicsCacheTtlMs: toNumber(process.env.QUESTION_TOPICS_CACHE_TTL_MS, 60000),
  cacheWarmupEnabled: toBoolean(process.env.CACHE_WARMUP_ENABLED, true),
  cacheWarmupRecentStudentsCount: toNumber(
    process.env.CACHE_WARMUP_RECENT_STUDENTS_COUNT,
    8
  ),
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: toNumber(process.env.REDIS_PORT, 6379)
  }
};
