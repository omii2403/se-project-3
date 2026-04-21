const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "TestSession" },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
    type: { type: String, enum: ["code", "mcq", "sql"], required: true },
    topic: { type: String, required: true },
    difficulty: { type: String, required: true },
    idempotencyKey: { type: String },
    language: { type: String },
    code: { type: String },
    answer: { type: String },
    status: {
      type: String,
      enum: ["QUEUED", "RUNNING", "COMPLETED", "FAILED"],
      default: "QUEUED"
    },
    processingStartedAt: { type: Date },
    processedAt: { type: Date },
    queueWaitMs: { type: Number, default: 0 },
    evaluationDurationMs: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    output: {
      stdout: { type: String, default: "" },
      stderr: { type: String, default: "" },
      details: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

submissionSchema.index({ userId: 1, createdAt: -1 });
submissionSchema.index({ questionId: 1, createdAt: -1 });
submissionSchema.index({ status: 1, createdAt: -1 });
submissionSchema.index({ sessionId: 1, createdAt: -1 });
submissionSchema.index({ userId: 1, status: 1, topic: 1, createdAt: -1 });
submissionSchema.index({ status: 1, topic: 1, createdAt: -1 });
submissionSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Submission", submissionSchema);
