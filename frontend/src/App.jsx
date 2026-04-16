import { useMemo, useState } from "react";
import JoinScreen from "./components/JoinScreen";
import Header from "./components/Header";
import EditorPanel from "./components/EditorPanel";
import Sidebar from "./components/Sidebar";
import DiffViewer from "./components/DiffViewer";
import ReplayViewer from "./components/ReplayViewer";

import { useSocket } from "./hooks/useSocket";
import { useDocument } from "./hooks/useDocument";
import { useAutosave } from "./hooks/useAutosave";

const SOCKET_URL = "http://localhost:5001";

function App() {
  const [joined, setJoined] = useState(false);
  const [userName, setUserName] = useState("");
  const [userColor, setUserColor] = useState("");

  const [roomId] = useState("docu-sync-fresh-room-1");
  const API_URL = `http://localhost:5001/api/document/${roomId}`;

  const currentUser = useMemo(() => ({ userName, color: userColor }), [userName, userColor]);

  const socket = useSocket(SOCKET_URL, joined, roomId, userName, userColor);

  const {
    content,
    snapshots,
    activityLogs,
    activeUsers,
    lastEditedBy,
    remoteCursors,
    updateContent,
    sendCursorMove,
    lastSnapshotContentRef,
  } = useDocument(socket, roomId, userName, userColor);

  const { saveSnapshot, savingSnapshot, autoSaveMessage } = useAutosave(
    "http://localhost:5001/api/document/" + roomId,
    content,
    roomId,
    userName,
    userColor,
    lastSnapshotContentRef
  );

  const [restoringSnapshotId, setRestoringSnapshotId] = useState("");
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [replayOpen, setReplayOpen] = useState(false);

  const handleJoin = ({ name, color }) => {
    setUserName(name);
    setUserColor(color);
    setJoined(true);
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
          onChange={updateContent}
          lastEditedBy={lastEditedBy}
          remoteCursors={remoteCursors}
          sendCursorMove={sendCursorMove}
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