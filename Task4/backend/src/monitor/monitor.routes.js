const express = require("express");
const requireAuth = require("../shared/middleware/requireAuth");
const requireRole = require("../shared/middleware/requireRole");
const { workerConcurrency } = require("../shared/config");
const { getApiLatencySnapshot } = require("../shared/runtimeMetrics");
const { getWorkerTelemetrySnapshot } = require("../shared/workerTelemetry");
const { getSubmissionQueue, getDeadLetterQueue } = require("../evaluation/queue");

const router = express.Router();

function buildQueueEstimate(waitingCount, avgEvalMs) {
  const safeWaiting = Math.max(0, Number(waitingCount || 0));
  const safeEvalMs = Math.max(1000, Number(avgEvalMs || 1000));
  const safeWorkers = Math.max(1, Number(workerConcurrency || 1));

  return Math.round((safeWaiting * safeEvalMs) / (safeWorkers * 1000));
}

router.get("/dashboard", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [api, worker, queueCounts, deadLetterCount] = await Promise.all([
      Promise.resolve(getApiLatencySnapshot()),
      getWorkerTelemetrySnapshot(),
      getSubmissionQueue().getJobCounts("waiting", "active", "completed", "failed", "delayed"),
      getDeadLetterQueue().count()
    ]);

    const expectedQueueWaitSec = buildQueueEstimate(queueCounts.waiting, worker.evaluation.avgMs);

    return res.json({
      api,
      queue: {
        ...queueCounts,
        deadLetter: Number(deadLetterCount || 0),
        expectedQueueWaitSec
      },
      worker
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
