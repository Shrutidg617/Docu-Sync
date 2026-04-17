import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';

const DOC_TYPE_META = {
  text:  { label: 'Rich Text', icon: '✏️', bg: '#eef2ff', color: '#4f46e5' },
  code:  { label: 'Code',      icon: '💻', bg: '#fef9c3', color: '#854d0e' },
  notes: { label: 'Notes',     icon: '📝', bg: '#f0fdf4', color: '#166534' },
};

function Dashboard({ setToken }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDocType, setNewDocType] = useState('text');
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [shareModalDoc, setShareModalDoc] = useState(null);
  const [collabEmail, setCollabEmail] = useState('');
  const [collabStatus, setCollabStatus] = useState('');
  const [addingCollab, setAddingCollab] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem('docu-sync-token');
  const userId = localStorage.getItem('docu-sync-userId');

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    fetchDocs();
  }, [token, navigate]);

  const fetchDocs = async () => {
    const baseApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    try {
      const res = await fetch(`${baseApi}/api/docs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch documents');
      setDocs(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = async () => {
    const baseApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    setCreatingDoc(true);
    try {
      const res = await fetch(`${baseApi}/api/docs/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newDocType }),
      });
      if (!res.ok) throw new Error('Failed to create document');
      const newDoc = await res.json();
      navigate(`/doc/${newDoc.roomId}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingDoc(false);
      setShowCreateModal(false);
    }
  };

  const handleDelete = async (roomId) => {
    const baseApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    if (!window.confirm('Permanently delete this document?')) return;
    try {
      const res = await fetch(`${baseApi}/api/docs/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      setDocs(docs.filter(d => d.roomId !== roomId));
    } catch (err) { alert(err.message); }
  };

  const startRename = (doc) => {
    setRenamingId(doc.roomId);
    setRenameVal(doc.title || '');
  };

  const commitRename = async (roomId) => {
    const baseApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    const trimmed = renameVal.trim();
    if (!trimmed) { setRenamingId(null); return; }
    try {
      const res = await fetch(`${baseApi}/api/docs/${roomId}/rename`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error('Rename failed');
      // Optimistic update
      setDocs(docs.map(d => d.roomId === roomId ? { ...d, title: trimmed } : d));
    } catch (err) { alert(err.message); }
    finally { setRenamingId(null); }
  };

  const openShareModal = (doc) => {
    setShareModalDoc(doc);
    setCollabEmail('');
    setCollabStatus('');
    setCopiedLink(false);
  };

  const toggleVisibility = async () => {
    const baseApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    if (!shareModalDoc) return;
    setTogglingVisibility(true);
    try {
      const res = await fetch(`${baseApi}/api/docs/${shareModalDoc.roomId}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isPublic: !shareModalDoc.isPublic }),
      });
      if (res.ok) {
        const updated = { ...shareModalDoc, isPublic: !shareModalDoc.isPublic };
        setShareModalDoc(updated);
        setDocs(docs.map(d => d.roomId === updated.roomId ? { ...d, isPublic: updated.isPublic } : d));
      } else {
        const e = await res.json();
        alert(e.error || 'Failed to toggle visibility');
      }
    } catch {
      alert('Failed to toggle visibility');
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleAddCollaborator = async (e) => {
    const baseApi = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    e.preventDefault();
    if (!collabEmail.trim() || !shareModalDoc) return;
    setAddingCollab(true);
    setCollabStatus('');
    try {
      const res = await fetch(`${baseApi}/api/docs/add-collaborator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId: shareModalDoc.roomId, email: collabEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCollabStatus('✅ Collaborator added successfully!');
        setCollabEmail('');
      } else {
        setCollabStatus(`❌ ${data.error || 'Failed to add collaborator'}`);
      }
    } catch {
      setCollabStatus('❌ Network error while adding collaborator');
    } finally {
      setAddingCollab(false);
    }
  };

  const handleCopyLink = (roomId) => {
    navigator.clipboard.writeText(`${window.location.origin}/doc/${roomId}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleLogout = () => {
    ['docu-sync-token', 'docu-sync-userId', 'docu-sync-userName', 'docu-sync-userColor']
      .forEach(k => localStorage.removeItem(k));
    if (setToken) setToken(null);
    navigate('/login');
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading dashboard…</div>;

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px' }}>
      <Helmet>
        <title>Docu-Sync | Dashboard</title>
        <meta name="description" content="Manage your documents, collaborate with your team, and track your project progress from your personalized dashboard." />
      </Helmet>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>📄 Your Documents</h1>
          <p style={{ color: '#64748b', margin: '6px 0 0' }}>Manage and collaborate on your shared workspaces.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowCreateModal(true)} className="primary-btn" style={{ minWidth: 160 }}>
            + New Document
          </button>
          <button onClick={handleLogout} className="secondary-btn">Logout</button>
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 20 }}>{error}</div>}

      {/* Document list */}
      <div style={{ display: 'grid', gap: 14 }}>
        {docs.length === 0 ? (
          <div className="empty-state" style={{ textAlign: 'center', padding: '60px 20px', fontSize: 16 }}>
            No documents yet. Create your first one!
          </div>
        ) : docs.map(doc => {
          const isOwner = doc.ownerId?._id === userId || doc.ownerId === userId;
          const meta = DOC_TYPE_META[doc.type] || DOC_TYPE_META.text;
          const isRenaming = renamingId === doc.roomId;

          return (
            <div key={doc.roomId} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '18px 20px', background: '#FDFBF7', borderRadius: 12,
              border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(44, 36, 27, 0.05)',
              transition: 'box-shadow 0.15s ease',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  {/* Inline rename input or clickable title */}
                  {isRenaming ? (
                    <input
                      value={renameVal}
                      autoFocus
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={() => commitRename(doc.roomId)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(doc.roomId);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      style={{
                        fontWeight: 700, fontSize: 16, border: '2px solid #0F766E',
                        borderRadius: 8, padding: '3px 10px', outline: 'none',
                      }}
                    />
                  ) : (
                    <a
                      href="#"
                      onClick={e => { e.preventDefault(); navigate(`/doc/${doc.roomId}`); }}
                      style={{ color: '#1f2937', textDecoration: 'none', fontWeight: 700, fontSize: 17 }}
                    >
                      {doc.title || 'Untitled Document'}
                    </a>
                  )}

                  {/* Type badge */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: meta.bg, color: meta.color,
                  }}>
                    {meta.icon} {meta.label}
                  </span>

                  {/* Role badge */}
                  {isOwner
                    ? <span style={{ fontSize: 11, background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>Owner</span>
                    : <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>Collaborator</span>}
                  {doc.isPublic
                    ? <span style={{ fontSize: 11, background: '#ecfdf3', color: '#166534', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>🌎 Public</span>
                    : <span style={{ fontSize: 11, background: '#fef2f2', color: '#991b1b', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>🔒 Private</span>}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Last updated: {new Date(doc.updatedAt).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => navigate(`/doc/${doc.roomId}`)} className="primary-btn" style={{ minHeight: 34, fontSize: 13 }}>Open</button>
                {isOwner && <>
                  <button onClick={() => openShareModal(doc)} className="secondary-btn" style={{ minHeight: 34, fontSize: 13, background: '#eef2ff', color: '#4f46e5' }}>🔗 Share</button>
                  <button onClick={() => startRename(doc)} className="secondary-btn" style={{ minHeight: 34, fontSize: 13 }}>Rename</button>
                  <button onClick={() => handleDelete(doc.roomId)} className="secondary-btn" style={{ minHeight: 34, fontSize: 13, color: '#dc2626', background: '#fef2f2' }}>Delete</button>
                </>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create document modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
          display: 'grid', placeItems: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#FDFBF7', borderRadius: 12, padding: 32,
            width: 'min(480px, 90vw)', boxShadow: '0 20px 60px rgba(44, 36, 27, 0.15)',
          }}>
            <h2 style={{ margin: '0 0 8px' }}>Create New Document</h2>
            <p style={{ color: '#64748b', marginBottom: 24 }}>Choose a document type to get started.</p>

            <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
              {Object.entries(DOC_TYPE_META).map(([type, meta]) => (
                <label key={type} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  borderRadius: 12, border: `2px solid ${newDocType === type ? '#0F766E' : '#e5e7eb'}`,
                  background: newDocType === type ? '#EBE7E0' : '#FDFBF7',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}>
                  <input type="radio" name="doctype" value={type}
                    checked={newDocType === type}
                    onChange={() => setNewDocType(type)}
                    style={{ display: 'none' }}
                  />
                  <span style={{ fontSize: 24 }}>{meta.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{meta.label}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {type === 'text' && 'Rich text with Bold, Italic, Underline and more'}
                      {type === 'code' && 'Monospace editor for writing and sharing code'}
                      {type === 'notes' && 'Simple plain-text area for quick notes'}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateModal(false)} className="secondary-btn">Cancel</button>
              <button onClick={handleCreateNew} className="primary-btn" disabled={creatingDoc}>
                {creatingDoc ? 'Creating…' : 'Create Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share / Collaborate modal */}
      {shareModalDoc && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
          display: 'grid', placeItems: 'center', zIndex: 1000,
        }} onClick={(e) => { if (e.target === e.currentTarget) setShareModalDoc(null); }}>
          <div style={{
            background: '#FDFBF7', borderRadius: 12, padding: 32,
            width: 'min(520px, 92vw)', boxShadow: '0 20px 60px rgba(44, 36, 27, 0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h2 style={{ margin: 0 }}>Share Document</h2>
              <button onClick={() => setShareModalDoc(null)} className="secondary-btn" style={{ fontSize: 18, padding: '0 10px', minHeight: 34 }}>✕</button>
            </div>
            <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>
              {shareModalDoc.title || 'Untitled Document'}
            </p>

            {/* Visibility toggle */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 18px', borderRadius: 14, marginBottom: 20,
              background: shareModalDoc.isPublic ? '#ecfdf3' : '#fef2f2',
              border: `1px solid ${shareModalDoc.isPublic ? '#bbf7d0' : '#fecaca'}`,
              transition: 'all 0.2s ease',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: shareModalDoc.isPublic ? '#166534' : '#991b1b' }}>
                  {shareModalDoc.isPublic ? '🌎 Public Document' : '🔒 Private Document'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  {shareModalDoc.isPublic
                    ? 'Anyone with the link can view and edit this document'
                    : 'Only you and added collaborators can access this document'}
                </div>
              </div>
              <button
                onClick={toggleVisibility}
                disabled={togglingVisibility}
                className="secondary-btn"
                style={{
                  minHeight: 36, fontSize: 13, fontWeight: 700,
                  background: shareModalDoc.isPublic ? '#fef2f2' : '#ecfdf3',
                  color: shareModalDoc.isPublic ? '#991b1b' : '#166534',
                }}
              >
                {togglingVisibility ? 'Updating…' : (shareModalDoc.isPublic ? 'Make Private' : 'Make Public')}
              </button>
            </div>

            {/* Copy shareable link */}
            <div style={{
              display: 'flex', gap: 10, marginBottom: 20,
              padding: '12px 14px', background: '#EBE7E0', borderRadius: 8,
              border: '1px solid #c9c3b8', alignItems: 'center',
            }}>
              <input
                readOnly
                value={`${window.location.origin}/doc/${shareModalDoc.roomId}`}
                style={{
                  flex: 1, border: 'none', background: 'transparent',
                  fontSize: 13, color: '#475569', outline: 'none',
                  fontFamily: 'monospace',
                }}
                onClick={(e) => e.target.select()}
              />
              <button
                onClick={() => handleCopyLink(shareModalDoc.roomId)}
                className="primary-btn"
                style={{ minHeight: 34, fontSize: 12, padding: '0 16px' }}
              >
                {copiedLink ? '✓ Copied!' : '📋 Copy Link'}
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#e5e7eb', margin: '20px 0' }} />

            {/* Add collaborator */}
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>🤝 Add Collaborator</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 14px' }}>
              Invite a registered user by their email address to edit this document.
            </p>
            <form onSubmit={handleAddCollaborator} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <input
                type="email"
                placeholder="collaborator@example.com"
                value={collabEmail}
                onChange={(e) => setCollabEmail(e.target.value)}
                style={{
                  flex: 1, height: 42, border: '1px solid #c9c3b8', borderRadius: 8,
                  padding: '0 14px', outline: 'none', fontSize: 14,
                }}
              />
              <button
                type="submit"
                className="primary-btn"
                disabled={addingCollab || !collabEmail.trim()}
                style={{ minHeight: 42, fontSize: 13 }}
              >
                {addingCollab ? 'Adding…' : 'Add'}
              </button>
            </form>
            {collabStatus && (
              <div style={{
                fontSize: 13, fontWeight: 600, padding: '8px 12px',
                borderRadius: 10, marginTop: 8,
                background: collabStatus.startsWith('✅') ? '#ecfdf3' : '#fef2f2',
                color: collabStatus.startsWith('✅') ? '#166534' : '#dc2626',
              }}>
                {collabStatus}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default Dashboard;
