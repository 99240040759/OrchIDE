import React from 'react';
import { ChevronLeft, ChevronRight, FileText, Download, Search, X, ChevronDown } from 'lucide-react';
import './EditorPanel.css';

export const EditorPanel = () => {
  return (
    <div className="editor-container">
      <div className="editor-header">
        <div className="eh-left">
          <button className="eh-icon-btn"><ChevronLeft size={16} /></button>
          <button className="eh-icon-btn"><ChevronRight size={16} /></button>
          <div className="eh-title-group">
            <FileText size={14} className="eh-file-icon" />
            <span className="eh-title">Untitled</span>
          </div>
        </div>
        <div className="eh-right">
          <button className="eh-review-btn">Review <ChevronDown size={14} /></button>
          <button className="eh-icon-btn"><Download size={14} /></button>
          <button className="eh-icon-btn"><Search size={14} /></button>
          <button className="eh-icon-btn"><X size={14} /></button>
        </div>
      </div>
      <div className="editor-content">
         <p>No file open</p>
      </div>
    </div>
  );
};
