import React, { useState } from 'react';
import { Activity, Clock, Trash2 } from 'lucide-react';

function ActivityPanel({ activityLogs }) {
  const [clearedAt, setClearedAt] = useState(() => {
    return localStorage.getItem('activityClearedAt') || null;
  });

  const handleClearLogs = () => {
    const now = new Date().toISOString();
    setClearedAt(now);
    localStorage.setItem('activityClearedAt', now);
  };

  const visibleLogs = activityLogs.filter(
    (log) => !clearedAt || new Date(log.timestamp) > new Date(clearedAt)
  );

  const reversedActivities = [...visibleLogs].reverse().slice(0, 20);

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  return (
    <div className="vsc-panel">
      <div className="panel-header">
        <h3>Activity Logs</h3>
        <button 
          className="vsc-icon-btn" 
          onClick={handleClearLogs} 
          title="Clear Activity (Local Only)"
          style={{ width: 'auto', padding: '0 8px', fontSize: '12px', gap: '4px' }}
        >
          <Trash2 size={14} />
          Clear
        </button>
      </div>
      <div className="panel-content">
        <div className="activity-list" style={{ padding: '0 12px' }}>
          {reversedActivities.length === 0 ? (
            <div className="empty-state">No activity yet</div>
          ) : (
            reversedActivities.map((log) => (
              <div 
                className="activity-item" 
                key={log._id}
                style={{ 
                  margin: '8px 0', 
                  padding: '12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px'
                }}
              >
                <div className="activity-row">
                  <span
                    className="activity-color-bar"
                    style={{ 
                      backgroundColor: log.userColor || "#94a3b8",
                      width: '4px',
                      borderRadius: '2px'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="activity-message" style={{ fontSize: '13px', lineHeight: '1.4' }}>
                      {log.message}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', color: '#94a3b8' }}>
                      <Clock size={10} />
                      <small style={{ fontSize: '11px' }}>{formatTime(log.timestamp)}</small>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ActivityPanel;
