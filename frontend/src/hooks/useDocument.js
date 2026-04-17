import { useState, useEffect, useRef } from "react";

export const useDocument = (socket, roomId, userName, userColor) => {
  const [documentMeta, setDocumentMeta] = useState({ title: 'Untitled Document', isPublic: false, ownerId: null, type: 'text' });
  const [content, setContent] = useState("");
  const [activeUsers, setActiveUsers] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [lastEditedBy, setLastEditedBy] = useState("");
  const [remoteCursors, setRemoteCursors] = useState({});
  const baseVersionRef = useRef(1);
  const isLocalDirtyRef = useRef(false);

  const editTimeoutRef = useRef(null);
  const logTimeoutRef = useRef(null);
  const lastSnapshotContentRef = useRef('');
  const cursorThrottleRef = useRef(null);
  useEffect(() => {
    if (!socket) return;

    const handleInitialDocument = (data) => {
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
        
      setDocumentMeta({
        title: data.title || 'Untitled Document',
        isPublic: data.isPublic,
        ownerId: data.ownerId,
        type: data.type || 'text',
      });
      baseVersionRef.current = data.version || 1;
    };

    const handleVersionUpdated = (newVersion) => {
      baseVersionRef.current = newVersion;
    };

    const handleUsersUpdated = (users) => {
      setActiveUsers(users || []);
    };

    const handleSnapshotsUpdated = (newSnapshots) => {
      setSnapshots(newSnapshots || []);
      if (newSnapshots && newSnapshots.length > 0) {
        lastSnapshotContentRef.current =
          newSnapshots[newSnapshots.length - 1].content || "";
      }
    };

    const handleActivityUpdated = (logs) => {
      setActivityLogs(logs || []);
    };

    const handleDocumentUpdated = (data) => {
      if (!data || data.content === undefined) return;
      setContent(data.content || '');
      setLastEditedBy(''); // clear banner on restore
    };

    const handleCursorUpdate = ({ userId, cursor }) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [userId]: cursor,
      }));
    };

    const handleUserLeft = (userId) => {
      setRemoteCursors((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
    };

    const handleDocumentMetaUpdated = (data) => {
      setDocumentMeta((prev) => ({
        ...prev,
        ...data
      }));
    };

    socket.on("initial-document", handleInitialDocument);
    socket.on("users-updated", handleUsersUpdated);
    socket.on("snapshots-updated", handleSnapshotsUpdated);
    socket.on("activity-updated", handleActivityUpdated);
    socket.on("document-updated", handleDocumentUpdated);
    socket.on("document-meta-updated", handleDocumentMetaUpdated);
    socket.on("cursor-update", handleCursorUpdate);
    socket.on("user-left", handleUserLeft);
    socket.on("document-version-updated", handleVersionUpdated);

    return () => {
      socket.off("initial-document", handleInitialDocument);
      socket.off("users-updated", handleUsersUpdated);
      socket.off("snapshots-updated", handleSnapshotsUpdated);
      socket.off("activity-updated", handleActivityUpdated);
      socket.off("document-updated", handleDocumentUpdated);
      socket.off("document-meta-updated", handleDocumentMetaUpdated);
      socket.off("cursor-update", handleCursorUpdate);
      socket.off("user-left", handleUserLeft);
      socket.off("document-version-updated", handleVersionUpdated);
      
      if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current);
      if (logTimeoutRef.current) clearTimeout(logTimeoutRef.current);
      if (cursorThrottleRef.current) clearTimeout(cursorThrottleRef.current);
    };
  }, [socket]);

  const updateContent = (newContent) => {
    setContent(newContent);
    setLastEditedBy(userName);
    isLocalDirtyRef.current = true;

    if (socket) {
      if (logTimeoutRef.current) clearTimeout(logTimeoutRef.current);
      logTimeoutRef.current = setTimeout(() => {
        socket.emit('log-edit', { roomId, userName, userColor });
      }, 1200);
    }

    if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current);
    editTimeoutRef.current = setTimeout(() => setLastEditedBy(''), 1800);
  };

  const sendCursorMove = (position) => {
    if (!socket) return;
    
    // Throttle cursor emit to 50ms to prevent jitter
    if (cursorThrottleRef.current) return;
    
    cursorThrottleRef.current = setTimeout(() => {
      socket.emit("cursor-move", {
        roomId,
        userId: socket.id,
        cursor: {
          index: position,
          userName,
          userColor,
        },
      });
      cursorThrottleRef.current = null;
    }, 50);
  };

  return {
    documentMeta,
    content,
    snapshots,
    activityLogs,
    activeUsers,
    lastEditedBy,
    remoteCursors,
    updateContent,
    sendCursorMove,
    lastSnapshotContentRef,
    baseVersionRef,
    isLocalDirtyRef,
    setSnapshots,
    setActivityLogs,
    setContent
  };
};
