import { useEffect, useMemo, useState } from "react";

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function ReplayViewer({ snapshots, onClose }) {
  const orderedSnapshots = useMemo(() => [...snapshots], [snapshots]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || orderedSnapshots.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= orderedSnapshots.length - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [playing, orderedSnapshots.length]);

  useEffect(() => {
    if (currentIndex >= orderedSnapshots.length - 1) {
      setPlaying(false);
    }
  }, [currentIndex, orderedSnapshots.length]);

  if (orderedSnapshots.length === 0) {
    return (
      <div className="overlay">
        <div className="modal-card">
          <div className="modal-head">
            <div>
              <h3>Replay Mode</h3>
              <p>No snapshots available yet</p>
            </div>
            <button className="secondary-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentSnapshot = orderedSnapshots[currentIndex];

  return (
    <div className="overlay">
      <div className="modal-card replay-modal">
        <div className="modal-head">
          <div>
            <h3>Replay Mode</h3>
            <p>Play document evolution step by step</p>
          </div>
          <button className="secondary-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="replay-topbar" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="replay-status" style={{ fontWeight: 600 }}>
            Version {currentIndex + 1} of {orderedSnapshots.length}
          </div>
          
          <input 
            type="range" 
            min="0" 
            max={orderedSnapshots.length - 1} 
            value={currentIndex} 
            onChange={(e) => {
              setPlaying(false);
              setCurrentIndex(Number(e.target.value));
            }}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#0F766E' }}
          />

          <div className="replay-controls" style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              className="secondary-btn"
              onClick={() => { setPlaying(false); setCurrentIndex(0); }}
              disabled={currentIndex === 0}
            >
              ⏮ First
            </button>
            <button
              className="secondary-btn"
              onClick={() => { setPlaying(false); setCurrentIndex((prev) => Math.max(prev - 1, 0)); }}
              disabled={currentIndex === 0}
            >
              ◀ Prev
            </button>
            <button
              className="primary-btn"
              onClick={() => setPlaying((prev) => !prev)}
              style={{ minWidth: '100px' }}
            >
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              className="secondary-btn"
              onClick={() => { setPlaying(false); setCurrentIndex((prev) => Math.min(prev + 1, orderedSnapshots.length - 1)); }}
              disabled={currentIndex === orderedSnapshots.length - 1}
            >
              Next ▶
            </button>
            <button
              className="secondary-btn"
              onClick={() => { setPlaying(false); setCurrentIndex(orderedSnapshots.length - 1); }}
              disabled={currentIndex === orderedSnapshots.length - 1}
            >
              Last ⏭
            </button>
          </div>
        </div>

        <div className="replay-meta" style={{ marginTop: '16px', background: '#FDFBF7', border: '1px solid #e5e7eb', padding: '12px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              className="mini-user-pill"
              style={{
                borderColor: currentSnapshot.savedByColor || "#4F46E5",
                color: currentSnapshot.savedByColor || "#4F46E5",
              }}
            >
              <span
                className="mini-user-dot"
                style={{ backgroundColor: currentSnapshot.savedByColor || "#4F46E5" }}
              />
              {currentSnapshot.savedBy}
            </span>
            <small style={{ color: '#64748b' }}>{formatTime(currentSnapshot.timestamp)}</small>
          </div>
          {currentSnapshot.aiSummary && (
            <p style={{ marginTop: '8px', fontSize: '14px', fontStyle: 'italic', color: '#475569' }}>
              Summary: {currentSnapshot.aiSummary}
            </p>
          )}
        </div>

        <div className="replay-content" style={{ marginTop: '16px', overflowY: 'auto', flex: 1, padding: '16px', background: '#ffffff', color: '#2C241B', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          {currentSnapshot.content.startsWith('{"ops"') ? (
            <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontStyle: 'italic', color: '#64748b' }}>
              [Rich Text Content] {JSON.parse(currentSnapshot.content).ops.map(o => o.insert).join('')}
            </div>
          ) : (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{currentSnapshot.content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReplayViewer;