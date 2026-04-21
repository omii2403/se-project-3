const {
  summaryCacheTtlMs,
  summaryCacheMaxEntries,
  submissionsListCacheTtlMs,
  questionTopicsCacheTtlMs
} = require("./config");

const cache = new Map();

function nowMs() {
  return Date.now();
}

function pruneExpired() {
  const current = nowMs();
  for (const [key, value] of cache.entries()) {
    if (!value || Number(value.expiresAt || 0) <= current) {
      cache.delete(key);
    }
  }
}

function trimToMaxEntries() {
  const safeMax = Math.max(100, Number(summaryCacheMaxEntries || 2000));
  if (cache.size <= safeMax) {
    return;
  }

  const toRemove = cache.size - safeMax;
  let removed = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    removed += 1;
    if (removed >= toRemove) {
      break;
    }
  }
}

function getCached(key) {
  pruneExpired();

  const hit = cache.get(String(key));
  if (!hit) {
    return null;
  }

  if (hit.expiresAt <= nowMs()) {
    cache.delete(String(key));
    return null;
  }

  return hit.value;
}

function setCached(key, value, ttlMs = summaryCacheTtlMs) {
  pruneExpired();

  cache.set(String(key), {
    value,
    expiresAt: nowMs() + Number(ttlMs || summaryCacheTtlMs)
  });

  trimToMaxEntries();
}

function clearByPrefix(prefix) {
  const cleanPrefix = String(prefix || "");
  for (const key of cache.keys()) {
    if (key.startsWith(cleanPrefix)) {
      cache.delete(key);
    }
  }
}

function buildSubmissionScope(role, userId) {
  if (String(role || "") === "admin") {
    return "admin";
  }

  return `user:${String(userId || "")}`;
}

function submissionsListCacheKey({ role, userId, page, limit, type }) {
  const scope = buildSubmissionScope(role, userId);
  return [
    "submissions:list",
    scope,
    `page:${Math.max(1, Number(page || 1))}`,
    `limit:${Math.max(1, Number(limit || 10))}`,
    `type:${String(type || "all") || "all"}`
  ].join(":");
}

function questionTopicsCacheKey({ role, includeInactive }) {
  const scope = String(role || "student") === "admin" ? "admin" : "student";
  const inactive = includeInactive ? "with-inactive" : "active-only";
  return `questions:topics:${scope}:${inactive}`;
}

function invalidateSubmissionListCacheForUser(userId) {
  clearByPrefix("submissions:list:admin:");
  clearByPrefix(`submissions:list:user:${String(userId || "")}:`);
}

function invalidateSubmissionListCacheAll() {
  clearByPrefix("submissions:list:");
}

function invalidateQuestionTopicsCache() {
  clearByPrefix("questions:topics:");
}

function cacheTtlMs() {
  return {
    submissionsList: Number(submissionsListCacheTtlMs || 8000),
    questionTopics: Number(questionTopicsCacheTtlMs || 60000)
  };
}

function studentSummaryKey(userId) {
  return `student-summary:${String(userId || "")}`;
}

function adminOverviewKey() {
  return "admin-overview";
}

function invalidateStudentSummary(userId) {
  cache.delete(studentSummaryKey(userId));
}

function invalidateAdminOverview() {
  cache.delete(adminOverviewKey());
}

module.exports = {
  getCached,
  setCached,
  clearByPrefix,
  cacheTtlMs,
  studentSummaryKey,
  adminOverviewKey,
  submissionsListCacheKey,
  questionTopicsCacheKey,
  invalidateStudentSummary,
  invalidateAdminOverview,
  invalidateSubmissionListCacheForUser,
  invalidateSubmissionListCacheAll,
  invalidateQuestionTopicsCache
};
