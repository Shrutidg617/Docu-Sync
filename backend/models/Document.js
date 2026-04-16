const mongoose = require("mongoose");

const DocumentSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    content: {
      type: String,
      default:
        "Welcome to DocuSync.\n\nStart editing collaboratively here.\n\nYou can save snapshots and restore them anytime.",
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Document", DocumentSchema);