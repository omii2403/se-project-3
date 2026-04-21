const request = require("supertest");
const app = require("../src/app");
const Question = require("../src/models/Question");
const Submission = require("../src/models/Submission");
const ViolationAudit = require("../src/models/ViolationAudit");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/testDb");

async function signupStudent() {
  const payload = {
    name: "Student One",
    email: `student_${Date.now()}@mail.com`,
    password: "pass1234",
    role: "student"
  };

  const response = await request(app).post("/api/auth/signup").send(payload);
  return response.body.token;
}

async function createMcqQuestion(overrides = {}) {
  return Question.create({
    title: "MCQ question",
    description: "Pick the right answer",
    type: "mcq",
    topic: "Arrays",
    difficulty: "easy",
    choices: ["A", "B", "C"],
    correctAnswer: "A",
    isActive: true,
    ...overrides
  });
}

async function createCodeQuestion(overrides = {}) {
  return Question.create({
    title: "Code question",
    description: "Write code",
    type: "code",
    topic: "Arrays",
    difficulty: "easy",
    sampleTestCases: [],
    hiddenTestCases: [],
    isActive: true,
    ...overrides
  });
}

describe("Timed tests integration", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test("starts and fetches a timed test session", async () => {
    const token = await signupStudent();
    await createMcqQuestion();

    const startResponse = await request(app)
      .post("/api/tests/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ count: 1, type: "mcq", durationMinutes: 30 });

    expect(startResponse.statusCode).toBe(201);
    expect(startResponse.body.session.id).toBeTruthy();
    expect(startResponse.body.session.questions).toHaveLength(1);

    const sessionId = startResponse.body.session.id;
    const getResponse = await request(app)
      .get(`/api/tests/${sessionId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body.session.status).toBe("ACTIVE");
    expect(getResponse.body.session.questions).toHaveLength(1);
  });

  test("records violations and auto-submits on second violation", async () => {
    const token = await signupStudent();
    await createMcqQuestion();

    const startResponse = await request(app)
      .post("/api/tests/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ count: 1, type: "mcq", durationMinutes: 30 });

    const sessionId = startResponse.body.session.id;

    const firstViolation = await request(app)
      .post(`/api/tests/${sessionId}/violation`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "test-violation-1")
      .send({ reason: "Tab switched" });

    expect(firstViolation.statusCode).toBe(200);
    expect(firstViolation.body.violationCount).toBe(1);
    expect(firstViolation.body.status).toBe("ACTIVE");

    const secondViolation = await request(app)
      .post(`/api/tests/${sessionId}/violation`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-request-id", "test-violation-2")
      .send({ reason: "Exited fullscreen" });

    expect(secondViolation.statusCode).toBe(200);
    expect(secondViolation.body.violationCount).toBe(2);
    expect(secondViolation.body.status).toBe("AUTO_SUBMITTED");

    const audits = await ViolationAudit.find({ sessionId }).sort({ createdAt: 1 }).lean();
    expect(audits).toHaveLength(2);
    expect(audits[0].action).toBe("VIOLATION_RECORDED");
    expect(audits[1].action).toBe("FORCED_AUTO_SUBMIT");
  });

  test("submits timed test and stores evaluated submissions", async () => {
    const token = await signupStudent();
    await createMcqQuestion();

    const startResponse = await request(app)
      .post("/api/tests/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ count: 1, type: "mcq", durationMinutes: 30 });

    const sessionId = startResponse.body.session.id;
    const questionId = startResponse.body.session.questions[0]._id;

    const submitResponse = await request(app)
      .post(`/api/tests/${sessionId}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          {
            questionId,
            answer: "A"
          }
        ]
      });

    expect(submitResponse.statusCode).toBe(200);
    expect(submitResponse.body.session.status).toBe("SUBMITTED");
    expect(submitResponse.body.session.summary.attempted).toBe(1);
    expect(submitResponse.body.session.summary.passedCount).toBe(1);

    const submissionCount = await Submission.countDocuments({ sessionId });
    expect(submissionCount).toBe(1);
  });

  test("prefers non-repeated questions and allows repetition when pool is insufficient", async () => {
    const token = await signupStudent();

    await createMcqQuestion({ topic: "Arrays" });
    await createMcqQuestion({ topic: "DP", title: "DP MCQ" });

    const firstStart = await request(app)
      .post("/api/tests/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ count: 1, type: "mcq", durationMinutes: 30 });

    const firstQuestionId = String(firstStart.body.session.questions[0]._id);

    const firstSubmit = await request(app)
      .post(`/api/tests/${firstStart.body.session.id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          {
            questionId: firstQuestionId,
            answer: "A"
          }
        ]
      });

    expect(firstSubmit.statusCode).toBe(200);

    const secondStart = await request(app)
      .post("/api/tests/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ count: 1, type: "mcq", durationMinutes: 30 });

    expect(secondStart.statusCode).toBe(201);
    const secondQuestionId = String(secondStart.body.session.questions[0]._id);
    expect(secondQuestionId).not.toBe(firstQuestionId);

    await clearTestDb();

    const token2 = await signupStudent();
    await createMcqQuestion({ topic: "OnlyOne", title: "Only question" });

    const startA = await request(app)
      .post("/api/tests/start")
      .set("Authorization", `Bearer ${token2}`)
      .send({ count: 1, type: "mcq", durationMinutes: 30 });

    const qA = String(startA.body.session.questions[0]._id);

    await request(app)
      .post(`/api/tests/${startA.body.session.id}/submit`)
      .set("Authorization", `Bearer ${token2}`)
      .send({
        answers: [
          {
            questionId: qA,
            answer: "A"
          }
        ]
      });

    const startB = await request(app)
      .post("/api/tests/start")
      .set("Authorization", `Bearer ${token2}`)
      .send({ count: 1, type: "mcq", durationMinutes: 30 });

    expect(startB.statusCode).toBe(201);
    const qB = String(startB.body.session.questions[0]._id);
    expect(qB).toBe(qA);
  });

  test("rejects same code submission for multiple coding questions in same test", async () => {
    const token = await signupStudent();

    await createCodeQuestion({ title: "Code 1", topic: "Arrays" });
    await createCodeQuestion({ title: "Code 2", topic: "DP" });

    const startResponse = await request(app)
      .post("/api/tests/start")
      .set("Authorization", `Bearer ${token}`)
      .send({ count: 2, type: "code", durationMinutes: 30 });

    expect(startResponse.statusCode).toBe(201);
    expect(startResponse.body.session.questions).toHaveLength(2);

    const firstQuestionId = startResponse.body.session.questions[0]._id;
    const secondQuestionId = startResponse.body.session.questions[1]._id;

    const duplicateCode = "print('same')";

    const submitResponse = await request(app)
      .post(`/api/tests/${startResponse.body.session.id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          {
            questionId: firstQuestionId,
            language: "python",
            code: duplicateCode
          },
          {
            questionId: secondQuestionId,
            language: "python",
            code: duplicateCode
          }
        ]
      });

    expect(submitResponse.statusCode).toBe(400);
    expect(submitResponse.body.error).toMatch(/same code submission/i);
  });
});
