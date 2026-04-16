const mongoose = require("mongoose");

const DocumentSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roomId: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: "Untitled Document" },
    collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isPublic: { type: Boolean, default: false },
    type: { type: String, enum: ["text", "code", "notes"], default: "text" },
    content: {
      type: String,
      default:
        "Welcome to DocuSync.\n\nStart editing collaboratively here.\n\nYou can save snapshots and restore them anytime.",
    },
    storageType: { type: String, enum: ["mongodb", "azure"], default: "mongodb" },
    blobUrl: { type: String, default: null },
    contentSize: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Document", DocumentSchema);