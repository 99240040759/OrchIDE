import React from 'react';
import { 
  ExternalLink, 
  Info, 
  CheckCircle2, 
  Circle, 
  FileText, 
  ListTodo 
} from 'lucide-react';
import './RightSidebar.css';

export const RightSidebar = () => {
  return (
    <div className="right-sidebar-container">
      <div className="rs-section">
        <div className="rs-header">
          <span>Progress</span>
          <ExternalLink size={12} className="header-icon" />
        </div>
        <div className="rs-item text-muted">
          <Circle size={14} className="item-icon" />
          <span className="item-text">Research VS Code default file icon theme</span>
        </div>
        <div className="rs-item text-muted">
          <CheckCircle2 size={14} className="item-icon accent" />
          <span className="item-text">Document findings in research artifact</span>
        </div>
        <div className="rs-item text-muted">
          <CheckCircle2 size={14} className="item-icon accent" />
          <span className="item-text">Communicate findings to the user</span>
        </div>
      </div>

      <div className="rs-section">
        <div className="rs-header">
          <span>Artifacts</span>
          <Info size={12} className="header-icon" />
        </div>
        <div className="rs-item">
          <FileText size={14} className="item-icon" />
          <span className="item-text bold">Icon Research</span>
        </div>
        <div className="rs-item">
          <ListTodo size={14} className="item-icon accent" />
          <span className="item-text bold">Task</span>
        </div>
      </div>

      <div className="rs-section">
        <div className="rs-header">
          <span>Files Changed</span>
        </div>
        <div className="rs-item text-muted">
          <span className="item-text">No file changes</span>
        </div>
      </div>
    </div>
  );
};
