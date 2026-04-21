jest.mock("../src/evaluation/queue", () => {
  const add = jest.fn().mockResolvedValue({ id: "job-1" });
  const getJobCounts = jest.fn().mockResolvedValue({
    waiting: 1,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0
  });

  return {
    getSubmissionQueue: () => ({
      add,
      getJobCounts
    }),
    getDeadLetterQueue: () => ({
      count: jest.fn().mockResolvedValue(0)
    })
  };
});

const request = require("supertest");
const app = require("../src/app");
const Question = require("../src/models/Question");
const Submission = require("../src/models/Submission");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/testDb");

async function signupStudent() {
  const payload = {
    name: "Queue Student",
    email: `queue_student_${Date.now()}@mail.com`,
    password: "pass1234",
    role: "student"
  };

  const response = await request(app).post("/api/auth/signup").send(payload);
  return response.body.token;
}

describe("Submission API integration", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test("idempotency key prevents duplicate queued submissions", async () => {
    const token = await signupStudent();

    const question = await Question.create({
      title: "Async MCQ",
      description: "Select answer",
      type: "mcq",
      topic: "DP",
      difficulty: "easy",
      choices: ["A", "B"],
      correctAnswer: "A",
      isActive: true
    });

    const body = {
      questionId: String(question._id),
      answer: "A"
    };

    const first = await request(app)
      .post("/api/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("x-idempotency-key", "idem-123")
      .send(body);

    const second = await request(app)
      .post("/api/submissions")
      .set("Authorization", `Bearer ${token}`)
      .set("x-idempotency-key", "idem-123")
      .send(body);

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);
    expect(String(second.body.submissionId)).toBe(String(first.body.submissionId));

    const submissionCount = await Submission.countDocuments();
    expect(submissionCount).toBe(1);
  });
});
