import React from 'react';
import { 
  Plus, 
  History, 
  ChevronDown, 
  Info, 
  BookOpen, 
  Globe, 
  Settings, 
  MessageSquare 
} from 'lucide-react';
import './Sidebar.css';

export const Sidebar = () => {
  return (
    <div className="sidebar-container">
      <div className="sidebar-top">
         <button className="new-chat-btn"><Plus size={14} /> Start new conversation</button>
         <div className="history-link"><History size={14} /> Chat History</div>

         <div className="section">
            <div className="section-header">
              <span>Workspaces</span>
              <span className="action-icon"><Plus size={14} /></span>
            </div>
            <div className="workspace-item section-expandable">
              <span>OrchIDE</span>
              <span className="chevron"><ChevronDown size={14} /></span>
            </div>
            <div className="conversation-item">
              <span className="title">Researching VS Code Ico...</span>
              <span className="time">8m</span>
            </div>
         </div>

         <div className="section">
            <div className="section-header">
              <span className="playground-header">Playground <span className="info-icon"><Info size={12} /></span></span>
              <span className="action-icon"><Plus size={14} /></span>
            </div>
            <div className="empty-state">No chats yet</div>
         </div>
      </div>
      <div className="sidebar-bottom">
        <a href="#" className="bottom-link"><BookOpen size={14} /> Knowledge</a>
        <a href="#" className="bottom-link"><Globe size={14} /> Browser</a>
        <a href="#" className="bottom-link"><Settings size={14} /> Settings</a>
        <a href="#" className="bottom-link"><MessageSquare size={14} /> Provide Feedback</a>
      </div>
    </div>
  );
};
