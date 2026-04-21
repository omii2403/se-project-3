const Submission = require("../models/Submission");
const TestSession = require("../models/TestSession");
const mongoose = require("mongoose");
const { workerConcurrency } = require("../shared/config");
const { getWorkerTelemetrySnapshot } = require("../shared/workerTelemetry");
const { getSubmissionQueue } = require("../evaluation/queue");
const {
  getCached,
  setCached,
  cacheTtlMs,
  submissionsListCacheKey
} = require("../shared/summaryCache");

function isQueueConnectionError(err) {
  if (!err) {
    return false;
  }

  if (err.code === "ECONNREFUSED") {
    return true;
  }

  const message = String(err.message || "");
  if (message.includes("ECONNREFUSED") || message.includes("Connection is closed")) {
    return true;
  }

  if (Array.isArray(err.errors)) {
    return err.errors.some((inner) => inner && inner.code === "ECONNREFUSED");
  }

  return false;
}

function estimateQueueSeconds(waitingCount, avgEvaluationMs) {
  const safeWaiting = Math.max(0, Number(waitingCount || 0));
  const safeAvgEvalMs = Math.max(1000, Number(avgEvaluationMs || 1000));
  const safeWorkers = Math.max(1, Number(workerConcurrency || 1));
  return Math.round((safeWaiting * safeAvgEvalMs) / (safeWorkers * 1000));
}

function queueStatusLabel(status) {
  if (status === "QUEUED") {
    return "Waiting in queue";
  }
  if (status === "RUNNING") {
    return "Evaluation running";
  }
  if (status === "FAILED") {
    return "Evaluation failed";
  }
  return "Evaluation completed";
}

function normalizeType(type) {
  const clean = String(type || "").trim().toLowerCase();
  if (["code", "mcq", "sql", "test"].includes(clean)) {
    return clean;
  }
  return "all";
}

function buildSubmissionQuery({ role, userId, type }) {
  const isAdmin = String(role || "") === "admin";
  const query = {};

  if (!isAdmin) {
    if (mongoose.Types.ObjectId.isValid(String(userId || ""))) {
      query.userId = new mongoose.Types.ObjectId(String(userId));
    } else {
      query.userId = String(userId || "");
    }
  }

  if (["code", "mcq", "sql"].includes(type)) {
    query.type = type;
  } else if (type === "test") {
    query.sessionId = { $exists: true, $ne: null };
  }
  return query;
}

function buildPagination({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages
  };
}

function pickAggregateStatus(statuses) {
  const set = new Set((statuses || []).map((item) => String(item || "").toUpperCase()));

  if (set.has("RUNNING")) {
    return "RUNNING";
  }
  if (set.has("QUEUED")) {
    return "QUEUED";
  }
  if (set.has("FAILED")) {
    return "FAILED";
  }
  return "COMPLETED";
}

function mapQuestionDetails(details) {
  return (details || []).map((entry) => ({
    questionId: String(entry?.questionId || ""),
    type: String(entry?.type || "").toLowerCase(),
    topic: String(entry?.topic || "-"),
    difficulty: String(entry?.difficulty || "-"),
    status: String(entry?.status || "").toUpperCase(),
    score: Number(entry?.score || 0),
    passed: Boolean(entry?.passed),
    submittedAt: entry?.submittedAt || null,
    processedAt: entry?.processedAt || null
  }));
}

