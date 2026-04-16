const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const Document = require("./models/Document");
const Snapshot = require("./models/Snapshot");
const ActivityLog = require("./models/ActivityLog");

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const activeUsersByRoom = {};

const { MongoMemoryServer } = require("mongodb-memory-server");

async function connectToDatabase() {
  try {
    let mongoUri = process.env.MONGO_URI;

    if (!mongoUri || mongoUri.trim() === "") {
      console.log("No MONGO_URI provided. Starting a localized in-memory MongoDB server...");
      const mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      console.log(`In-memory database successfully started at: ${mongoUri}`);
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB securely connected!");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
}

connectToDatabase();

function getDefaultContent() {
  return "Welcome to DocuSync.\n\nStart editing collaboratively here.\n\nYou can save snapshots and restore them anytime.";
}

async function getOrCreateDocument(roomId) {
  let doc = await Document.findOne({ roomId });

  if (!doc) {
    doc = await Document.create({
      roomId,
      content: getDefaultContent(),
      updatedAt: new Date(),
    });
    
    await ActivityLog.create({
      roomId,
      type: "system",
      message: "Document created",
      userName: "System",
      userColor: "#64748b",
      timestamp: new Date(),
    });
  }

  return doc;
}

async function addActivity(roomId, activity) {
  await Document.updateOne({ roomId }, { $set: { updatedAt: new Date() } });
  return ActivityLog.create({
    roomId,
    ...activity,
    timestamp: new Date(),
  });
}

app.get("/api/document/:roomId", async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const doc = await getOrCreateDocument(roomId);
    const snapshots = await Snapshot.find({ roomId }).sort({ timestamp: 1 });
    const activityLogs = await ActivityLog.find({ roomId }).sort({ timestamp: 1 });
    
    res.json({
      ...doc.toObject(),
      snapshots,
      activityLogs
    });
  } catch (error) {
    console.error("Fetch document error:", error);
    res.status(500).json({ error: "Failed to fetch document" });
  }
});

app.post("/api/document/:roomId/snapshot", async (req, res) => {
  try {
    const { content, savedBy, savedByColor, mode } = req.body;
    const roomId = req.params.roomId;

    const doc = await getOrCreateDocument(roomId);
    const finalContent = typeof content === "string" ? content : "";

    const latestSnapshot = await Snapshot.findOne({ roomId }).sort({ timestamp: -1 });
    if (latestSnapshot && latestSnapshot.content === finalContent) {
      return res.json({ success: true, message: "No change" });
    }

    doc.content = finalContent;
    doc.updatedAt = new Date();
    await doc.save();

    await Snapshot.create({
      roomId,
      content: finalContent,
      savedBy: savedBy || "Unknown User",
      savedByColor: savedByColor || "#4F46E5",
      timestamp: new Date(),
    });

    await ActivityLog.create({
      roomId,
      type: "snapshot",
      message:
        mode === "auto"
          ? `${savedBy || "Unknown User"} triggered auto snapshot`
          : `${savedBy || "Unknown User"} saved a snapshot`,
      userName: savedBy || "Unknown User",
      userColor: savedByColor || "#4F46E5",
      timestamp: new Date(),
    });

    const snapshots = await Snapshot.find({ roomId }).sort({ timestamp: 1 });
    const activityLogs = await ActivityLog.find({ roomId }).sort({ timestamp: 1 });

    io.to(roomId).emit("document-updated", {
      content: doc.content,
    });

    io.to(roomId).emit("snapshots-updated", snapshots);
    io.to(roomId).emit("activity-updated", activityLogs);

    res.json(doc);
  } catch (error) {
    console.error("Save snapshot error:", error);
    res.status(500).json({ error: "Failed to save snapshot" });
  }
});

app.post("/api/document/:roomId/restore/:snapshotId", async (req, res) => {
  try {
    const { restoredBy, restoredByColor } = req.body;
    const { roomId, snapshotId } = req.params;

    console.log("Restore request:", { roomId, snapshotId, restoredBy });

    const doc = await Document.findOne({ roomId });
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    const snapshot = await Snapshot.findOne({ _id: snapshotId, roomId });

    if (!snapshot) {
      return res.status(404).json({ error: "Snapshot not found" });
    }

    doc.content = snapshot.content || "";
    doc.updatedAt = new Date();
    await doc.save();

    await ActivityLog.create({
      roomId,
      type: "restore",
      message: `${restoredBy || "Unknown User"} restored a snapshot`,
      userName: restoredBy || "Unknown User",
      userColor: restoredByColor || "#4F46E5",
      timestamp: new Date(),
    });

    const snapshots = await Snapshot.find({ roomId }).sort({ timestamp: 1 });
    const activityLogs = await ActivityLog.find({ roomId }).sort({ timestamp: 1 });

    io.to(roomId).emit("document-updated", {
      content: doc.content,
    });

    io.to(roomId).emit("activity-updated", activityLogs);
    io.to(roomId).emit("snapshots-updated", snapshots);

    res.json({
      success: true,
      content: doc.content,
      snapshots: snapshots,
      activityLogs: activityLogs,
    });
  } catch (error) {
    console.error("Restore error full:", error);
    res.status(500).json({
      error: "Failed to restore snapshot",
      details: error.message,
    });
  }
});

