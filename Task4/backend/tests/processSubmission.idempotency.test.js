const Question = require("../src/models/Question");
const Submission = require("../src/models/Submission");
const { processSubmission } = require("../src/evaluation/processSubmission");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/testDb");

describe("processSubmission idempotency guard", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test("skips already processed submission on repeated execution", async () => {
    const question = await Question.create({
      title: "Simple MCQ",
      description: "Pick A",
      type: "mcq",
      topic: "Trees",
      difficulty: "easy",
      choices: ["A", "B"],
      correctAnswer: "A",
      isActive: true
    });

    const submission = await Submission.create({
      userId: "507f191e810c19729de860ea",
      questionId: question._id,
      type: "mcq",
      topic: question.topic,
      difficulty: question.difficulty,
      answer: "A",
      status: "QUEUED"
    });

    const first = await processSubmission(submission._id);
    const second = await processSubmission(submission._id);

    expect(first.skipped).toBe(false);
    expect(first.status).toBe("COMPLETED");
    expect(second.skipped).toBe(true);

    const finalDoc = await Submission.findById(submission._id).lean();
    expect(finalDoc.status).toBe("COMPLETED");
    expect(finalDoc.score).toBe(100);
  });
});
