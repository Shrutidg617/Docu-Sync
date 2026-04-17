const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const WebSocket = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils");
const Document = require("./models/Document");
const Snapshot = require("./models/Snapshot");
const ActivityLog = require("./models/ActivityLog");

dotenv.config();

const { initAzure, saveContent, loadContent } = require("./utils/storageService");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const authRoutes = require("./routes/auth");
const docsRoutes = require("./routes/docs");
const authMiddleware = require("./middleware/auth");

app.use("/api/auth", authRoutes);
app.use("/api/docs", (req, res, next) => {
  req.io = io;
  next();
}, docsRoutes);

const jwt = require("jsonwebtoken");

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const activeUsersByRoom = {};
const roomState = new Map();
// Structure: { content: Delta/String, version: Number, dirty: Boolean, users: Set, accessCache: Set, lastActive: Date, cleanupTimer: Timeout|null }

function scheduleRoomCleanup(roomId, state) {
  if (!state) return;
  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
  }

  const cleanupTimer = setTimeout(() => {
    const currentState = roomState.get(roomId);
    if (!currentState) return;

    // Re-check emptiness at execution time to avoid deleting active rooms.
    if (currentState.users.size === 0 && currentState.cleanupTimer === cleanupTimer) {
      roomState.delete(roomId);
    }
  }, 10 * 60 * 1000);

  state.cleanupTimer = cleanupTimer;
}

// Master Flush Interval (5s)
setInterval(async () => {
  for (const [roomId, state] of roomState.entries()) {
    if (!state.dirty) continue;
    state.dirty = false;
    try {
      const storageResult = await saveContent(roomId, state.content, false);
      await Document.updateOne(
        { roomId },
        { 
          $set: { 
            content: storageResult.data,
            storageType: storageResult.storageType,
            blobUrl: storageResult.blobUrl,
            contentSize: storageResult.contentSize,
            updatedAt: new Date()
          } 
        }
      );
    } catch (err) {
      state.dirty = true;
      console.error(`Flush failed for room ${roomId}:`, err);
    }
  }
}, 5000);

const { MongoMemoryServer } = require("mongodb-memory-server");

async function connectToDatabase(retries = 5) {
  let mongoUri = process.env.MONGO_URI;

  if (!mongoUri || mongoUri.trim() === "") {
    if (process.env.NODE_ENV === "production") {
      console.error("CRITICAL: MONGO_URI is missing in production environment!");
      console.error("Deployment will fail to prevent data loss or volatile storage usage.");
      process.exit(1);
    }
    console.log("No MONGO_URI provided. Starting a localized in-memory MongoDB server...");
    const mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
    console.log(`In-memory database successfully started at: ${mongoUri}`);
  }

  while (retries > 0) {
    try {
      await mongoose.connect(mongoUri);
      console.log("MongoDB securely connected!");
      
      // Initialize Azure Storage after DB
      await initAzure();
      return;
    } catch (err) {
      retries -= 1;
      console.error(`MongoDB connection error (Attempts left: ${retries}):`, err.message);
      if (retries === 0) {
        console.error("CRITICAL: Could not connect to MongoDB. Exiting...");
        process.exit(1);
      }
      // Wait 2 seconds before retry
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

connectToDatabase();

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    storage: "azure-ready",
    timestamp: new Date()
  });
});

function getDefaultContent() {
  return "Welcome to DocuSync.\n\nStart editing collaboratively here.\n\nYou can save snapshots and restore them anytime.";
}

async function getDocWithAccess(roomId, userId) {
  let doc = await Document.findOne({ roomId });
  
  if (!doc) throw new Error("NOT_FOUND");

  if (doc.isPublic) return doc;
  
  if (!userId) throw new Error("FORBIDDEN");

  const isOwner = doc.ownerId.toString() === userId.toString();
  const isCollab = doc.collaborators.some(id => id.toString() === userId.toString());

  if (!isOwner && !isCollab) {
    throw new Error("FORBIDDEN");
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

app.get("/api/document/:roomId", authMiddleware, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const doc = await getDocWithAccess(roomId, req.user.userId);
    const snapshots = await Snapshot.find({ roomId }).sort({ timestamp: 1 });
    const activityLogs = await ActivityLog.find({ roomId }).sort({ timestamp: 1 });
    
    // Load full content (transparently handles Blob if needed)
    const fullContent = await loadContent(doc);

    res.json({
      ...doc.toObject(),
      content: fullContent,
      snapshots,
      activityLogs
    });
  } catch (error) {
    if (error.message === "NOT_FOUND") return res.status(404).json({ error: "Document not found" });
    if (error.message === "FORBIDDEN") return res.status(403).json({ error: "Access denied" });
    console.error("Fetch document error:", error);
    res.status(500).json({ error: "Failed to fetch document" });
  }
});

