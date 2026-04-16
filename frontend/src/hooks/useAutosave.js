import { useState, useRef, useEffect } from "react";

export const useAutosave = (apiUrl, content, roomId, userName, userColor, lastSnapshotContentRef) => {
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [autoSaveMessage, setAutoSaveMessage] = useState("Auto Snapshot On");
  
  const autoSaveTimerRef = useRef(null);
  const autoSaveMessageTimerRef = useRef(null);

  const saveSnapshot = async (contentToSave, mode = "manual") => {
    const isAuto = mode === "auto";

    if (!contentToSave.trim()) return;
    if (contentToSave === lastSnapshotContentRef.current) return;

    try {
      if (!isAuto) setSavingSnapshot(true);

      const res = await fetch(`${apiUrl}/snapshot`, {
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

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    
    // Using 6000ms delay internally for the Docu-Sync autosave as was custom in App.jsx
    if (content !== lastSnapshotContentRef.current) {
        autoSaveTimerRef.current = setTimeout(() => {
            saveSnapshot(content, "auto");
        }, 6000);
    }

    return () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    }
  }, [content, apiUrl, roomId, userName, userColor]);

  return { savereference: saveSnapshot, saveSnapshot, savingSnapshot, autoSaveMessage };
};
