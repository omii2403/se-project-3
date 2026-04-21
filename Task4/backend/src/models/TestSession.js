const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    language: { type: String },
    code: { type: String },
    answer: { type: String }
  },
  { _id: false }
);

const resultSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, default: "" },
    type: { type: String, required: true },
    topic: { type: String, required: true },
    score: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    details: { type: String, default: "" },
    timeTakenMs: { type: Number, default: 0 }
  },
  { _id: false }
);

const testSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    config: {
      topic: { type: String, default: "" },
      topics: [{ type: String }],
      type: { type: String, default: "" },
      difficulty: { type: String, default: "" },
      count: { type: Number, default: 0 },
      durationMinutes: { type: Number, default: 30 }
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "SUBMITTED", "AUTO_SUBMITTED", "EXPIRED"],
      default: "ACTIVE"
    },
    violationCount: { type: Number, default: 0 },
    answers: [answerSchema],
    results: [resultSchema],
    summary: {
      totalQuestions: { type: Number, default: 0 },
      attempted: { type: Number, default: 0 },
      passedCount: { type: Number, default: 0 },
      averageScore: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

testSessionSchema.index({ userId: 1, createdAt: -1 });
testSessionSchema.index({ userId: 1, status: 1, createdAt: -1 });
testSessionSchema.index({ userId: 1, endsAt: -1 });

module.exports = mongoose.model("TestSession", testSessionSchema);
