const Submission = require("../models/Submission");
const Question = require("../models/Question");
const { createEvaluationStrategy } = require("./strategyFactory");
const {
  invalidateStudentSummary,
  invalidateAdminOverview,
  invalidateSubmissionListCacheForUser
} = require("../shared/summaryCache");

function invalidateReadCachesForUser(userId) {
  invalidateStudentSummary(userId);
  invalidateAdminOverview();
  invalidateSubmissionListCacheForUser(userId);
}

async function processSubmission(submissionId, options = {}) {
  const queueWaitMs = Math.max(0, Number(options.queueWaitMs || 0));

  const submission = await Submission.findOneAndUpdate(
    {
      _id: submissionId,
      status: "QUEUED"
    },
    {
      $set: {
        status: "RUNNING",
        processingStartedAt: new Date(),
        queueWaitMs
      }
    },
    {
      new: true
    }
  );

  if (!submission) {
    const existing = await Submission.findById(submissionId).lean();
    if (!existing) {
      throw new Error("Submission not found");
    }

    return {
      skipped: true,
      status: existing.status,
      submissionId: String(existing._id)
    };
  }

  const evaluationStartAt = Date.now();

  const question = await Question.findById(submission.questionId);
  if (!question) {
    submission.status = "FAILED";
    submission.output.stderr = "Question not found";
    submission.processedAt = new Date();
    submission.evaluationDurationMs = Date.now() - evaluationStartAt;
    await submission.save();
    invalidateReadCachesForUser(submission.userId);
    return {
      skipped: false,
      status: submission.status,
      submissionId: String(submission._id),
      evaluationDurationMs: submission.evaluationDurationMs,
      queueWaitMs: submission.queueWaitMs
    };
  }

  try {
    const strategy = createEvaluationStrategy(question.type);
    const result = await strategy.evaluate({ submission, question });

    submission.status = "COMPLETED";
    submission.passed = Boolean(result.passed);
    submission.score = Number(result.score || 0);
    submission.output.stdout = result.output?.stdout || "";
    submission.output.stderr = result.output?.stderr || "";
    submission.output.details = result.output?.details || "";
    submission.processedAt = new Date();
    submission.evaluationDurationMs = Date.now() - evaluationStartAt;
    await submission.save();
    invalidateReadCachesForUser(submission.userId);
  } catch (err) {
    submission.status = "FAILED";
    submission.output.stderr = err.message;
    submission.processedAt = new Date();
    submission.evaluationDurationMs = Date.now() - evaluationStartAt;
    await submission.save();
    invalidateReadCachesForUser(submission.userId);
  }

  return {
    skipped: false,
    status: submission.status,
    submissionId: String(submission._id),
    evaluationDurationMs: submission.evaluationDurationMs,
    queueWaitMs: submission.queueWaitMs
  };
}

module.exports = {
  processSubmission
};
