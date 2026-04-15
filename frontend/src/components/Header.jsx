function Header({
  activeUsers,
  currentUser,
  onSaveSnapshot,
  savingSnapshot,
  autoSaveMessage,
}) {
  return (
    <header className="topbar">
      <div>
        <h2>DocuSync</h2>
        <p>Real-time collaborative editing with snapshots</p>
      </div>

      <div className="topbar-right">
        <div className="header-pill auto-pill">{autoSaveMessage}</div>

        <div className="user-badges">
          {activeUsers.map((user) => (
            <span
              className="user-badge"
              key={user.socketId}
              style={{ borderColor: user.color }}
            >
              <span
                className="user-badge-dot"
                style={{ backgroundColor: user.color }}
              />
              {user.userName}
            </span>
          ))}
        </div>

        <div className="current-user-pill">
          You: <strong>{currentUser.userName}</strong>
        </div>

        <button
          className="primary-btn"
          onClick={onSaveSnapshot}
          disabled={savingSnapshot}
        >
          {savingSnapshot ? "Saving..." : "Save Snapshot"}
        </button>
      </div>
    </header>
  );
}

export default Header;