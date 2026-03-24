import React from 'react';
import { ChevronDown, CodeXml } from 'lucide-react';
import { InputBar } from '../InputBar/InputBar';
import './ChatPanel.css';

export const ChatPanel = () => {
  return (
    <div className="chatpanel-container">
      <div className="chatpanel-content">
        <h1 className="chatpanel-title">
          New conversation in <span className="workspace-name">OrchIDE <ChevronDown size={16} /></span>
        </h1>
        
        <InputBar />

        <div className="footer-links">
           <button className="text-btn"><CodeXml size={14} /> Open editor</button>
           <button className="text-btn">Use Playground</button>
        </div>
      </div>
    </div>
  );
};
