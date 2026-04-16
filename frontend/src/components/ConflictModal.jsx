import React, { useMemo } from 'react';
import * as Diff from 'diff';
import { AlertCircle, Check, X } from 'lucide-react';

function ConflictModal({ serverVersion, serverContent, localContent, onAcceptMine, onAcceptTheirs, onCancel }) {
  const diffs = useMemo(() => {
    return Diff.diffWords(serverContent, localContent);
  }, [serverContent, localContent]);

  return (
    <div className="overlay">
      <div className="modal-card" style={{ width: '800px', maxWidth: '100%' }}>
        <div className="modal-head" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={28} color="#ef4444" />
            <div>
              <h3 style={{ margin: 0, color: '#991b1b' }}>Merge Conflict Detected</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#b91c1c' }}>Someone else modified the document (v{serverVersion}) while you were editing.</p>
            </div>
          </div>
          <button className="vsc-icon-btn" onClick={onCancel} style={{ alignSelf: 'flex-start' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
          <div style={{ flex: 1, backgroundColor: '#fef2f2', padding: '12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
            <h4 style={{ margin: '0 0 8px', color: '#991b1b', fontSize: '14px' }}>Theirs (Server v{serverVersion})</h4>
            <div style={{ fontSize: '13px', color: '#7f1d1d' }}>The red highlights show what the server has that you don't.</div>
          </div>
          <div style={{ flex: 1, backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <h4 style={{ margin: '0 0 8px', color: '#166534', fontSize: '14px' }}>Mine (Your Changes)</h4>
            <div style={{ fontSize: '13px', color: '#14532d' }}>The green highlights show what you added.</div>
          </div>
        </div>

        <div className="diff-content" style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '24px', backgroundColor: '#f8fafc', padding: '16px' }}>
          <div className="word-diff-inline">
            {diffs.map((part, index) => {
              const color = part.added ? '#166534' : part.removed ? '#991b1b' : '#334155';
              const bgColor = part.added ? '#dcfce7' : part.removed ? '#fee2e2' : 'transparent';
              const textDecoration = part.removed ? 'line-through' : 'none';
              const fontWeight = part.added || part.removed ? '600' : '400';

              return (
                <span key={index} style={{ color, backgroundColor: bgColor, textDecoration, fontWeight, padding: part.added || part.removed ? '2px 4px' : '0', borderRadius: '4px' }}>
                  {part.value}
                </span>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
          <button 
            className="secondary-btn" 
            onClick={onCancel}
          >
            Cancel (Merge Manually)
          </button>
          <button 
            className="primary-btn" 
            onClick={onAcceptTheirs}
            style={{ backgroundColor: '#dc2626' }}
          >
            <Check size={16} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'text-bottom' }} />
            Accept Theirs
          </button>
          <button 
            className="primary-btn" 
            onClick={onAcceptMine}
            style={{ backgroundColor: '#16a34a' }}
          >
            <Check size={16} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'text-bottom' }} />
            Accept Mine (Force Save)
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConflictModal;
