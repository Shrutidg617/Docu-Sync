const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const Document = require("./models/Document");

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const activeUsersByRoom = {};

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });

function getDefaultContent() {
  return "Welcome to DocuSync.\n\nStart editing collaboratively here.\n\nYou can save snapshots and restore them anytime.";
}

async function getOrCreateDocument(roomId) {
  let doc = await Document.findOne({ roomId });

  if (!doc) {
    doc = await Document.create({
      roomId,
      content: getDefaultContent(),
      snapshots: [],
      activityLogs: [
        {
          type: "system",
          message: "Document created",
          userName: "System",
          userColor: "#64748b",
          timestamp: new Date(),
        },
      ],
      updatedAt: new Date(),
    });
  }

  return doc;
}

async function addActivity(roomId, activity) {
  return Document.findOneAndUpdate(
    { roomId },
    {
      $push: {
        activityLogs: {
          ...activity,
          timestamp: new Date(),
        },
      },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  );
}

app.get("/api/document/:roomId", async (req, res) => {
  try {
    const doc = await getOrCreateDocument(req.params.roomId);
    res.json(doc);
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

    const latestSnapshot = doc.snapshots[doc.snapshots.length - 1];
    if (latestSnapshot && latestSnapshot.content === finalContent) {
      return res.json(doc);
    }

    doc.content = finalContent;

    doc.snapshots.push({
      content: finalContent,
      savedBy: savedBy || "Unknown User",
      savedByColor: savedByColor || "#4F46E5",
      timestamp: new Date(),
    });

    doc.activityLogs.push({
      type: "snapshot",
      message:
        mode === "auto"
          ? `${savedBy || "Unknown User"} triggered auto snapshot`
          : `${savedBy || "Unknown User"} saved a snapshot`,
      userName: savedBy || "Unknown User",
      userColor: savedByColor || "#4F46E5",
      timestamp: new Date(),
    });

    doc.updatedAt = new Date();
    await doc.save();

    io.to(roomId).emit("document-updated", {
      content: doc.content,
    });

    io.to(roomId).emit("snapshots-updated", doc.snapshots);
    io.to(roomId).emit("activity-updated", doc.activityLogs);

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

    const snapshots = Array.isArray(doc.snapshots) ? doc.snapshots : [];

    const snapshot = snapshots.find((snap) => {
      if (!snap || !snap._id) return false;
      return String(snap._id) === String(snapshotId);
    });

    if (!snapshot) {
      console.log(
        "Snapshot not found. Available snapshot ids:",
        snapshots.map((s) => (s && s._id ? String(s._id) : "missing-id"))
      );
      return res.status(404).json({ error: "Snapshot not found" });
    }

    doc.content = snapshot.content || "";

    doc.activityLogs.push({
      type: "restore",
      message: `${restoredBy || "Unknown User"} restored a snapshot`,
      userName: restoredBy || "Unknown User",
      userColor: restoredByColor || "#4F46E5",
      timestamp: new Date(),
    });

    doc.updatedAt = new Date();
    await doc.save();

    io.to(roomId).emit("document-updated", {
      content: doc.content,
    });

    io.to(roomId).emit("activity-updated", doc.activityLogs);
    io.to(roomId).emit("snapshots-updated", doc.snapshots);

    res.json({
      success: true,
      content: doc.content,
      snapshots: doc.snapshots,
      activityLogs: doc.activityLogs,
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
    doc.snapshots = [];
    doc.activityLogs = [
      {
        type: "system",
        message: `${resetBy || "Unknown User"} reset the document`,
        userName: resetBy || "Unknown User",
        userColor: resetByColor || "#4F46E5",
        timestamp: new Date(),
      },
    ];
    doc.updatedAt = new Date();

    await doc.save();

    io.to(roomId).emit("document-updated", {
      content: doc.content,
    });

    io.to(roomId).emit("snapshots-updated", doc.snapshots);
    io.to(roomId).emit("activity-updated", doc.activityLogs);

    res.json({
      success: true,
      content: doc.content,
      snapshots: doc.snapshots,
      activityLogs: doc.activityLogs,
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

      socket.emit("initial-document", {
        content: refreshedDoc.content,
        snapshots: refreshedDoc.snapshots,
        activityLogs: refreshedDoc.activityLogs,
        activeUsers: activeUsersByRoom[roomId],
      });

      io.to(roomId).emit("users-updated", activeUsersByRoom[roomId]);
      io.to(roomId).emit("activity-updated", refreshedDoc.activityLogs);
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
      const doc = await addActivity(roomId, {
        type: "edit",
        message: `${userName} edited the document`,
        userName,
        userColor: userColor || "#4F46E5",
      });

      io.to(roomId).emit("activity-updated", doc.activityLogs);
    } catch (error) {
      console.error("Log edit error:", error);
    }
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
          const doc = await addActivity(roomId, {
            type: "leave",
            message: `${userName} left the document`,
            userName,
            userColor: color || "#64748b",
          });

          io.to(roomId).emit("activity-updated", doc.activityLogs);
        }
      }

      console.log("User disconnected:", socket.id);
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});