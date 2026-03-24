import React from 'react';
import { Plus, ChevronDown, Mic, ArrowRight } from 'lucide-react';
import './InputBar.css';

export const InputBar = () => {
  return (
    <div className="input-container">
      <input 
        type="text" 
        placeholder="Ask anything, @ to mention, / for workflows" 
        className="main-input"
      />
      <div className="input-actions">
        <button className="action-btn"><Plus size={14} /></button>
        <button className="action-btn pill"><ChevronDown size={14} /> Planning</button>
        <button className="action-btn pill"><ChevronDown size={14} /> Gemini 3 Flash</button>
        <div className="right-actions">
           <button className="action-btn"><Mic size={14} /></button>
           <button className="action-btn send-btn"><ArrowRight size={14} /></button>
        </div>
      </div>
    </div>
  );
};