async function fetchSubmissionGroups(query, { page, limit }) {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.max(1, Number(limit || 10));
  const skip = (safePage - 1) * safeLimit;

  const groupedStages = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { $ifNull: ["$sessionId", "$_id"] },
        hasSession: {
          $max: {
            $cond: [{ $ne: ["$sessionId", null] }, 1, 0]
          }
        },
        sessionId: { $max: "$sessionId" },
        firstDoc: { $first: "$$ROOT" },
        latestCreatedAt: { $max: "$createdAt" },
        earliestCreatedAt: { $min: "$createdAt" },
        latestProcessedAt: { $max: "$processedAt" },
        statuses: { $addToSet: "$status" },
        topics: { $addToSet: "$topic" },
        difficulties: { $addToSet: "$difficulty" },
        types: { $addToSet: "$type" },
        scoreTotal: { $sum: { $ifNull: ["$score", 0] } },
        passedCount: {
          $sum: {
            $cond: ["$passed", 1, 0]
          }
        },
        questionCount: { $sum: 1 },
        questionDetails: {
          $push: {
            questionId: "$questionId",
            type: "$type",
            topic: "$topic",
            difficulty: "$difficulty",
            status: "$status",
            score: { $ifNull: ["$score", 0] },
            passed: "$passed",
            submittedAt: "$createdAt",
            processedAt: "$processedAt"
          }
        },
        totalQueueWaitMs: { $sum: { $ifNull: ["$queueWaitMs", 0] } },
        totalEvaluationMs: { $sum: { $ifNull: ["$evaluationDurationMs", 0] } }
      }
    },
    { $sort: { latestCreatedAt: -1 } }
  ];

  const result = await Submission.aggregate([
    ...groupedStages,
    {
      $facet: {
        metadata: [{ $count: "total" }],
        rows: [{ $skip: skip }, { $limit: safeLimit }]
      }
    }
  ]);

  const first = Array.isArray(result) ? result[0] : null;
  const rows = first?.rows || [];
  const total = Number(first?.metadata?.[0]?.total || 0);

  return {
    rows,
    total
  };
}

function enrichWithoutQueue(submissions) {
  return submissions.map((item) => {
    const totalProcessingMs =
      Math.max(0, Number(item.queueWaitMs || 0)) +
      Math.max(0, Number(item.evaluationDurationMs || 0));

    return {
      ...item,
      queueStatus: queueStatusLabel(String(item.status || "")),
      expectedProcessingSeconds: 0,
      actualProcessingSeconds:
        totalProcessingMs > 0 ? Math.max(1, Math.round(totalProcessingMs / 1000)) : 0,
      submittedAt: item.createdAt || null,
      processedAt: item.processedAt || null,
      testStatusLabel: null,
      sessionViolationCount: 0
    };
  });
}

async function buildSessionMap(submissions) {
  const sessionIds = [...new Set(submissions.map((item) => String(item.sessionId || "")).filter(Boolean))];

  if (sessionIds.length === 0) {
    return new Map();
  }

  const sessions = await TestSession.find({
    _id: { $in: sessionIds }
  })
    .select({ _id: 1, status: 1, violationCount: 1 })
    .lean();

  return new Map(sessions.map((session) => [String(session._id), session]));
}

