const mongoose = require("mongoose");

const SnapshotSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },
    content: { type: String, required: true },
    savedBy: { type: String, required: true },
    savedByColor: { type: String, default: "#4F46E5" },
    timestamp: { type: Date, default: Date.now },
    aiSummary: { type: String, default: "" },
    tag: { type: String, default: "" },
    storageType: { type: String, enum: ["mongodb", "azure"], default: "mongodb" },
    blobUrl: { type: String, default: null },
    contentSize: { type: Number, default: 0 },
    version: { type: Number, required: true },
    parentVersion: { type: Number, default: null }
  },
  { versionKey: false }
);

SnapshotSchema.index({ roomId: 1, timestamp: -1 });

module.exports = mongoose.model("Snapshot", SnapshotSchema);