app.post("/api/document/:roomId/snapshot", authMiddleware, async (req, res) => {
  try {
    const { content, savedBy, savedByColor, mode, tag, baseVersion, force } = req.body;
    const roomId = req.params.roomId;

    const doc = await getDocWithAccess(roomId, req.user.userId);
    const finalContent = typeof content === "string" ? content : "";

    // OCC Guard check and Atomic Update
    const updatedDoc = await Document.findOneAndUpdate(
      { _id: doc._id, version: force ? doc.version : baseVersion },
      {
        $inc: { version: 1 },
        $set: { content: finalContent, updatedAt: new Date() }
      },
      { new: true }
    );

    if (!updatedDoc) {
      return res.status(409).json({
        conflict: true,
        serverVersion: doc.version + 1,
        serverContent: await loadContent(doc),
        message: "Race condition conflict detected. Another user just saved. Please merge manually."
      });
    }

    // Phase 2 Fix: Sync the OCC version back into the fast memory engine to prevent 409 loops
    const activeState = roomState.get(roomId);
    if (activeState) {
      activeState.version = updatedDoc.version;
    }

    // Now push to hybrid storage properly using the validated new document
    const storageResultDoc = await saveContent(roomId, finalContent, false);
    
    updatedDoc.content = storageResultDoc.data;
    updatedDoc.storageType = storageResultDoc.storageType;
    updatedDoc.blobUrl = storageResultDoc.blobUrl;
    updatedDoc.contentSize = storageResultDoc.contentSize;
    await updatedDoc.save();

    const latestSnapshot = await Snapshot.findOne({ roomId }).sort({ timestamp: -1 });

    let aiSummary = "";
    if (latestSnapshot && process.env.GROQ_API_KEY && finalContent !== latestSnapshot.content) {
      try {
        const { diffWords } = require('diff');
        const Groq = require("groq-sdk");
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        
        const changes = diffWords(latestSnapshot.content, finalContent);
        let additions = [];
        let deletions = [];
        changes.forEach(p => {
          if(p.added) additions.push(p.value.trim());
          if(p.removed) deletions.push(p.value.trim());
        });

        const addedSnippet = additions.join(' ').substring(0, 500);
        const deletedSnippet = deletions.join(' ').substring(0, 500);
        
        const promptInfo = `Additions: ${addedSnippet.length ? addedSnippet : "None"}\nDeletions: ${deletedSnippet.length ? deletedSnippet : "None"}`;

        const completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "You are a concise document summarizer. Give a 5 to 10 word summary of what changed based on Additions and Deletions. E.g. 'Added paragraph about pricing and fixed typos.' Keep it strictly one short sentence. No quotes." },
            { role: "user", content: promptInfo }
          ],
          model: "llama3-8b-8192",
          max_tokens: 40
        });

        aiSummary = completion.choices[0]?.message?.content || "Updated document.";
      } catch (err) {
        console.error("Groq AI Error:", err.message);
        aiSummary = "Summary unavailable.";
      }
    } else if (!latestSnapshot) {
      aiSummary = "Initial snapshot.";
    }

    // Use Storage Service for hybrid logic
    const storageResultSnap = await saveContent(roomId, finalContent, true, Date.now());

    await Snapshot.create({
      roomId,
      content: storageResultSnap.data,
      storageType: storageResultSnap.storageType,
      blobUrl: storageResultSnap.blobUrl,
      contentSize: storageResultSnap.contentSize,
      version: updatedDoc.version,
      parentVersion: baseVersion || updatedDoc.version - 1 || 1,
      savedBy: savedBy || "Unknown User",
      savedByColor: savedByColor || "#4F46E5",
      timestamp: new Date(),
      aiSummary: aiSummary || (tag ? "Tagged version." : "Auto saved."),
      tag: tag || ""
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
    io.to(roomId).emit("document-version-updated", doc.version);

    res.json({ ...doc.toObject(), newVersion: doc.version });
  } catch (error) {
    if (error.message === "NOT_FOUND") return res.status(404).json({ error: "Document not found" });
    if (error.message === "FORBIDDEN") return res.status(403).json({ error: "Access denied" });
    console.error("Save snapshot error:", error);
    res.status(500).json({ error: "Failed to save snapshot" });
  }
});

