import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import JoinScreen from "./components/JoinScreen";
import Header from "./components/Header";
import EditorPanel from "./components/EditorPanel";
import Sidebar from "./components/Sidebar";
import DiffViewer from "./components/DiffViewer";
import ReplayViewer from "./components/ReplayViewer";

const SOCKET_URL = "http://localhost:5000";
const socket = io(SOCKET_URL, { autoConnect: false });

function App() {
  const [joined, setJoined] = useState(false);
  const [userName, setUserName] = useState("");
  const [userColor, setUserColor] = useState("");

  // Fresh room so old Mongo data does not interfere
  const [roomId] = useState("docu-sync-fresh-room-1");

  const API_URL = `http://localhost:5000/api/document/${roomId}`;

  const [content, setContent] = useState("");
  const [activeUsers, setActiveUsers] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [lastEditedBy, setLastEditedBy] = useState("");
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [restoringSnapshotId, setRestoringSnapshotId] = useState("");
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const [autoSaveMessage, setAutoSaveMessage] = useState("Auto Snapshot On");

  const editTimeoutRef = useRef(null);
  const logTimeoutRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const autoSaveMessageTimerRef = useRef(null);
  const lastSnapshotContentRef = useRef("");

  const currentUser = useMemo(
    () => ({ userName, color: userColor }),
    [userName, userColor]
  );

  useEffect(() => {
    if (!joined) return;

    socket.connect();

    socket.emit("join-room", {
      roomId,
      userName,
      color: userColor,
    });

    socket.on("initial-document", (data) => {
      setContent(data.content || "");
      setSnapshots(data.snapshots || []);
      setActivityLogs(data.activityLogs || []);
      setActiveUsers(data.activeUsers || []);

      const latestSnapshot =
        data.snapshots && data.snapshots.length > 0
          ? data.snapshots[data.snapshots.length - 1]
          : null;

      lastSnapshotContentRef.current = latestSnapshot
        ? latestSnapshot.content
        : data.content || "";
    });

    socket.on("receive-changes", (data) => {
      setContent(data.content || "");
      setLastEditedBy(data.userName || "");
    });

    socket.on("users-updated", (users) => {
      setActiveUsers(users || []);
    });

    socket.on("snapshots-updated", (newSnapshots) => {
      setSnapshots(newSnapshots || []);
      if (newSnapshots && newSnapshots.length > 0) {
        lastSnapshotContentRef.current =
          newSnapshots[newSnapshots.length - 1].content || "";
      }
    });

    socket.on("activity-updated", (logs) => {
      setActivityLogs(logs || []);
    });

    socket.on("document-updated", (data) => {
      setContent(data.content || "");
    });

    return () => {
      socket.off("initial-document");
      socket.off("receive-changes");
      socket.off("users-updated");
      socket.off("snapshots-updated");
      socket.off("activity-updated");
      socket.off("document-updated");
      socket.disconnect();

      if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current);
      if (logTimeoutRef.current) clearTimeout(logTimeoutRef.current);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (autoSaveMessageTimerRef.current) {
        clearTimeout(autoSaveMessageTimerRef.current);
      }
    };
  }, [joined, roomId, userName, userColor]);

  const handleJoin = ({ name, color }) => {
    setUserName(name);
    setUserColor(color);
    setJoined(true);
  };

  const saveSnapshot = async (contentToSave, mode = "manual") => {
    const isAuto = mode === "auto";

    if (!contentToSave.trim()) return;
    if (contentToSave === lastSnapshotContentRef.current) return;

    try {
      if (!isAuto) setSavingSnapshot(true);

      const res = await fetch(`${API_URL}/snapshot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: contentToSave,
          savedBy: userName,
          savedByColor: userColor,
          mode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save snapshot");
      }

      lastSnapshotContentRef.current = contentToSave;

      if (isAuto) {
        setAutoSaveMessage("Auto Snapshot Saved");
        if (autoSaveMessageTimerRef.current) {
          clearTimeout(autoSaveMessageTimerRef.current);
        }
        autoSaveMessageTimerRef.current = setTimeout(() => {
          setAutoSaveMessage("Auto Snapshot On");
        }, 1800);
      }
    } catch (error) {
      if (!isAuto) {
        alert(error.message || "Snapshot save failed");
      }
    } finally {
      if (!isAuto) setSavingSnapshot(false);
    }
  };

  const handleEditorChange = (value) => {
    setContent(value);
    setLastEditedBy(userName);

    socket.emit("send-changes", {
      roomId,
      content: value,
      userName,
    });

    if (logTimeoutRef.current) clearTimeout(logTimeoutRef.current);
    logTimeoutRef.current = setTimeout(() => {
      socket.emit("log-edit", {
        roomId,
        userName,
        userColor,
      });
    }, 1200);

    if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current);
    editTimeoutRef.current = setTimeout(() => {
      setLastEditedBy("");
    }, 1800);

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveSnapshot(value, "auto");
    }, 6000);
  };

  const handleManualSnapshot = async () => {
    await saveSnapshot(content, "manual");
  };

  const handleRestoreSnapshot = async (snapshotId) => {
    try {
      setRestoringSnapshotId(snapshotId);

      const res = await fetch(`${API_URL}/restore/${snapshotId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restoredBy: userName,
          restoredByColor: userColor,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || "Failed to restore snapshot");
      }

      setSelectedSnapshot(null);
    } catch (error) {
      alert(error.message || "Snapshot restore failed");
    } finally {
      setRestoringSnapshotId("");
    }
  };

  if (!joined) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return (
    <div className="app-shell">
      <Header
        activeUsers={activeUsers}
        currentUser={currentUser}
        onSaveSnapshot={handleManualSnapshot}
        savingSnapshot={savingSnapshot}
        autoSaveMessage={autoSaveMessage}
      />

      <div className="main-layout">
        <EditorPanel
          content={content}
          onChange={handleEditorChange}
          lastEditedBy={lastEditedBy}
        />

        <Sidebar
          snapshots={snapshots}
          activityLogs={activityLogs}
          onRestoreSnapshot={handleRestoreSnapshot}
          restoringSnapshotId={restoringSnapshotId}
          setSelectedSnapshot={setSelectedSnapshot}
          selectedSnapshot={selectedSnapshot}
          onOpenReplay={() => setReplayOpen(true)}
        />
      </div>

      {selectedSnapshot && (
        <DiffViewer
          oldText={selectedSnapshot.content}
          newText={content}
          snapshotUserName={selectedSnapshot.savedBy}
          snapshotUserColor={selectedSnapshot.savedByColor}
          currentUserName={currentUser.userName}
          currentUserColor={currentUser.color}
          onClose={() => setSelectedSnapshot(null)}
        />
      )}

      {replayOpen && (
        <ReplayViewer
          snapshots={snapshots}
          onClose={() => setReplayOpen(false)}
        />
      )}
    </div>
  );
}

export default App;