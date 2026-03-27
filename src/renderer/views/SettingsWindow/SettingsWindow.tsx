import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Check, Eye, EyeOff, RefreshCw } from 'lucide-react';
import './SettingsWindow.css';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getOrchideAPI } from '../../utils/orchide';

interface SettingsWindowProps {
  onClose: () => void;
}

const orchide = getOrchideAPI();

export const SettingsWindow: React.FC<SettingsWindowProps> = ({ onClose }) => {
  const [activeNav, setActiveNav] = useState('Models');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [showNimKey, setShowNimKey] = useState(false);
  const [showTavilyKey, setShowTavilyKey] = useState(false);
  
  // Indexer state
  const { activeWorkspace, setWorkspace } = useWorkspaceStore();
  const [indexStatus, setIndexStatus] = useState<{
    isIndexing: boolean;
    progress: number;
    completed: number;
    total: number;
  }>({ isIndexing: false, progress: 0, completed: 0, total: 0 });

  useEffect(() => {
    // Sync active workspace from main process if not set
    if (!activeWorkspace) {
      orchide?.watcher.getActiveWorkspace().then((path: string | null) => {
        if (path) {
          const name = path.split(/[/\\]/).pop() || 'Workspace';
          setWorkspace({ path, name });
        }
      });
    }

    orchide?.settings.get().then((s: Record<string, string>) => setSettings(s || {}));
    
    if (activeWorkspace) {
      // Connect to indexer and start listener
      orchide?.indexer.connect(activeWorkspace.path).then((status: any) => {
         if (status.isIndexing) {
           setIndexStatus(prev => ({ ...prev, isIndexing: true }));
         }
      });

      const unsub = orchide?.indexer.subscribeProgress((data: any) => {
        if (data.workspacePath === activeWorkspace.path) {
          setIndexStatus({
            isIndexing: data.isIndexing,
            progress: data.progress,
            completed: data.completed,
            total: data.total
          });
        }
      });
      return unsub;
    }
  }, [activeWorkspace, setWorkspace]);

  const handleSave = async () => {
    await orchide?.settings.save(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const set = (key: string, val: string) => setSettings(prev => ({ ...prev, [key]: val }));

  return (
    <div className="settings-window">
      <div className="settings-titlebar">
        <div className="st-drag-area">Settings - OrchIDE</div>
        <button className="st-close-btn" onClick={onClose} title="Close Settings"><X size={16} /></button>
      </div>
      <div className="settings-body">
        <div className="settings-sidebar">
          <div className="ss-nav">
            {['Agent', 'Models', 'Browser', 'Workspace', 'Notifications', 'Customizations', 'Editor'].map(item => (
              <div key={item} className={`ss-item ${activeNav === item ? 'active' : ''}`} onClick={() => setActiveNav(item)}>{item}</div>
            ))}
            <div className="ss-divider" />
            <div className="ss-item" onClick={() => setActiveNav('Account')}>Account</div>
          </div>
          <div className="ss-footer">
            <div className="ss-item">Provide Feedback</div>
          </div>
        </div>

        <div className="settings-content">
          {activeNav === 'Models' && (
            <>
              <div className="sc-section">
                <div className="sc-section-title">NVIDIA NIM</div>
                <div className="sc-card">
                  <div className="sc-card-info">
                    <div className="sc-card-title">API Key</div>
                    <div className="sc-card-desc">Your NVIDIA NIM API key. Used to access models via the OpenAI-compatible NIM endpoint at integrate.api.nvidia.com.</div>
                    <div className="api-key-input-wrapper">
                      <input
                        type={showNimKey ? 'text' : 'password'}
                        className="api-key-input"
                        value={settings.NVIDIA_NIM_API_KEY || ''}
                        onChange={e => set('NVIDIA_NIM_API_KEY', e.target.value)}
                        placeholder="nvapi-..."
                        spellCheck={false}
                      />
                      <button className="key-toggle-btn" onClick={() => setShowNimKey(!showNimKey)}>
                        {showNimKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="sc-card">
                  <div className="sc-card-info">
                    <div className="sc-card-title">Model ID</div>
                    <div className="sc-card-desc">NVIDIA NIM model to use. Default: meta/llama-3.3-70b-instruct</div>
                    <input
                      type="text"
                      className="api-key-input"
                      value={settings.NVIDIA_NIM_MODEL || ''}
                      onChange={e => set('NVIDIA_NIM_MODEL', e.target.value)}
                      placeholder="meta/llama-3.3-70b-instruct"
                    />
                  </div>
                </div>
              </div>

              <div className="sc-section">
                <div className="sc-section-title">TAVILY WEB SEARCH</div>
                <div className="sc-card">
                  <div className="sc-card-info">
                    <div className="sc-card-title">API Key</div>
                    <div className="sc-card-desc">Tavily API key for web search. Used in both chat and agentic modes. Get your key at tavily.com.</div>
                    <div className="api-key-input-wrapper">
                      <input
                        type={showTavilyKey ? 'text' : 'password'}
                        className="api-key-input"
                        value={settings.TAVILY_API_KEY || ''}
                        onChange={e => set('TAVILY_API_KEY', e.target.value)}
                        placeholder="tvly-..."
                        spellCheck={false}
                      />
                      <button className="key-toggle-btn" onClick={() => setShowTavilyKey(!showTavilyKey)}>
                        {showTavilyKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="save-row">
                <button className={`save-btn ${saved ? 'saved' : ''}`} onClick={handleSave}>
                  {saved ? <><Check size={14} /> Saved!</> : 'Save Settings'}
                </button>
              </div>
            </>
          )}

          {activeNav === 'Agent' && (
            <>
              <div className="sc-section">
                <div className="sc-section-title">SECURITY</div>
                <div className="sc-card">
                  <div className="sc-card-info">
                    <div className="sc-card-title">Strict Mode</div>
                    <div className="sc-card-desc">When enabled, prevents the agent from autonomously making destructive file operations without confirmation.</div>
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
                    <div className="sc-card-desc">Controls when the agent asks for review before proceeding with major creation of artifacts and implementation plans.</div>
                  </div>
                  <div className="sc-card-action">
                    <button className="dropdown-btn">Agent Decides <ChevronDown size={14}/></button>
                  </div>
                </div>
              </div>
              <div className="sc-section">
                <div className="sc-section-title">TERMINAL</div>
                <div className="sc-card">
                  <div className="sc-card-info">
                    <div className="sc-card-title">Terminal Command Auto Execution</div>
                    <div className="sc-card-desc">Controls whether agent requires confirmation before running terminal commands.</div>
                  </div>
                  <div className="sc-card-action">
                    <button className="dropdown-btn">Request Review <ChevronDown size={14}/></button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeNav === 'Workspace' && (
            <>
              <div className="sc-section">
                <div className="sc-section-title">SEMANTIC INDEXING</div>
                <div className="sc-card">
                  <div className="sc-card-info">
                    <div className="sc-card-title">AST Semantic Cache</div>
                    <div className="sc-card-desc">
                      Indexing your workspace allows the agent to find definitions and symbols instantly.
                      {activeWorkspace ? ` Currently indexing: ${activeWorkspace.name}` : ' No workspace active.'}
                    </div>
                    
                    {activeWorkspace && (
                      <div className="index-progress-container">
                        <div className="index-stats">
                          <span>{indexStatus.isIndexing ? 'Indexing...' : 'Idle'}</span>
                          <span>{indexStatus.completed} / {indexStatus.total} files</span>
                        </div>
                        <div className="index-progress-bar-bg">
                          <div 
                            className="index-progress-bar-fill" 
                            style={{ width: `${indexStatus.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="sc-card-action">
                    <button 
                      className="action-btn" 
                      disabled={!activeWorkspace || indexStatus.isIndexing}
                      onClick={() => orchide?.indexer.reindex(activeWorkspace!.path)}
                    >
                      <RefreshCw size={14} className={indexStatus.isIndexing ? 'spin' : ''} />
                      Re-index
                    </button>
                  </div>
                </div>
              </div>

              <div className="sc-section">
                <div className="sc-section-title">DATABASE</div>
                <div className="sc-card">
                  <div className="sc-card-info">
                    <div className="sc-card-title">Storage Location</div>
                    <div className="sc-card-desc">Indexer data is stored in the `.orch` directory within your workspace.</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
