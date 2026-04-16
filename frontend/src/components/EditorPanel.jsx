import React, { useRef } from 'react';
import { getCaretCoordinates } from '../utils/caretHelper';

function EditorPanel({ content, onChange, lastEditedBy, remoteCursors, sendCursorMove }) {
  const textareaRef = useRef(null);

  const handleCaretMove = () => {
    if (textareaRef.current && sendCursorMove) {
      sendCursorMove(textareaRef.current.selectionStart);
    }
  };

  const renderCursors = () => {
    if (!textareaRef.current || !remoteCursors) return null;

    return Object.entries(remoteCursors).map(([userId, cursorData]) => {
      // Calculate pixel coordinates for this remote cursor
      const coords = getCaretCoordinates(textareaRef.current, cursorData.index);
      
      return (
        <div
          key={userId}
          className="remote-cursor"
          style={{
            transform: `translate(${coords.left}px, ${coords.top}px)`,
            height: `${coords.height || 20}px`,
            borderLeft: `2px solid ${cursorData.userColor}`
          }}
        >
          <div 
            className="remote-cursor-label" 
            style={{ backgroundColor: cursorData.userColor }}
          >
            {cursorData.userName}
          </div>
        </div>
      );
    });
  };

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

      <div className="editor-container" style={{ position: 'relative', flex: 1, display: 'flex' }}>
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={content}
          onChange={(e) => {
            onChange(e.target.value);
            handleCaretMove();
          }}
          onSelect={handleCaretMove}
          onClick={handleCaretMove}
          onKeyUp={handleCaretMove}
          placeholder="Start typing..."
        />
        {renderCursors()}
      </div>
    </section>
  );
}

export default EditorPanel;