app.post("/api/document/:roomId/reset", async (req, res) => {
  try {
    const { resetBy, resetByColor } = req.body;
    const { roomId } = req.params;

    let doc = await getOrCreateDocument(roomId);

    doc.content = getDefaultContent();
    doc.updatedAt = new Date();
    await doc.save();

    await Snapshot.deleteMany({ roomId });
    await ActivityLog.deleteMany({ roomId });

    await ActivityLog.create({
      roomId,
      type: "system",
      message: `${resetBy || "Unknown User"} reset the document`,
      userName: resetBy || "Unknown User",
      userColor: resetByColor || "#4F46E5",
      timestamp: new Date(),
    });

    const snapshots = await Snapshot.find({ roomId }).sort({ timestamp: 1 });
    const activityLogs = await ActivityLog.find({ roomId }).sort({ timestamp: 1 });

    io.to(roomId).emit("document-updated", {
      content: doc.content,
    });

    io.to(roomId).emit("snapshots-updated", snapshots);
    io.to(roomId).emit("activity-updated", activityLogs);

    res.json({
      success: true,
      content: doc.content,
      snapshots: snapshots,
      activityLogs: activityLogs,
    });
  } catch (error) {
    console.error("Reset error:", error);
    res.status(500).json({ error: "Failed to reset document" });
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", async ({ roomId, userName, color }) => {
    try {
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.userName = userName;
      socket.data.color = color;

      if (!activeUsersByRoom[roomId]) {
        activeUsersByRoom[roomId] = [];
      }

      const alreadyExists = activeUsersByRoom[roomId].find(
        (u) => u.socketId === socket.id
      );

      if (!alreadyExists) {
        activeUsersByRoom[roomId].push({
          socketId: socket.id,
          userName,
          color,
        });
      }

      await getOrCreateDocument(roomId);

      await addActivity(roomId, {
        type: "join",
        message: `${userName} joined the document`,
        userName,
        userColor: color || "#4F46E5",
      });

      const refreshedDoc = await Document.findOne({ roomId });
      const snapshots = await Snapshot.find({ roomId }).sort({ timestamp: 1 });
      const activityLogs = await ActivityLog.find({ roomId }).sort({ timestamp: 1 });

      socket.emit("initial-document", {
        content: refreshedDoc.content,
        snapshots: snapshots,
        activityLogs: activityLogs,
        activeUsers: activeUsersByRoom[roomId],
      });

      io.to(roomId).emit("users-updated", activeUsersByRoom[roomId]);
      io.to(roomId).emit("activity-updated", activityLogs);
    } catch (error) {
      console.error("Join room error:", error);
    }
  });

  socket.on("send-changes", async ({ roomId, content, userName }) => {
    try {
      socket.to(roomId).emit("receive-changes", {
        content,
        userName,
      });

      await Document.findOneAndUpdate(
        { roomId },
        {
          $set: {
            content,
            updatedAt: new Date(),
          },
        }
      );
    } catch (error) {
      console.error("Send changes error:", error);
    }
  });

  socket.on("log-edit", async ({ roomId, userName, userColor }) => {
    try {
      await addActivity(roomId, {
        type: "edit",
        message: `${userName} edited the document`,
        userName,
        userColor: userColor || "#4F46E5",
      });

      const activityLogs = await ActivityLog.find({ roomId }).sort({ timestamp: 1 });
      io.to(roomId).emit("activity-updated", activityLogs);
    } catch (error) {
      console.error("Log edit error:", error);
    }
  });

  socket.on("cursor-move", ({ roomId, userId, cursor }) => {
    socket.to(roomId).emit("cursor-update", {
      userId,
      cursor,
    });
  });

  socket.on("disconnect", async () => {
    try {
      const { roomId, userName, color } = socket.data || {};

      if (roomId && activeUsersByRoom[roomId]) {
        activeUsersByRoom[roomId] = activeUsersByRoom[roomId].filter(
          (u) => u.socketId !== socket.id
        );

        io.to(roomId).emit("users-updated", activeUsersByRoom[roomId]);

        if (userName) {
          await addActivity(roomId, {
            type: "leave",
            message: `${userName} left the document`,
            userName,
            userColor: color || "#64748b",
          });

          const activityLogs = await ActivityLog.find({ roomId }).sort({ timestamp: 1 });
          io.to(roomId).emit("activity-updated", activityLogs);
        }
        
        io.to(roomId).emit("user-left", socket.id);
      }

      console.log("User disconnected:", socket.id);
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  });
});

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});