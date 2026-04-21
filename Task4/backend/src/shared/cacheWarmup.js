const Question = require("../models/Question");
const {
  cacheWarmupEnabled,
  cacheWarmupRecentStudentsCount
} = require("./config");
const {
  setCached,
  questionTopicsCacheKey,
  cacheTtlMs
} = require("./summaryCache");
const {
  getHotStudentUserIds,
  warmSubmissionReadCaches
} = require("../submissions/submissionReadService");
const logger = require("./logger");

function normalizeTopics(topics) {
  return topics
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function warmQuestionTopicsCaches() {
  const [activeOnly, includeInactive] = await Promise.all([
    Question.distinct("topic", { isActive: true }),
    Question.distinct("topic", {})
  ]);

  const activeTopics = normalizeTopics(activeOnly);
  const allTopics = normalizeTopics(includeInactive);

  const topicTtlMs = cacheTtlMs().questionTopics;

  setCached(
    questionTopicsCacheKey({ role: "student", includeInactive: false }),
    { topics: activeTopics },
    topicTtlMs
  );

  setCached(
    questionTopicsCacheKey({ role: "admin", includeInactive: false }),
    { topics: activeTopics },
    topicTtlMs
  );

  setCached(
    questionTopicsCacheKey({ role: "admin", includeInactive: true }),
    { topics: allTopics },
    topicTtlMs
  );

  return {
    activeTopics: activeTopics.length,
    allTopics: allTopics.length
  };
}

async function warmSubmissionCaches() {
  const hotStudentUserIds = await getHotStudentUserIds(cacheWarmupRecentStudentsCount);
  await warmSubmissionReadCaches({
    studentUserIds: hotStudentUserIds,
    includeAdmin: true
  });

  return {
    warmedStudentScopes: hotStudentUserIds.length,
    includeAdmin: true
  };
}

async function warmReadCaches() {
  if (!cacheWarmupEnabled) {
    logger.info("cache.warmup.skipped", {
      reason: "disabled"
    });
    return;
  }

  const startedAt = Date.now();

  try {
    const [topics, submissions] = await Promise.all([
      warmQuestionTopicsCaches(),
      warmSubmissionCaches()
    ]);

    logger.info("cache.warmup.completed", {
      durationMs: Date.now() - startedAt,
      topics,
      submissions
    });
  } catch (err) {
    logger.warn("cache.warmup.partial_failure", {
      durationMs: Date.now() - startedAt,
      error: err.message
    });
  }
}

module.exports = {
  warmReadCaches
};
