function EditorPanel({ content, onChange, lastEditedBy }) {
  return (
    <section className="editor-card">
      <div className="section-header">
        <div>
          <h3>Shared Document</h3>
          <p>Edit in multiple tabs or devices to test real-time sync</p>
        </div>
        <div className="live-indicator">
          <span className="live-dot" />
          Live Sync
        </div>
      </div>

      {lastEditedBy ? (
        <div className="edited-banner">{lastEditedBy} is making changes</div>
      ) : (
        <div className="edited-banner muted">Everyone is synced</div>
      )}

      <textarea
        className="editor-textarea"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start typing..."
      />
    </section>
  );
}

export default EditorPanel;