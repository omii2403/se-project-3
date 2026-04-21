const mongoose = require("mongoose");

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, default: "" },
    expectedOutput: { type: String, required: true }
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    constraints: { type: String, default: "", trim: true },
    type: { type: String, enum: ["code", "mcq", "sql"], required: true },
    topic: { type: String, required: true, trim: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
    choices: [{ type: String }],
    correctAnswer: { type: String },
    sqlTableCsv: { type: String, default: "" },
    sqlExpectedOutputCsv: { type: String, default: "" },
    sampleTestCases: [testCaseSchema],
    hiddenTestCases: [testCaseSchema],
    testCases: [testCaseSchema],
    languageHints: [{ type: String }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

questionSchema.index({ topic: 1, difficulty: 1, type: 1 });
questionSchema.index({ isActive: 1, topic: 1, type: 1, difficulty: 1 });

module.exports = mongoose.model("Question", questionSchema);
