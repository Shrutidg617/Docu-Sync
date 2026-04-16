import React, { useState } from 'react';
import { History, Activity, Sparkles } from 'lucide-react';
import HistoryPanel from './HistoryPanel';
import ActivityPanel from './ActivityPanel';
import AISummaryPanel from './AISummaryPanel';

function Sidebar({
  snapshots,
  activityLogs,
  onRestoreSnapshot,
  restoringSnapshotId,
  setSelectedSnapshot,
  selectedSnapshot,
  onOpenReplay,
}) {
  const [activeTab, setActiveTab] = useState('history');

  return (
    <aside className="sidebar">
      <div className="vsc-icon-bar">
        <button 
          className={`vsc-icon-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          title="History"
        >
          <History size={20} />
        </button>
        <button 
          className={`vsc-icon-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
          title="Activity"
        >
          <Activity size={20} />
        </button>
        <button 
          className={`vsc-icon-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
          title="AI Summary"
        >
          <Sparkles size={20} />
        </button>
      </div>

      <div className="vsc-panel">
        {activeTab === 'history' && (
          <HistoryPanel 
            snapshots={snapshots}
            onRestoreSnapshot={onRestoreSnapshot}
            restoringSnapshotId={restoringSnapshotId}
            setSelectedSnapshot={setSelectedSnapshot}
            selectedSnapshot={selectedSnapshot}
            onOpenReplay={onOpenReplay}
          />
        )}
        {activeTab === 'activity' && (
          <ActivityPanel activityLogs={activityLogs} />
        )}
        {activeTab === 'ai' && (
          <AISummaryPanel snapshots={snapshots} />
        )}
      </div>
    </aside>
  );
}

export default Sidebar;