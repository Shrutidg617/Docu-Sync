function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function Sidebar({
  snapshots,
  activityLogs,
  onRestoreSnapshot,
  restoringSnapshotId,
  setSelectedSnapshot,
  selectedSnapshot,
  onOpenReplay,
}) {
  const reversedSnapshots = [...snapshots].reverse();
  const reversedActivities = [...activityLogs].reverse().slice(0, 12);

  return (
    <aside className="sidebar">
      <div className="sidebar-card">
        <div className="sidebar-head-row">
          <div>
            <h3>Version History</h3>
            <p>Saved document snapshots</p>
          </div>
          <button className="secondary-btn" onClick={onOpenReplay}>
            Replay Mode
          </button>
        </div>

        <div className="snapshot-list">
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
                >
                  <div className="snapshot-info">
                    <div className="version-title-row">
                      <strong>Version {reversedSnapshots.length - index}</strong>
                      <span
                        className="mini-user-pill"
                        style={{
                          borderColor: snapshot.savedByColor || "#4F46E5",
                          color: snapshot.savedByColor || "#4F46E5",
                        }}
                      >
                        <span
                          className="mini-user-dot"
                          style={{
                            backgroundColor: snapshot.savedByColor || "#4F46E5",
                          }}
                        />
                        {snapshot.savedBy}
                      </span>
                    </div>
                    <small>{formatTime(snapshot.timestamp)}</small>
                  </div>

                  <div className="snapshot-actions">
                    <button
                      className="secondary-btn"
                      onClick={() => setSelectedSnapshot(snapshot)}
                    >
                      Preview
                    </button>

                    <button
                      className="secondary-btn"
                      onClick={() => onRestoreSnapshot(snapshot._id)}
                      disabled={restoringSnapshotId === snapshot._id}
                    >
                      {restoringSnapshotId === snapshot._id
                        ? "Restoring..."
                        : "Restore"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="sidebar-card">
        <h3>Activity Log</h3>
        <p>Recent document activity</p>

        <div className="activity-list">
          {reversedActivities.length === 0 ? (
            <div className="empty-state">No activity yet</div>
          ) : (
            reversedActivities.map((log) => (
              <div className="activity-item" key={log._id}>
                <div className="activity-row">
                  <span
                    className="activity-color-bar"
                    style={{ backgroundColor: log.userColor || "#94a3b8" }}
                  />
                  <div>
                    <div className="activity-message">{log.message}</div>
                    <small>{formatTime(log.timestamp)}</small>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;