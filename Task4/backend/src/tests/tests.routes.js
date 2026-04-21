const express = require("express");
const mongoose = require("mongoose");
const Question = require("../models/Question");
const Submission = require("../models/Submission");
const TestSession = require("../models/TestSession");
const ViolationAudit = require("../models/ViolationAudit");
const requireAuth = require("../shared/middleware/requireAuth");
const { createEvaluationStrategy } = require("../evaluation/strategyFactory");
const {
  invalidateStudentSummary,
  invalidateAdminOverview,
  invalidateSubmissionListCacheForUser
} = require("../shared/summaryCache");
const logger = require("../shared/logger");

const router = express.Router();
const AUTO_SUBMIT_VIOLATION_LIMIT = 2;

function sanitizeQuestionForStudent(questionDoc) {
  if (!questionDoc) {
    return null;
  }

  const question = questionDoc.toObject ? questionDoc.toObject() : questionDoc;
  delete question.correctAnswer;
  delete question.hiddenTestCases;
  delete question.testCases;
  return question;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function shuffle(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function normalizeTopicList(topicInput) {
  if (Array.isArray(topicInput)) {
    return topicInput
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  const single = String(topicInput || "").trim();
  return single ? [single] : [];
}

function normalizeCodeSignature(language, code) {
  const normalizedLanguage = String(language || "").trim().toLowerCase();
  const normalizedCode = String(code || "")
    .replace(/\r\n/g, "\n")
    .trim();

  return `${normalizedLanguage}::${normalizedCode}`;
}

function pickTestCasesForEvaluation(question) {
  if (Array.isArray(question.hiddenTestCases) && question.hiddenTestCases.length > 0) {
    return question.hiddenTestCases;
  }

  if (Array.isArray(question.testCases) && question.testCases.length > 0) {
    return question.testCases;
  }

  if (Array.isArray(question.sampleTestCases) && question.sampleTestCases.length > 0) {
    return question.sampleTestCases;
  }

  return [];
}

async function findQuestionsForTest(userId, config) {
  const { topics, type, difficulty, count } = config;
  const baseQuery = { isActive: true };

  if (Array.isArray(topics) && topics.length === 1) {
    baseQuery.topic = topics[0];
  }

  if (Array.isArray(topics) && topics.length > 1) {
    baseQuery.topic = { $in: topics };
  }
  if (type) {
    baseQuery.type = type;
  }
  if (difficulty) {
    baseQuery.difficulty = difficulty;
  }

  const [attemptedQuestionIds, pastSessions] = await Promise.all([
    Submission.distinct("questionId", { userId }),
    TestSession.find({ userId }).select({ questionIds: 1 }).lean()
  ]);

  const historicalQuestionIds = [];
  for (const session of pastSessions) {
    if (!Array.isArray(session?.questionIds)) {
      continue;
    }

    for (const id of session.questionIds) {
      historicalQuestionIds.push(id);
    }
  }

  const attemptedSet = new Set(
    [...attemptedQuestionIds, ...historicalQuestionIds].map((id) => String(id || ""))
  );
  const excludeIds = [...attemptedSet].filter(Boolean);

  const freshQuestions = await Question.find({
    ...baseQuery,
    _id: { $nin: excludeIds }
  }).lean();

  const selected = shuffle(freshQuestions).slice(0, count);

  if (selected.length < count) {
    const fallbackQuestions = await Question.find(baseQuery).lean();
    const selectedIdSet = new Set(selected.map((q) => String(q._id)));

    for (const question of shuffle(fallbackQuestions)) {
      if (selected.length >= count) {
        break;
      }

      const id = String(question._id);
      if (selectedIdSet.has(id)) {
        continue;
      }

      selected.push(question);
      selectedIdSet.add(id);
    }
  }

  return selected;
}

async function getOwnedSession(sessionId, userId) {
  if (!isValidObjectId(sessionId) || !isValidObjectId(userId)) {
    return null;
  }

  return TestSession.findOne({ _id: sessionId, userId });
}

router.post("/generate", requireAuth, async (req, res) => {
  try {
    const { type, difficulty } = req.body;
    const topics = normalizeTopicList(req.body.topics || req.body.topic);
    const requestedCount = Number(req.body.count || 10);
    const count = Math.max(1, Math.min(30, requestedCount));

    const selected = await findQuestionsForTest(req.user.userId, {
      topics,
      type,
      difficulty,
      count
    });

    return res.json({
      config: {
        topic: topics[0] || null,
        topics,
        type: type || null,
        difficulty: difficulty || null,
        count: selected.length
      },
      questions: selected.map(sanitizeQuestionForStudent)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/start", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can start a timed test" });
    }

    const { type, difficulty } = req.body;
    const topics = normalizeTopicList(req.body.topics || req.body.topic);
    const requestedCount = Number(req.body.count || 10);
    const requestedDuration = Number(req.body.durationMinutes || 30);

    const count = Math.max(1, Math.min(30, requestedCount));
    const durationMinutes = Math.max(5, Math.min(180, requestedDuration));

    const selected = await findQuestionsForTest(req.user.userId, {
      topics,
      type,
      difficulty,
      count
    });

    if (selected.length === 0) {
      return res.status(404).json({ error: "No questions available for selected filters" });
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

    const session = await TestSession.create({
      userId: req.user.userId,
      questionIds: selected.map((question) => question._id),
      config: {
        topic: topics[0] || "",
        topics,
        type: type || "",
        difficulty: difficulty || "",
        count: selected.length,
        durationMinutes
      },
      startsAt,
      endsAt,
      summary: {
        totalQuestions: selected.length,
        attempted: 0,
        passedCount: 0,
        averageScore: 0
      }
    });

    return res.status(201).json({
      session: {
        id: String(session._id),
        status: session.status,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        config: session.config,
        violationCount: session.violationCount,
        questions: selected.map(sanitizeQuestionForStudent)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:sessionId", requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const session = await getOwnedSession(req.params.sessionId, req.user.userId);
    if (!session) {
      return res.status(404).json({ error: "Test session not found" });
    }

    const sessionQuestionIds = Array.isArray(session.questionIds)
      ? session.questionIds.filter((id) => isValidObjectId(id)).map((id) => String(id))
      : [];

    const questionDocs =
      sessionQuestionIds.length > 0
        ? await Question.find({ _id: { $in: sessionQuestionIds } }).lean()
        : [];

    const questionById = new Map(
      questionDocs.map((questionDoc) => [
        String(questionDoc._id),
        sanitizeQuestionForStudent(questionDoc)
      ])
    );

    const orderedQuestions = sessionQuestionIds
      .map((id) => questionById.get(id))
      .filter(Boolean);

    if (session.status === "ACTIVE" && new Date(session.endsAt) <= new Date()) {
      session.status = "EXPIRED";
      await session.save();
    }

    return res.json({
      session: {
        id: String(session._id),
        status: session.status,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        config: session.config,
        violationCount: session.violationCount,
        summary: session.summary,
        results: session.results,
        questions: orderedQuestions
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/:sessionId/violation", requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const session = await getOwnedSession(req.params.sessionId, req.user.userId);
    if (!session) {
      return res.status(404).json({ error: "Test session not found" });
    }

    if (session.status !== "ACTIVE") {
      return res.status(409).json({ error: `Session already ${session.status.toLowerCase()}` });
    }

    const reason = String(req.body?.reason || "Anti-cheat violation detected.").trim();
    session.violationCount += 1;
    if (session.violationCount >= AUTO_SUBMIT_VIOLATION_LIMIT) {
      session.status = "AUTO_SUBMITTED";
    }

    await session.save();

    const action =
      session.status === "AUTO_SUBMITTED"
        ? "FORCED_AUTO_SUBMIT"
        : "VIOLATION_RECORDED";

    await ViolationAudit.create({
      sessionId: session._id,
      userId: req.user.userId,
      reason,
      action,
      violationCount: session.violationCount,
      requestId: req.requestId || ""
    });

    logger.warn("timed_test.violation", {
      requestId: req.requestId || null,
      sessionId: String(session._id),
      userId: String(req.user.userId),
      reason,
      action,
      violationCount: session.violationCount
    });

    return res.json({
      violationCount: session.violationCount,
      status: session.status,
      message:
        session.status === "AUTO_SUBMITTED"
          ? "Second violation detected. Forced submission started."
          : "Violation recorded"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/:sessionId/run-sample", requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const session = await getOwnedSession(req.params.sessionId, req.user.userId);
    if (!session) {
      return res.status(404).json({ error: "Test session not found" });
    }

    if (session.status !== "ACTIVE") {
      return res.status(409).json({ error: "Session is not active" });
    }

    if (new Date(session.endsAt) <= new Date()) {
      session.status = "EXPIRED";
      await session.save();
      return res.status(409).json({ error: "Session expired. Submit test to see your score." });
    }

    const { questionId, language, code, answer } = req.body;
    if (!questionId) {
      return res.status(400).json({ error: "questionId is required" });
    }

    if (!isValidObjectId(questionId)) {
      return res.status(400).json({ error: "Invalid questionId" });
    }

    const sessionQuestionIds = Array.isArray(session.questionIds)
      ? session.questionIds.map((id) => String(id))
      : [];

    const inSession = sessionQuestionIds.includes(String(questionId));
    if (!inSession) {
      return res.status(403).json({ error: "Question does not belong to this session" });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    let result;
    const sampleStartedAt = Date.now();

    if (question.type === "code") {
      if (!language || !code) {
        return res.status(400).json({
          error: "questionId, language and code are required for coding sample run"
        });
      }

      const strategy = createEvaluationStrategy("code");
      const evalQuestion = {
        ...question.toObject(),
        testCases: Array.isArray(question.sampleTestCases) ? question.sampleTestCases : []
      };

      result = await strategy.evaluate({
        submission: { language, code },
        question: evalQuestion
      });
    } else if (question.type === "sql") {
      if (!String(answer || "").trim()) {
        return res.status(400).json({
          error: "questionId and answer are required for SQL sample run"
        });
      }

      const strategy = createEvaluationStrategy("sql");
      result = await strategy.evaluate({
        submission: { answer: String(answer || "") },
        question
      });
    } else {
      return res.status(400).json({
        error: "Sample run is supported only for code and sql questions"
      });
    }

    const durationMs = Date.now() - sampleStartedAt;
    return res.json({ result, durationMs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/:sessionId/submit", requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const session = await getOwnedSession(req.params.sessionId, req.user.userId);
    if (!session) {
      return res.status(404).json({ error: "Test session not found" });
    }

    const hasSavedResults = Array.isArray(session.results) && session.results.length > 0;
    if (session.status === "SUBMITTED" || (session.status === "AUTO_SUBMITTED" && hasSavedResults)) {
      return res.json({
        session: {
          id: String(session._id),
          status: session.status,
          summary: session.summary,
          violationCount: session.violationCount,
          results: session.results
        }
      });
    }

    const sessionQuestionIds = Array.isArray(session.questionIds) ? session.questionIds : [];

    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const answersById = new Map();

    for (const answer of answers) {
      if (answer && answer.questionId) {
        answersById.set(String(answer.questionId), answer);
      }
    }

    const questions = await Question.find({
      _id: { $in: sessionQuestionIds }
    });
    const questionById = new Map(questions.map((question) => [String(question._id), question]));

    const seenCodeSignatures = new Map();
    for (const questionId of sessionQuestionIds) {
      const id = String(questionId);
      const question = questionById.get(id);
      const answer = answersById.get(id);

      if (!question || !answer || question.type !== "code") {
        continue;
      }

      const signature = normalizeCodeSignature(answer.language, answer.code);
      if (!signature || signature.endsWith("::")) {
        continue;
      }

      const existingQuestionId = seenCodeSignatures.get(signature);
      if (existingQuestionId && existingQuestionId !== id) {
        return res.status(400).json({
          error:
            "Same code submission for multiple coding questions is not allowed in the same test."
        });
      }

      seenCodeSignatures.set(signature, id);
    }

    const results = [];
    const submissionDocs = [];
    let attempted = 0;

    for (const questionId of sessionQuestionIds) {
      const id = String(questionId);
      const question = questionById.get(id);
      const answer = answersById.get(id);

      if (!question) {
        continue;
      }

      const submissionPayload = {
        userId: req.user.userId,
        sessionId: session._id,
        questionId: question._id,
        idempotencyKey: `test:${String(session._id)}:${String(question._id)}`,
        type: question.type,
        topic: question.topic,
        difficulty: question.difficulty
      };

      const hasAnswer =
        question.type === "code"
          ? Boolean(String(answer?.language || "").trim() && String(answer?.code || "").trim())
          : Boolean(String(answer?.answer || "").trim());

      const startedAt = Date.now();
      if (!hasAnswer) {
        submissionPayload.status = "COMPLETED";
        submissionPayload.score = 0;
        submissionPayload.passed = false;
        submissionPayload.output = {
          stdout: "",
          stderr: "",
          details: "Question was not answered"
        };
        submissionPayload.processingStartedAt = new Date(startedAt);
        submissionPayload.processedAt = new Date();
        submissionPayload.evaluationDurationMs = Date.now() - startedAt;
        submissionDocs.push(submissionPayload);

        results.push({
          questionId: question._id,
          title: question.title,
          type: question.type,
          topic: question.topic,
          score: 0,
          passed: false,
          details: "Question was not answered",
          timeTakenMs: submissionPayload.evaluationDurationMs
        });
        continue;
      }

      attempted += 1;
      const strategy = createEvaluationStrategy(question.type);
      let result;

      if (question.type === "code") {
        const evaluationQuestion = {
          ...question.toObject(),
          testCases: pickTestCasesForEvaluation(question)
        };

        result = await strategy.evaluate({
          submission: { language: answer.language, code: answer.code },
          question: evaluationQuestion
        });

        submissionPayload.language = answer.language;
        submissionPayload.code = answer.code;
      } else {
        result = await strategy.evaluate({
          submission: { answer: answer.answer },
          question
        });
        submissionPayload.answer = answer.answer;
      }

      submissionPayload.status = "COMPLETED";
      submissionPayload.score = result.score || 0;
      submissionPayload.passed = Boolean(result.passed);
      submissionPayload.output = result.output || {};
      submissionPayload.processingStartedAt = new Date(startedAt);
      submissionPayload.processedAt = new Date();
      submissionPayload.evaluationDurationMs = Date.now() - startedAt;
      submissionDocs.push(submissionPayload);

      results.push({
        questionId: question._id,
        title: question.title,
        type: question.type,
        topic: question.topic,
        score: result.score || 0,
        passed: Boolean(result.passed),
        details: (result.output && result.output.details) || "",
        timeTakenMs: submissionPayload.evaluationDurationMs
      });
    }

    if (submissionDocs.length > 0) {
      const writes = submissionDocs.map((item) => ({
        updateOne: {
          filter: {
            userId: req.user.userId,
            sessionId: session._id,
            questionId: item.questionId
          },
          update: { $set: item },
          upsert: true
        }
      }));

      await Submission.bulkWrite(writes, { ordered: false });
      invalidateStudentSummary(req.user.userId);
      invalidateAdminOverview();
      invalidateSubmissionListCacheForUser(req.user.userId);
    }

    const passedCount = results.filter((result) => result.passed).length;
    const scoreTotal = results.reduce((total, result) => total + result.score, 0);
    const averageScore = attempted > 0 ? Math.round(scoreTotal / attempted) : 0;

    session.answers = answers
      .filter((answer) => answer && answer.questionId)
      .map((answer) => ({
        questionId: answer.questionId,
        language: answer.language || "",
        code: answer.code || "",
        answer: answer.answer || ""
      }));

    session.results = results;
    session.summary = {
      totalQuestions: sessionQuestionIds.length,
      attempted,
      passedCount,
      averageScore
    };

    const now = new Date();
    if (
      req.body.autoSubmit === true ||
      session.violationCount >= AUTO_SUBMIT_VIOLATION_LIMIT ||
      new Date(session.endsAt) <= now ||
      session.status === "EXPIRED"
    ) {
      session.status = "AUTO_SUBMITTED";
    } else {
      session.status = "SUBMITTED";
    }

    await session.save();

    return res.json({
      session: {
        id: String(session._id),
        status: session.status,
        summary: session.summary,
        violationCount: session.violationCount,
        results: session.results
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
