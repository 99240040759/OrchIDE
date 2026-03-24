import React from 'react';
import { X, ChevronDown } from 'lucide-react';
import './SettingsWindow.css';

interface SettingsWindowProps {
  onClose: () => void;
}

export const SettingsWindow: React.FC<SettingsWindowProps> = ({ onClose }) => {
  return (
    <div className="settings-window">
      <div className="settings-titlebar">
        <div className="st-drag-area">Settings - Agent</div>
        <button className="st-close-btn" onClick={onClose} title="Close Settings">
          <X size={16} />
        </button>
      </div>
      <div className="settings-body">
        <div className="settings-sidebar">
          <div className="ss-nav">
            <div className="ss-item active">Agent</div>
            <div className="ss-item">Browser</div>
            <div className="ss-item">Notifications</div>
            <div className="ss-item">Models</div>
            <div className="ss-item">Customizations</div>
            <div className="ss-item">Tab</div>
            <div className="ss-item">Editor</div>
            <div className="ss-divider"></div>
            <div className="ss-item">Account</div>
          </div>
          <div className="ss-footer">
            <div className="ss-item">Provide Feedback</div>
          </div>
        </div>
        <div className="settings-content">
          
          <div className="sc-section">
            <div className="sc-section-title">SECURITY</div>
            <div className="sc-card">
              <div className="sc-card-info">
                <div className="sc-card-title">Strict Mode</div>
                <div className="sc-card-desc">When enabled, enforces settings that prevent the agent from autonomously running targeted exploits and requires human review for all agent actions. Visit antigravity.google/docs/strict-mode for details.</div>
              </div>
              <div className="sc-card-action">
                <div className="toggle-switch active"><div className="toggle-knob"></div></div>
              </div>
            </div>
          </div>

          <div className="sc-section">
            <div className="sc-section-title">ARTIFACT</div>
            <div className="sc-card">
              <div className="sc-card-info">
                <div className="sc-card-title">Review Policy</div>
                <div className="sc-card-desc">
                  Specifies Agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.<br/><br/>
                  • Always Proceeds - Agent never asks for review. This maximizes the autonomy of the Agent, but also has the highest risk of the Agent operating over unsafe or injected Artifact content.<br/>
                  • Agent Decides - Agent will decide when to ask for review based on task complexity and user preference.<br/>
                  • Asks for Review - Agent always asks for review.
                </div>
              </div>
              <div className="sc-card-action">
                <button className="dropdown-btn">Asks for Review <ChevronDown size={14}/></button>
              </div>
            </div>
          </div>

          <div className="sc-section">
            <div className="sc-section-title">TERMINAL</div>
            <div className="sc-card">
              <div className="sc-card-info">
                <div className="sc-card-title">Terminal Command Auto Execution</div>
                <div className="sc-card-desc">
                  • Always Proceed - Agent never asks for confirmation before executing terminal commands (except those in the Deny list). This provides the Agent with the maximum ability to operate over long periods without intervention, but also has the highest risk of an Agent executing an unsafe terminal command.<br/>
                  • Request Review - Agent always asks for confirmation before executing terminal commands (except those in the Allow list).
                </div>
              </div>
              <div className="sc-card-action">
                <button className="dropdown-btn">Request Review <ChevronDown size={14}/></button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
