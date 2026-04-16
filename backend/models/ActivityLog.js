const mongoose = require("mongoose");

const ActivityLogSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    userName: { type: String, default: "" },
    userColor: { type: String, default: "#64748b" },
    timestamp: { type: Date, default: Date.now, expires: 604800 }, // 7 day TTL
  },
  { versionKey: false }
);

ActivityLogSchema.index({ roomId: 1, timestamp: -1 });

module.exports = mongoose.model("ActivityLog", ActivityLogSchema);