app.post("/api/document/:roomId/restore/:snapshotId", authMiddleware, async (req, res) => {
  try {
    const { restoredBy, restoredByColor } = req.body;
    const { roomId, snapshotId } = req.params;

    console.log("Restore request:", { roomId, snapshotId, restoredBy });

    const doc = await getDocWithAccess(roomId, req.user.userId);
    
    const snapshot = await Snapshot.findOne({ _id: snapshotId, roomId });

    if (!snapshot) {
      return res.status(404).json({ error: "Snapshot not found" });
    }

    const restoredContent = await loadContent(snapshot, true);
    const storageResult = await saveContent(roomId, restoredContent);

    doc.content = storageResult.data;
    doc.storageType = storageResult.storageType;
    doc.blobUrl = storageResult.blobUrl;
    doc.contentSize = storageResult.contentSize;
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
    if (error.message === "NOT_FOUND") return res.status(404).json({ error: "Document not found" });
    if (error.message === "FORBIDDEN") return res.status(403).json({ error: "Access denied" });
    console.error("Restore error full:", error);
    res.status(500).json({
      error: "Failed to restore snapshot",
      details: error.message,
    });
  }
});

app.post("/api/document/:roomId/reset", authMiddleware, async (req, res) => {
  try {
    const { resetBy, resetByColor } = req.body;
    const { roomId } = req.params;

    let doc = await getDocWithAccess(roomId, req.user.userId);

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
    if (error.message === "NOT_FOUND") return res.status(404).json({ error: "Document not found" });
    if (error.message === "FORBIDDEN") return res.status(403).json({ error: "Access denied" });
    console.error("Reset error:", error);
    res.status(500).json({ error: "Failed to reset document" });
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  const electCoordinator = (roomId) => {
    const users = activeUsersByRoom[roomId];
    if (users && users.length > 0) {
      io.to(roomId).emit("coordinator-assigned", users[0].socketId);
    }
  };

  socket.on("join-room", async ({ roomId, userName, color, token }) => {
    try {
      let verifiedUserId = null;
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_for_dev_mode");
          verifiedUserId = decoded.userId;
        } catch (e) {
          console.error("Socket token verification failed");
        }
      }

      // Check access strictly. Use Cache if available
      if (!roomState.has(roomId)) {
        const d = await getDocWithAccess(roomId, verifiedUserId);
        const coldContent = await loadContent(d);
        roomState.set(roomId, {
          content: coldContent,
          dirty: false,
          version: d.version,
          users: new Set(),
          accessCache: new Set([verifiedUserId]),
          lastActive: Date.now(),
          cleanupTimer: null
        });
      } else {
        const state = roomState.get(roomId);
        if (state.cleanupTimer) {
          clearTimeout(state.cleanupTimer);
          state.cleanupTimer = null;
        }
        if (state.accessCache.has(verifiedUserId)) {
        } else {
          await getDocWithAccess(roomId, verifiedUserId);
          state.accessCache.add(verifiedUserId);
        }
      }

      const rState = roomState.get(roomId);
      rState.users.add(socket.id);
      rState.lastActive = Date.now();

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

      await addActivity(roomId, {
        type: "join",
        message: `${userName} joined the document`,
        userName,
        userColor: color || "#4F46E5",
      });

      const refreshedDoc = await Document.findOne({ roomId });
      const snapshots = await Snapshot.find({ roomId }).sort({ timestamp: 1 });
      const activityLogs = await ActivityLog.find({ roomId }).sort({ timestamp: 1 });

      const fullContent = await loadContent(refreshedDoc);

      socket.emit("initial-document", {
        title: refreshedDoc.title,
        isPublic: refreshedDoc.isPublic,
        ownerId: refreshedDoc.ownerId ? refreshedDoc.ownerId.toString() : null,
        type: refreshedDoc.type,
        content: fullContent,
        snapshots: snapshots,
        activityLogs: activityLogs,
        activeUsers: activeUsersByRoom[roomId],
      });

      io.to(roomId).emit("users-updated", activeUsersByRoom[roomId]);
      electCoordinator(roomId);
      io.to(roomId).emit("activity-updated", activityLogs);
    } catch (error) {
      console.error("Join room error:", error.message);
      socket.emit("join-error", { error: "Access denied or document missing" });
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

      const state = roomState.get(roomId);
      if (state) {
        state.users.delete(socket.id);
        state.lastActive = Date.now();
        if (state.users.size === 0) {
          scheduleRoomCleanup(roomId, state);
        }
      }

      if (roomId && activeUsersByRoom[roomId]) {
        activeUsersByRoom[roomId] = activeUsersByRoom[roomId].filter(
          (u) => u.socketId !== socket.id
        );

        io.to(roomId).emit("users-updated", activeUsersByRoom[roomId]);
        electCoordinator(roomId);

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

// Yjs WebSockets Upgrade Handler
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  // Try to only handle paths starting with /yjs/
  if (request.url.startsWith('/yjs/')) {
    const parsedUrl = new URL(request.url, 'http://localhost');
    const token = parsedUrl.searchParams.get('token');

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_dev_mode');
    } catch (error) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // We rewrite the URL so y-websocket picks up the room name correctly
    // /yjs/room123 -> /room123
    request.url = parsedUrl.pathname.replace('/yjs', '') + parsedUrl.search;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', setupWSConnection);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});