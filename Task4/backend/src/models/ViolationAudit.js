const mongoose = require("mongoose");

const violationAuditSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "TestSession", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true },
    action: { type: String, required: true },
    violationCount: { type: Number, default: 0 },
    requestId: { type: String, default: "" }
  },
  { timestamps: true }
);

violationAuditSchema.index({ sessionId: 1, createdAt: -1 });
violationAuditSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("ViolationAudit", violationAuditSchema);
