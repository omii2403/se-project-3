const express = require("express");
const Question = require("../models/Question");
const requireAuth = require("../shared/middleware/requireAuth");
const requireRole = require("../shared/middleware/requireRole");
const {
  getCached,
  setCached,
  questionTopicsCacheKey,
  cacheTtlMs,
  invalidateQuestionTopicsCache
} = require("../shared/summaryCache");

const router = express.Router();

function sanitizeQuestionForStudent(questionDoc) {
  const question = questionDoc.toObject ? questionDoc.toObject() : questionDoc;
  delete question.correctAnswer;
  delete question.hiddenTestCases;
  delete question.testCases;
  return question;
}

function normalizeQuestionPayload(payload = {}) {
  const normalized = { ...payload };

  if (normalized.type !== "sql") {
    normalized.sqlTableCsv = "";
    normalized.sqlExpectedOutputCsv = "";
  }

  if (normalized.type !== "code") {
    normalized.sampleTestCases = [];
    normalized.hiddenTestCases = [];
    normalized.testCases = [];
    normalized.constraints = "";
    return normalized;
  }

  if (!Array.isArray(normalized.sampleTestCases) && Array.isArray(normalized.testCases)) {
    normalized.sampleTestCases = normalized.testCases;
  }

  if (!Array.isArray(normalized.sampleTestCases)) {
    normalized.sampleTestCases = [];
  }

  if (!Array.isArray(normalized.hiddenTestCases)) {
    normalized.hiddenTestCases = [];
  }

  normalized.testCases = normalized.hiddenTestCases;
  return normalized;
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const { type, topic, difficulty, includeInactive } = req.query;
    const query = {};

    if (req.user.role !== "admin" || includeInactive !== "true") {
      query.isActive = true;
    }

    if (type) {
      query.type = type;
    }

    if (topic) {
      query.topic = topic;
    }

    if (difficulty) {
      query.difficulty = difficulty;
    }

    const questions = await Question.find(query).sort({ createdAt: -1 });

    if (req.user.role === "admin") {
      return res.json({ questions });
    }

    return res.json({ questions: questions.map(sanitizeQuestionForStudent) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/topics", requireAuth, async (req, res) => {
  try {
    const includeInactive = req.user.role === "admin" && req.query.includeInactive === "true";
    const cacheKey = questionTopicsCacheKey({
      role: req.user.role,
      includeInactive
    });

    const cached = getCached(cacheKey);
    if (cached) {
      res.setHeader("x-read-cache", "hit");
      return res.json(cached);
    }

    const query = {};

    if (!includeInactive) {
      query.isActive = true;
    }

    const topics = await Question.distinct("topic", query);
    const cleanTopics = topics
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const response = { topics: cleanTopics };
    setCached(cacheKey, response, cacheTtlMs().questionTopics);
    res.setHeader("x-read-cache", "miss");
    return res.json(response);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question || !question.isActive) {
      return res.status(404).json({ error: "Question not found" });
    }

    if (req.user.role === "admin") {
      return res.json({ question });
    }

    return res.json({ question: sanitizeQuestionForStudent(question) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const payload = normalizeQuestionPayload(req.body);

    if (!payload.title || !payload.description || !payload.type || !payload.topic || !payload.difficulty) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const question = await Question.create({
      ...payload,
      createdBy: req.user.userId
    });

    invalidateQuestionTopicsCache();

    return res.status(201).json({ question });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const payload = normalizeQuestionPayload(req.body);

    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    );

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    invalidateQuestionTopicsCache();

    return res.json({ question });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/:id/permanent", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.id);

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    invalidateQuestionTopicsCache();

    return res.json({ message: "Question permanently deleted" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true }
    );

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    invalidateQuestionTopicsCache();

    return res.json({ message: "Question deactivated" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
