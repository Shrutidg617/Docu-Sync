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

        <div className="replay-topbar">
          <div className="replay-controls">
            <button
              className="secondary-btn"
              onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
            >
              Prev
            </button>

            <button
              className="primary-btn"
              onClick={() => setPlaying((prev) => !prev)}
            >
              {playing ? "Pause" : "Play"}
            </button>

            <button
              className="secondary-btn"
              onClick={() =>
                setCurrentIndex((prev) =>
                  Math.min(prev + 1, orderedSnapshots.length - 1)
                )
              }
            >
              Next
            </button>
          </div>

          <div className="replay-status">
            Version {currentIndex + 1} / {orderedSnapshots.length}
          </div>
        </div>

        <div className="replay-meta">
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
          <small>{formatTime(currentSnapshot.timestamp)}</small>
        </div>

        <div className="replay-content">
          <pre>{currentSnapshot.content}</pre>
        </div>

        <div className="replay-track">
          {orderedSnapshots.map((snapshot, index) => (
            <button
              key={snapshot._id}
              className={`replay-step ${index === currentIndex ? "active" : ""}`}
              style={{
                borderColor: snapshot.savedByColor || "#4F46E5",
              }}
              onClick={() => setCurrentIndex(index)}
              title={`Version ${index + 1}`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ReplayViewer;