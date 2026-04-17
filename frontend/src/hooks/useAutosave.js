import { useState, useRef, useEffect } from "react";
import { diff_match_patch } from "diff-match-patch";

export const useAutosave = (apiUrl, content, roomId, userName, userColor, lastSnapshotContentRef, token, baseVersionRef, handleConflict, isLocalDirtyRef, socket) => {
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [autoSaveMessage, setAutoSaveMessage] = useState("Auto Snapshot On");
  const [isCoordinator, setIsCoordinator] = useState(false);
  
  const autoSaveTimerRef = useRef(null);
  const autoSaveMessageTimerRef = useRef(null);

  const saveSnapshot = async (contentToSave, mode = "manual", tag = "", overrideBaseVersion = null, force = false) => {
    const isAuto = mode === "auto";

    if (isAuto && !isCoordinator) return;
    if (!contentToSave.trim()) return;
    if (contentToSave === lastSnapshotContentRef.current && !tag && !force) return;

    try {
      if (!isAuto) setSavingSnapshot(true);

      const res = await fetch(`${apiUrl}/snapshot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          content: contentToSave,
          savedBy: userName,
          savedByColor: userColor,
          mode,
          tag,
          baseVersion: overrideBaseVersion || baseVersionRef.current,
          force
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        const conflictData = data;
        const dmp = new diff_match_patch();
        const patches = dmp.patch_make(lastSnapshotContentRef.current, contentToSave);
        const [mergedContent, successArray] = dmp.patch_apply(patches, conflictData.serverContent);
        
        if (!successArray.includes(false)) {
          // Auto merge successful
          return saveSnapshot(mergedContent, mode, tag, conflictData.serverVersion, true);
        } else {
          // Unresolvable conflict
          if (isAuto) {
            setAutoSaveMessage("Merge Conflict!");
            return;
          }
          if (handleConflict) {
            handleConflict(conflictData);
          }
          return { conflict: true, data: conflictData };
        }
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to save snapshot");
      }

      lastSnapshotContentRef.current = contentToSave;
      if (isLocalDirtyRef) isLocalDirtyRef.current = false; // Reset the loop flag!

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

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    
    // Check if the content is dirty relative to the last snapshot
    if (content !== lastSnapshotContentRef.current) {
        // Only trigger an autosave timer if the local user is the one who made the edit
        if (isLocalDirtyRef && !isLocalDirtyRef.current) return;

        autoSaveTimerRef.current = setTimeout(() => {
            saveSnapshot(content, "auto");
        }, 6000);
    }

    return () => {
    return () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    }
  }, [content, apiUrl, roomId, userName, userColor, isLocalDirtyRef, isCoordinator]);

  useEffect(() => {
    if (!socket) return;
    const handleCoordinator = (coordinatorId) => {
      setIsCoordinator(socket.id === coordinatorId);
    };
    socket.on("coordinator-assigned", handleCoordinator);
    return () => socket.off("coordinator-assigned", handleCoordinator);
  }, [socket]);

  return { savereference: saveSnapshot, saveSnapshot, savingSnapshot, autoSaveMessage };
};