async function fetchWithQueueData(query, { page, limit }) {
  const [grouped, workerTelemetry, queueCounts] = await Promise.all([
    fetchSubmissionGroups(query, { page, limit }),
    getWorkerTelemetrySnapshot(),
    getSubmissionQueue().getJobCounts("waiting", "active", "completed", "failed", "delayed")
  ]);

  const avgEvaluationMs = Number(workerTelemetry?.evaluation?.avgMs || 1000);
  const queueWaiting = Number(queueCounts?.waiting || 0);
  const sessionMap = await buildSessionMap(grouped.rows);

  const enriched = grouped.rows.map((row) => {
    const isTimedTestGroup = Number(row?.hasSession || 0) === 1 && String(row?.sessionId || "");
    const firstDoc = row?.firstDoc || {};
    const currentStatus = pickAggregateStatus(row?.statuses);
    const session = sessionMap.get(String(row?.sessionId || ""));
    const violationCount = Number(session?.violationCount || 0);
    let expectedProcessingSeconds = 0;
    const totalProcessingMs =
      Math.max(0, Number(row?.totalQueueWaitMs || 0)) +
      Math.max(0, Number(row?.totalEvaluationMs || 0));

    if (currentStatus === "QUEUED") {
      expectedProcessingSeconds = estimateQueueSeconds(queueWaiting, avgEvaluationMs);
    } else if (currentStatus === "RUNNING") {
      expectedProcessingSeconds = Math.max(1, Math.round(avgEvaluationMs / 1000));
    }

    if (isTimedTestGroup) {
      const questionCount = Math.max(1, Number(row?.questionCount || 1));
      const topics = (row?.topics || []).map((item) => String(item || "")).filter(Boolean);
      const difficulties = (row?.difficulties || [])
        .map((item) => String(item || ""))
        .filter(Boolean);
      const types = (row?.types || []).map((item) => String(item || "")).filter(Boolean);
      const sessionStatus = String(session?.status || "").toUpperCase();

      return {
        _id: `session-${String(row.sessionId)}`,
        sessionId: row.sessionId,
        type: "test",
        topic: topics.length <= 1 ? topics[0] || "-" : topics.join(", "),
        difficulty: difficulties.length <= 1 ? difficulties[0] || "-" : "mixed",
        status: sessionStatus || currentStatus,
        queueStatus: queueStatusLabel(currentStatus),
        expectedProcessingSeconds,
        actualProcessingSeconds:
          totalProcessingMs > 0 ? Math.max(1, Math.round(totalProcessingMs / 1000)) : 0,
        submittedAt: row?.earliestCreatedAt || firstDoc.createdAt || null,
        processedAt: row?.latestProcessedAt || null,
        score: Math.round(Number(row?.scoreTotal || 0) / questionCount),
        passed: Number(row?.passedCount || 0) >= questionCount,
        questionCount,
        questionTypes: types,
        questionDetails: mapQuestionDetails(row?.questionDetails),
        testStatusLabel:
          session?.status === "AUTO_SUBMITTED" && violationCount >= 2
            ? "Violation of test"
            : null,
        sessionViolationCount: violationCount
      };
    }

    return {
      ...firstDoc,
      queueStatus: queueStatusLabel(currentStatus),
      expectedProcessingSeconds,
      actualProcessingSeconds:
        totalProcessingMs > 0 ? Math.max(1, Math.round(totalProcessingMs / 1000)) : 0,
      submittedAt: firstDoc.createdAt || null,
      processedAt: firstDoc.processedAt || null,
      questionCount: 1,
      testStatusLabel:
        session?.status === "AUTO_SUBMITTED" && violationCount >= 2
          ? "Violation of test"
          : null,
      sessionViolationCount: violationCount
    };
  });

  return {
    submissions: enriched,
    pagination: buildPagination({ page, limit, total: grouped.total })
  };
}

