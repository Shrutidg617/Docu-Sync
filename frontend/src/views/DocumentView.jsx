import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import EditorPanel from '../components/EditorPanel';
import Sidebar from '../components/Sidebar';
import DiffViewer from '../components/DiffViewer';
import ReplayViewer from '../components/ReplayViewer';
import AnalyticsModal from '../components/AnalyticsModal';
import ConflictModal from '../components/ConflictModal';
import { useSocket } from '../hooks/useSocket';
import { useDocument } from '../hooks/useDocument';
import { useAutosave } from '../hooks/useAutosave';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

function DocumentView() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const token    = localStorage.getItem('docu-sync-token');
  const userId   = localStorage.getItem('docu-sync-userId');
  const userName = localStorage.getItem('docu-sync-userName');
  const userColor = localStorage.getItem('docu-sync-userColor');

  useEffect(() => {
    if (!token) navigate('/login', { state: { from: `/doc/${roomId}` } });
  }, [token, navigate, roomId]);

  const currentUser = useMemo(() => ({ userName, color: userColor }), [userName, userColor]);
  const baseApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  const API_URL = `${baseApi}/api/document/${roomId}`;

  const socket = useSocket(SOCKET_URL, !!token, roomId, userName, userColor, userId, token);

  useEffect(() => {
    if (!socket) return;
    socket.on('join-error', (data) => {
      alert(data.error || 'Access Denied');
      navigate('/dashboard');
    });
    return () => socket.off('join-error');
  }, [socket, navigate]);

  const {
    documentMeta,
    pages,
    activePageId,
    setActivePageId,
    pageActivity,
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
    setPages
  } = useDocument(socket, roomId, userName, userColor, token);

  const fullContentStr = useMemo(() => JSON.stringify(pages), [pages]);
  const [conflictData, setConflictData] = useState(null);

  // Allow Header to optimistically update the title and visibility in meta without a full reload
  const [localTitle, setLocalTitle] = useState(null);
  const [localVisibility, setLocalVisibility] = useState(null);
  const effectiveMeta = {
    ...documentMeta,
    ...(localTitle != null ? { title: localTitle } : {}),
    ...(localVisibility != null ? { isPublic: localVisibility } : {}),
  };

  const handleConflict = useCallback((data) => {
    setConflictData(data);
  }, []);

  const { saveSnapshot, savingSnapshot, autoSaveMessage } = useAutosave(
    API_URL, fullContentStr, roomId, userName, userColor, lastSnapshotContentRef, token, baseVersionRef, handleConflict, isLocalDirtyRef, socket
  );

  const [restoringSnapshotId, setRestoringSnapshotId] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e) => {
      const newWidth = window.innerWidth - e.clientX - 32;
      if (newWidth >= 280 && newWidth <= 800) setSidebarWidth(newWidth);
    };
    const stopResizing = () => setIsResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing]);

  const handleManualSnapshot = async (tag = '') => {
    const result = await saveSnapshot(fullContentStr, 'manual', tag);
    if (result && result.conflict) {
      setConflictData(result.data);
    }
  };

  const handleRestoreSnapshot = async (snapshotId) => {
    try {
      setRestoringSnapshotId(snapshotId);
      const res = await fetch(`${API_URL}/restore/${snapshotId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restoredBy: userName, restoredByColor: userColor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore snapshot');
      setSelectedSnapshot(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setRestoringSnapshotId('');
    }
  };

  if (!token) return null;

  return (
    <main className="app-shell">
      <Helmet>
        <title>Docu-Sync | {effectiveMeta?.title || 'Document'}</title>
        <meta name="description" content={`Edit and collaborate on ${effectiveMeta?.title || 'this document'} in real-time with your team.`} />
      </Helmet>
      <Header
        activeUsers={activeUsers}
        currentUser={currentUser}
        onSaveSnapshot={handleManualSnapshot}
        savingSnapshot={savingSnapshot}
        autoSaveMessage={autoSaveMessage}
        roomId={roomId}
        documentMeta={effectiveMeta}
        onTitleChange={setLocalTitle}
        onVisibilityChange={setLocalVisibility}
        onOpenAnalytics={() => setAnalyticsOpen(true)}
      />

      <div className="main-layout">
        <div className="editor-wrapper">
          <EditorPanel
            pages={pages}
            activePageId={activePageId}
            onPageChange={setActivePageId}
            onAddPage={(newId) => setPages(prev => ({ ...prev, [newId]: "" }))}
            pageActivity={pageActivity}
            content={pages[activePageId] || ""}
            onChange={(newC, delta) => updateContent(activePageId, newC, delta)}
            lastEditedBy={lastEditedBy}
            remoteCursors={remoteCursors}
            sendCursorMove={sendCursorMove}
            docType={documentMeta?.type || 'text'}
            docTitle={effectiveMeta?.title || 'Document'}
            socket={socket}
            roomId={roomId}
            userName={userName}
            userColor={userColor}
            sidebarVisible={sidebarVisible}
            onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
          />
        </div>

        {sidebarVisible && (
          <div className="sidebar-wrapper" style={{ width: `${sidebarWidth}px` }}>
            {/* Resizer Handle */}
            <div className="resizer-handle" onMouseDown={startResizing} />
            
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
        )}
      </div>

      {selectedSnapshot && (
        <div className="overlay">
          <DiffViewer
            oldText={selectedSnapshot.content}
            newText={fullContentStr}
            snapshotUserName={selectedSnapshot.savedBy}
            snapshotUserColor={selectedSnapshot.savedByColor}
            currentUserName={currentUser.userName}
            currentUserColor={currentUser.color}
            onClose={() => setSelectedSnapshot(null)}
          />
        </div>
      )}

      {replayOpen && (
        <ReplayViewer
          snapshots={snapshots}
          onClose={() => setReplayOpen(false)}
        />
      )}

      {analyticsOpen && (
        <AnalyticsModal 
          activityLogs={activityLogs}
          onClose={() => setAnalyticsOpen(false)}
        />
      )}

      {conflictData && (
        <ConflictModal
          serverVersion={conflictData.serverVersion}
          serverContent={conflictData.serverContent}
          localContent={fullContentStr}
          onAcceptMine={async () => {
            const result = await saveSnapshot(fullContentStr, "manual", "", conflictData.serverVersion, true);
            if (!result?.conflict) setConflictData(null);
          }}
          onAcceptTheirs={() => {
            try {
              setPages(JSON.parse(conflictData.serverContent));
            } catch {
              setPages({ main: conflictData.serverContent });
            }
            lastSnapshotContentRef.current = conflictData.serverContent;
            baseVersionRef.current = conflictData.serverVersion;
            setConflictData(null);
          }}
          onCancel={() => setConflictData(null)}
        />
      )}
    </main>
  );
}

export default DocumentView;
