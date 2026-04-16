const mongoose = require("mongoose");

const SnapshotSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },
    content: { type: String, required: true },
    savedBy: { type: String, required: true },
    savedByColor: { type: String, default: "#4F46E5" },
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

SnapshotSchema.index({ roomId: 1, timestamp: -1 });

module.exports = mongoose.model("Snapshot", SnapshotSchema);
