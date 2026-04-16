import React, { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import 'quill/dist/quill.snow.css';
import { getCaretCoordinates } from '../utils/caretHelper';

// Register quill-cursors once
Quill.register('modules/cursors', QuillCursors);

// ─── Export helpers ─────────────────────────────────────────────────────────
function exportTxt(plainText, title) {
  const blob = new Blob([plainText], { type: 'text/plain' });
  triggerDownload(blob, `${title}.txt`);
}

function exportHtml(html, title) {
  const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.7}</style>
</head><body>${html}</body></html>`;
  const blob = new Blob([full], { type: 'text/html' });
  triggerDownload(blob, `${title}.html`);
}

async function exportPdf(html, title) {
  const html2pdf = (await import('html2pdf.js')).default;
  const container = document.createElement('div');
  container.innerHTML = `<h2>${escapeHtml(title)}</h2>${html}`;
  container.style.cssText = 'padding:24px;font-family:sans-serif;line-height:1.7';
  document.body.appendChild(container);
  await html2pdf()
    .set({ filename: `${title}.pdf`, margin: 12, html2canvas: { scale: 2 } })
    .from(container).save();
  document.body.removeChild(container);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Rich-text Quill editor (direct DOM init, React 19 safe) ─────────────────
const RichEditor = forwardRef(({ content, onChange, remoteCursors, socket, roomId, userName, userColor }, ref) => {
  const containerRef = useRef(null);
  const quillRef = useRef(null);
  const lastRemoteContent = useRef(content);
  const cursorsModuleRef = useRef(null);
  const isRemoteRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange; // keep latest without re-init

  // Init Quill once on mount
  useEffect(() => {
    if (!containerRef.current || quillRef.current) return;

    const q = new Quill(containerRef.current, {
      theme: 'snow',
      placeholder: 'Start collaborating...',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'code-block', 'link'],
          ['clean'],
        ],
        cursors: { transformOnTextChange: true },
      },
    });

    quillRef.current = q;
    cursorsModuleRef.current = q.getModule('cursors');

    // Load initial content
    try {
      const delta = JSON.parse(content);
      q.setContents(delta, 'silent');
      lastRemoteContent.current = content;
    } catch {
      q.setText(content || '', 'silent');
      lastRemoteContent.current = content || '';
    }

    // Listen for local edits
    q.on('text-change', (delta, oldDelta, source) => {
      if (isRemoteRef.current || source !== 'user') return;
      const fullDelta = q.getContents();
      const stringified = JSON.stringify(fullDelta);
      lastRemoteContent.current = stringified; // identify as "known" to prevent prop-feedback loop
      // Send BOTH the full stringified document AND the isolated delta change
      onChangeRef.current(stringified, delta);
    });

    return () => {
      const toolbar = q.getModule('toolbar');
      if (toolbar && toolbar.container) toolbar.container.remove();
      q.off('text-change');
      quillRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync with 'content' prop (fallback for external state changes like Restore)
  useEffect(() => {
    const q = quillRef.current;
    if (!q || content === lastRemoteContent.current) return;

    isRemoteRef.current = true;
    try {
      const delta = JSON.parse(content);
      q.setContents(delta, 'silent');
    } catch {
      q.setText(content || '', 'silent');
    }
    lastRemoteContent.current = content;
    isRemoteRef.current = false;
  }, [content]);

  // Apply incoming content changes from socket (without echo loop)
  useEffect(() => {
    if (!socket) return;

    const applyRemoteContent = (data) => {
      const q = quillRef.current;
      if (!q || !data.content) return;
      
      // If we already have this content (from prop sync or previous event), skip
      if (data.content === lastRemoteContent.current) return;

      isRemoteRef.current = true;
      try {
        const incoming = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
        
        // If it's a pure diff Delta (has ops but is not a full doc length), it's from the new OT system!
        if (incoming.ops && incoming.ops.length > 0 && !data.isFullDoc) {
             q.updateContents(incoming, 'silent');
        } else {
             // Fallback to full doc replacement
             const current = JSON.stringify(q.getContents());
             if (JSON.stringify(incoming) !== current) {
               const sel = q.getSelection();
               q.setContents(incoming, 'silent');
               if (sel) q.setSelection(sel, 'silent');
             }
        }
        
        lastRemoteContent.current = JSON.stringify(q.getContents());
      } catch {
        q.setText(data.content || '', 'silent');
        lastRemoteContent.current = data.content;
      }
      isRemoteRef.current = false;
    };

    socket.on('receive-changes', applyRemoteContent);
    socket.on('document-updated', applyRemoteContent);
    return () => {
      socket.off('receive-changes', applyRemoteContent);
      socket.off('document-updated', applyRemoteContent);
    };
  }, [socket]);

  // Render remote cursors via quill-cursors
  useEffect(() => {
    const cursors = cursorsModuleRef.current;
    if (!cursors || !remoteCursors) return;
    Object.entries(remoteCursors).forEach(([uid, data]) => {
      try {
        cursors.createCursor(uid, data.userName, data.userColor);
        cursors.moveCursor(uid, { index: data.index || 0, length: 0 });
      } catch {}
    });
  }, [remoteCursors]);

  useImperativeHandle(ref, () => ({
    getPlainText: () => quillRef.current?.getText() || '',
    getHtml: () => containerRef.current?.querySelector('.ql-editor')?.innerHTML || '',
    setLocalContent: (newContent) => {
      const q = quillRef.current;
      if (!q) return;
      q.setText(newContent || '', 'user'); // Triggers 'text-change' with 'user' source
    }
  }));

  return (
    <div className="quill-wrapper">
      <div ref={containerRef} />
    </div>
  );
});

// ─── Plain-text / code editor ────────────────────────────────────────────────
function PlainEditor({ content, onChange, remoteCursors, sendCursorMove, placeholder, isCode }) {
  const textareaRef = useRef(null);

  const handleCaretMove = useCallback(() => {
    if (textareaRef.current && sendCursorMove) {
      sendCursorMove(textareaRef.current.selectionStart);
    }
  }, [sendCursorMove]);

  const renderCursors = () => {
    if (!textareaRef.current || !remoteCursors) return null;
    return Object.entries(remoteCursors).map(([uid, cur]) => {
      try {
        const coords = getCaretCoordinates(textareaRef.current, cur.index);
        return (
          <div key={uid} className="remote-cursor"
            style={{ transform: `translate(${coords.left}px,${coords.top}px)`, height: `${coords.height || 20}px`, borderLeft: `2px solid ${cur.userColor}` }}>
            <div className="remote-cursor-label" style={{ backgroundColor: cur.userColor }}>{cur.userName}</div>
          </div>
        );
      } catch { return null; }
    });
  };

  return (
    <div className="editor-container" style={{ position: 'relative', flex: 1, display: 'flex' }}>
      <textarea
        ref={textareaRef}
        className={`editor-textarea${isCode ? ' code-mode' : ''}`}
        value={content}
        onChange={(e) => { onChange(e.target.value); handleCaretMove(); }}
        onSelect={handleCaretMove} onClick={handleCaretMove} onKeyUp={handleCaretMove}
        placeholder={placeholder || 'Start typing...'}
      />
      {renderCursors()}
    </div>
  );
}

// ─── Main EditorPanel ────────────────────────────────────────────────────────
function EditorPanel({
  content, onChange, lastEditedBy,
  remoteCursors, sendCursorMove,
  docType = 'text', docTitle = 'Document',
  socket, roomId, userName, userColor,
  sidebarVisible, onToggleSidebar
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const richEditorRef = useRef(null);

  const handleExport = async (format) => {
    setExportOpen(false);
    try {
      // For rich-text, grab live DOM; for others use raw content
      let plainText = content;
      let html = content;

      if (docType === 'text') {
        const editorEl = document.querySelector('.ql-editor');
        html = editorEl ? editorEl.innerHTML : content;
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        plainText = tmp.innerText;
      } else {
        html = `<pre style="font-family:monospace;white-space:pre-wrap">${escapeHtml(content)}</pre>`;
        plainText = content;
      }

      if (format === 'txt')  exportTxt(plainText, docTitle);
      if (format === 'html') exportHtml(html, docTitle);
      if (format === 'pdf')  await exportPdf(html, docTitle);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  const typeBadge = { text: { bg: '#eef2ff', color: '#4f46e5' }, code: { bg: '#fef9c3', color: '#854d0e' }, notes: { bg: '#f0fdf4', color: '#166534' } }[docType] || {};

  const fileInputRef = useRef(null);

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target.result;
      if (docType === 'text' && richEditorRef.current) {
        richEditorRef.current.setLocalContent(result);
      } else {
        onChange(result);
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  return (
    <section className="editor-card">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3>Shared Document</h3>
          <span className="type-badge" style={{ background: typeBadge.bg, color: typeBadge.color }}>{docType}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
            accept=".txt,.html,.json,.js,.md" 
          />
          <button 
            className="secondary-btn" 
            style={{ minHeight: 30, fontSize: 12 }}
            onClick={handleImportClick}
          >
            ⬆ Import
          </button>
          <div style={{ position: 'relative' }}>
            <button className="secondary-btn" style={{ minHeight: 30, fontSize: 12 }}
              onClick={() => setExportOpen(o => !o)}>
              ⬇ Export
            </button>
            {exportOpen && (
              <div className="export-dropdown">
                <button onClick={() => handleExport('txt')}>📄 Export as TXT</button>
                <button onClick={() => handleExport('html')}>🌐 Export as HTML</button>
                <button onClick={() => handleExport('pdf')}>📑 Export as PDF</button>
              </div>
            )}
          </div>
          <div className="live-indicator"><span className="live-dot" />Live Sync</div>
          <button 
            className="secondary-btn" 
            style={{ minHeight: 30, fontSize: 12 }}
            onClick={onToggleSidebar}
          >
            {sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
          </button>
        </div>
      </div>

      {lastEditedBy
        ? <div className="edited-banner">{lastEditedBy} is making changes</div>
        : <div className="edited-banner muted">Everyone is synced</div>}

      {docType === 'text' ? (
        <RichEditor
          ref={richEditorRef}
          content={content}
          onChange={onChange}
          remoteCursors={remoteCursors}
          socket={socket}
          roomId={roomId}
          userName={userName}
          userColor={userColor}
        />
      ) : (
        <PlainEditor
          content={content}
          onChange={onChange}
          remoteCursors={remoteCursors}
          sendCursorMove={sendCursorMove}
          isCode={docType === 'code'}
          placeholder={docType === 'code' ? '// Start coding...' : 'Write your notes...'}
        />
      )}
    </section>
  );
}

export default EditorPanel;