async function fetchWithoutQueueData(query, { page, limit }) {
  const grouped = await fetchSubmissionGroups(query, { page, limit });

  const sessionMap = await buildSessionMap(grouped.rows);
  const base = enrichWithoutQueue(grouped.rows.map((row) => row?.firstDoc || {}));
  const enriched = base.map((item) => {
    const source = grouped.rows.find(
      (row) => String(row?.firstDoc?._id || "") === String(item?._id || "")
    );
    const isTimedTestGroup = Number(source?.hasSession || 0) === 1 && String(source?.sessionId || "");
    const session = sessionMap.get(String(source?.sessionId || item.sessionId || ""));
    const violationCount = Number(session?.violationCount || 0);

    if (isTimedTestGroup) {
      const questionCount = Math.max(1, Number(source?.questionCount || 1));
      const topics = (source?.topics || []).map((entry) => String(entry || "")).filter(Boolean);
      const difficulties = (source?.difficulties || [])
        .map((entry) => String(entry || ""))
        .filter(Boolean);
      const types = (source?.types || []).map((entry) => String(entry || "")).filter(Boolean);
      const currentStatus = pickAggregateStatus(source?.statuses);
      const sessionStatus = String(session?.status || "").toUpperCase();
      const totalProcessingMs =
        Math.max(0, Number(source?.totalQueueWaitMs || 0)) +
        Math.max(0, Number(source?.totalEvaluationMs || 0));

      return {
        _id: `session-${String(source.sessionId)}`,
        sessionId: source.sessionId,
        type: "test",
        topic: topics.length <= 1 ? topics[0] || "-" : topics.join(", "),
        difficulty: difficulties.length <= 1 ? difficulties[0] || "-" : "mixed",
        status: sessionStatus || currentStatus,
        queueStatus: queueStatusLabel(currentStatus),
        expectedProcessingSeconds: 0,
        actualProcessingSeconds:
          totalProcessingMs > 0 ? Math.max(1, Math.round(totalProcessingMs / 1000)) : 0,
        submittedAt: source?.earliestCreatedAt || item.createdAt || null,
        processedAt: source?.latestProcessedAt || null,
        score: Math.round(Number(source?.scoreTotal || 0) / questionCount),
        passed: Number(source?.passedCount || 0) >= questionCount,
        questionCount,
        questionTypes: types,
        questionDetails: mapQuestionDetails(source?.questionDetails),
        testStatusLabel:
          session?.status === "AUTO_SUBMITTED" && violationCount >= 2
            ? "Violation of test"
            : null,
        sessionViolationCount: violationCount
      };
    }

    return {
      ...item,
      testStatusLabel:
        session?.status === "AUTO_SUBMITTED" && violationCount >= 2
          ? "Violation of test"
          : null,
      sessionViolationCount: violationCount
    };
  });

  return {
    submissions: enriched,
    pagination: buildPagination({ page, limit, total: grouped.total })
  };
}

async function getSubmissionListWithCache({ role, userId, page, limit, type, bypassCache = false }) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 10)));
  const safePage = Math.max(1, Number(page || 1));
  const normalizedType = normalizeType(type);

  const cacheKey = submissionsListCacheKey({
    role,
    userId,
    page: safePage,
    limit: safeLimit,
    type: normalizedType
  });

  if (!bypassCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      return {
        payload: cached,
        cacheHit: true,
        source: "cache"
      };
    }
  }

  const query = buildSubmissionQuery({ role, userId, type: normalizedType });

  let payload;
  let source = "db+queue";
  try {
    payload = await fetchWithQueueData(query, {
      page: safePage,
      limit: safeLimit
    });
  } catch (err) {
    if (!isQueueConnectionError(err)) {
      throw err;
    }

    payload = await fetchWithoutQueueData(query, {
      page: safePage,
      limit: safeLimit
    });
    source = "db-only";
  }

  if (!bypassCache) {
    setCached(cacheKey, payload, cacheTtlMs().submissionsList);
  }

  return {
    payload,
    cacheHit: false,
    source
  };
}

async function getHotStudentUserIds(limit = 8) {
  const safeLimit = Math.max(1, Number(limit || 8));

  const rows = await Submission.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$userId" } },
    { $limit: safeLimit }
  ]);

  return rows.map((row) => String(row?._id || "")).filter(Boolean);
}

async function warmSubmissionReadCaches({ studentUserIds = [], includeAdmin = true } = {}) {
  const jobs = [];

  if (includeAdmin) {
    jobs.push(
      getSubmissionListWithCache({
        role: "admin",
        userId: "",
        page: 1,
        limit: 10,
        type: "all"
      })
    );
  }

  for (const userId of studentUserIds) {
    jobs.push(
      getSubmissionListWithCache({
        role: "student",
        userId,
        page: 1,
        limit: 10,
        type: "all"
      })
    );
  }

  await Promise.all(jobs.map((job) => job.catch(() => null)));
}

module.exports = {
  isQueueConnectionError,
  getSubmissionListWithCache,
  warmSubmissionReadCaches,
  getHotStudentUserIds
};
