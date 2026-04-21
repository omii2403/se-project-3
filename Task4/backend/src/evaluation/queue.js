const { Queue } = require("bullmq");
const redisConnection = require("../shared/redis");
const { queueName, deadLetterQueueName } = require("../shared/config");

let submissionQueue;
let deadLetterQueue;

function getSubmissionQueue() {
  if (!submissionQueue) {
    submissionQueue = new Queue(queueName, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 1000
        },
        removeOnComplete: 200,
        removeOnFail: 500
      }
    });
  }

  return submissionQueue;
}

function getDeadLetterQueue() {
  if (!deadLetterQueue) {
    deadLetterQueue = new Queue(deadLetterQueueName, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 2000,
        removeOnFail: 2000
      }
    });
  }

  return deadLetterQueue;
}

module.exports = {
  getSubmissionQueue,
  getDeadLetterQueue
};
