const mongoose = require("mongoose");

const SnapshotSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    savedBy: { type: String, required: true },
    savedByColor: { type: String, default: "#4F46E5" },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ActivitySchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    message: { type: String, required: true },
    userName: { type: String, default: "" },
    userColor: { type: String, default: "#64748b" },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

const DocumentSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    content: {
      type: String,
      default:
        "Welcome to DocuSync.\n\nStart editing collaboratively here.\n\nYou can save snapshots and restore them anytime.",
    },
    snapshots: [SnapshotSchema],
    activityLogs: [ActivitySchema],
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Document", DocumentSchema);