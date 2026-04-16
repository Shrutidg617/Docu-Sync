import React from 'react';
import { History, Play, RotateCcw, Tag } from 'lucide-react';

function HistoryPanel({
  snapshots,
  onRestoreSnapshot,
  restoringSnapshotId,
  setSelectedSnapshot,
  selectedSnapshot,
  onOpenReplay,
}) {
  const reversedSnapshots = [...snapshots].reverse();

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="vsc-panel">
      <div className="panel-header">
        <h3>Version History</h3>
        <button className="vsc-icon-btn" onClick={onOpenReplay} title="Replay Mode">
          <Play size={16} />
        </button>
      </div>
      <div className="panel-content">
        <div className="snapshot-list" style={{ padding: '0 12px' }}>
          {reversedSnapshots.length === 0 ? (
            <div className="empty-state">No snapshots yet</div>
          ) : (
            reversedSnapshots.map((snapshot, index) => {
              const isSelected = selectedSnapshot?._id === snapshot._id;

              return (
                <div
                  key={snapshot._id}
                  className={`snapshot-item ${
                    isSelected ? "snapshot-item-selected" : ""
                  }`}
                  style={{ cursor: 'default', margin: '8px 0' }}
                >
                  <div className="snapshot-info">
                    <div className="version-title-row" style={{ marginBottom: '4px' }}>
                      <strong style={{ fontSize: '14px' }}>Version {reversedSnapshots.length - index}</strong>
                      {snapshot.tag && (
                        <span className="type-badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px' }}>
                          <Tag size={10} style={{ marginRight: '2px' }} /> {snapshot.tag}
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}>
                       <span
                        className="mini-user-dot"
                        style={{ backgroundColor: snapshot.savedByColor || "#4F46E5" }}
                      />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{snapshot.savedBy}</span>
                    </div>

                    {snapshot.aiSummary && (
                      <p style={{ margin: '6px 0', fontSize: '12px', color: '#374151', lineHeight: '1.4', fontStyle: 'italic' }}>
                        ✨ {snapshot.aiSummary}
                      </p>
                    )}
                    <small style={{ fontSize: '11px', color: '#94a3b8' }}>{formatTime(snapshot.timestamp)}</small>
                  </div>

                  <div className="snapshot-actions" style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
                    <button
                      className="secondary-btn"
                      onClick={() => setSelectedSnapshot(snapshot)}
                      style={{ fontSize: '11px', height: '28px', flex: 1 }}
                    >
                      Compare
                    </button>

                    <button
                      className="secondary-btn"
                      onClick={() => onRestoreSnapshot(snapshot._id)}
                      disabled={restoringSnapshotId === snapshot._id}
                      style={{ fontSize: '11px', height: '28px', flex: 1 }}
                    >
                      {restoringSnapshotId === snapshot._id ? "..." : "Restore"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default HistoryPanel;
