const { Worker } = require("bullmq");
const redisConnection = require("./shared/redis");
const { connectDb } = require("./shared/db");
const {
  queueName,
  workerConcurrency,
  workerHeartbeatIntervalMs,
  prePullImagesOnWorkerStart
} = require("./shared/config");
const { processSubmission } = require("./evaluation/processSubmission");
const { getDeadLetterQueue } = require("./evaluation/queue");
const { prePullDockerImages } = require("./evaluation/dockerRunner");
const {
  recordWorkerHeartbeat,
  recordQueueAndEvaluationMetrics,
  recordWorkerCompleted,
  recordWorkerFailure
} = require("./shared/workerTelemetry");
const logger = require("./shared/logger");

async function ensureRedisAvailable() {
  try {
    if (redisConnection.status === "wait") {
      await redisConnection.connect();
    }
    await redisConnection.ping();
  } catch (err) {
    throw new Error(
      "Redis is not reachable on localhost:6379. Start Docker Desktop and run 'docker compose up -d redis' from Task4 folder."
    );
  }
}

async function startWorker() {
  await connectDb();
  await ensureRedisAvailable();

  await recordWorkerHeartbeat({ status: "starting" });

  if (prePullImagesOnWorkerStart) {
    const pullResult = await prePullDockerImages();
    if (!pullResult.ok) {
      logger.warn("worker.prepull.failed", {
        error: pullResult.error,
        images: pullResult.images
      });
    } else {
      logger.info("worker.prepull.completed", {
        images: pullResult.images
      });
    }
  }

  const deadLetterQueue = getDeadLetterQueue();

  const worker = new Worker(
    queueName,
    async (job) => {
      const startedAt = Date.now();
      const queueWaitMs = Math.max(0, startedAt - Number(job.timestamp || startedAt));

      const result = await processSubmission(job.data.submissionId, {
        queueWaitMs
      });

      const evaluationMs = Date.now() - startedAt;
      await recordQueueAndEvaluationMetrics(queueWaitMs, evaluationMs);

      return {
        queueWaitMs,
        evaluationMs,
        skipped: Boolean(result?.skipped),
        status: result?.status || "unknown",
        submissionId: result?.submissionId || String(job.data?.submissionId || "")
      };
    },
    {
      connection: redisConnection,
      concurrency: workerConcurrency
    }
  );

  const heartbeatTimer = setInterval(() => {
    void recordWorkerHeartbeat({ status: "running" });
  }, Math.max(1000, Number(workerHeartbeatIntervalMs || 5000)));

  worker.on("completed", async (job) => {
    await recordWorkerCompleted({
      jobId: job.id,
      submissionId: job.returnvalue?.submissionId || job.data?.submissionId
    });

    logger.info("worker.job.completed", {
      jobId: String(job.id),
      submissionId: String(job.returnvalue?.submissionId || job.data?.submissionId || ""),
      queueWaitMs: Number(job.returnvalue?.queueWaitMs || 0),
      evaluationMs: Number(job.returnvalue?.evaluationMs || 0),
      skipped: Boolean(job.returnvalue?.skipped)
    });
  });

  worker.on("failed", async (job, err) => {
    const jobId = job ? String(job.id) : "unknown";
    const submissionId = String(job?.data?.submissionId || "");
    const reason = err?.message || "Worker job failed";

    await recordWorkerFailure({ jobId, submissionId, reason });

    const attemptsAllowed = Number(job?.opts?.attempts || 1);
    const attemptsMade = Number(job?.attemptsMade || 0);
    const isFinalFailure = attemptsMade >= attemptsAllowed;

    if (isFinalFailure && job) {
      try {
        await deadLetterQueue.add("submission-dead-letter", {
          originalJobId: String(job.id),
          submissionId,
          reason,
          failedAt: new Date().toISOString(),
          attemptsAllowed,
          attemptsMade
        });
      } catch (deadLetterError) {
        logger.error("worker.dead_letter.enqueue_failed", {
          jobId,
          submissionId,
          error: deadLetterError.message
        });
      }
    }

    logger.error("worker.job.failed", {
      jobId,
      submissionId,
      attemptsMade,
      attemptsAllowed,
      reason
    });
  });

  worker.on("error", (err) => {
    logger.error("worker.error", {
      error: err.message
    });
  });

  const shutdown = async (signal) => {
    clearInterval(heartbeatTimer);
    await recordWorkerHeartbeat({ status: `stopped:${signal}` });
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  logger.info("worker.started", {
    queueName,
    workerConcurrency
  });
}

startWorker().catch((err) => {
  logger.error("worker.start_failed", {
    error: err.message
  });
  process.exit(1);
});
