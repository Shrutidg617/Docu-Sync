import React, { useState } from 'react';
import { Sparkles, RefreshCw, MessageSquareQuote } from 'lucide-react';

function AISummaryPanel({ snapshots }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState('');

  const generateSummary = () => {
    setIsGenerating(true);
    // Simulate API call
    setTimeout(() => {
      const latestWithSummary = [...snapshots].reverse().find(s => s.aiSummary);
      if (latestWithSummary) {
        setSummary(latestWithSummary.aiSummary);
      } else {
        setSummary("The document currently discusses the core features of Docu-Sync, including real-time collaboration and hybrid storage. Recent changes focused on UI improvements and production hardening.");
      }
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="vsc-panel">
      <div className="panel-header">
        <h3>AI Summary</h3>
        <button 
          className={`vsc-icon-btn ${isGenerating ? 'spinning' : ''}`} 
          onClick={generateSummary}
          disabled={isGenerating}
          title="Generate New Summary"
        >
          <RefreshCw size={16} style={{ animation: isGenerating ? 'spin 2s linear infinite' : 'none' }} />
        </button>
      </div>
      <div className="panel-content" style={{ padding: '16px' }}>
        {!summary && !isGenerating ? (
          <div style={{ textAlign: 'center', marginTop: '40px', color: '#94a3b8' }}>
            <Sparkles size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p style={{ fontSize: '14px' }}>No summary generated yet.</p>
            <button 
              className="primary-btn" 
              onClick={generateSummary}
              style={{ marginTop: '16px', fontSize: '12px' }}
            >
              Generate Summary
            </button>
          </div>
        ) : (
          <div className="summary-display">
            {isGenerating ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ height: '14px', background: '#f1f5f9', borderRadius: '4px', width: '100%' }} />
                <div style={{ height: '14px', background: '#f1f5f9', borderRadius: '4px', width: '90%' }} />
                <div style={{ height: '14px', background: '#f1f5f9', borderRadius: '4px', width: '95%' }} />
              </div>
            ) : (
              <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                <MessageSquareQuote size={20} color="#0369a1" style={{ marginBottom: '12px' }} />
                <p style={{ 
                  margin: 0, 
                  fontSize: '14px', 
                  lineHeight: '1.6', 
                  color: '#0c4a6e',
                  fontWeight: '500'
                }}>
                  {summary}
                </p>
              </div>
            )}
            
            {!isGenerating && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>Key Insights</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {["Collaborative focus", "Real-time updates", "Version control"].map((insight, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569' }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#4f46e5' }} />
                      {insight}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default AISummaryPanel;
