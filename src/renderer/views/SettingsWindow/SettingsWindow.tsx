/**
 * SettingsWindow — Uses shadcn Card + Input + Textarea + Button + Alert + Select + Progress + Separator
 * Converted from fixed full-screen overlay to a proper Dialog modal
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Progress } from '../../components/ui/progress';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Spinner } from '../../components/ui/spinner';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getOrchideAPI } from '../../utils/orchide';
import { cn } from '@/lib/utils';

const orchide = getOrchideAPI();

interface SettingsWindowProps { onClose: () => void; }

export const SettingsWindow: React.FC<SettingsWindowProps> = () => {
  const [activeNav,     setActiveNav]     = useState('Models');
  const [settings,      setSettings]      = useState<Record<string, string>>({});
  const [saved,         setSaved]         = useState(false);
  const [showNimKey,    setShowNimKey]    = useState(false);
  const [showTavilyKey, setShowTavilyKey] = useState(false);

  const { activeWorkspace, setWorkspace } = useWorkspaceStore();
  const [indexStatus, setIndexStatus] = useState<{
    isIndexing: boolean; progress: number; completed: number; total: number;
  }>({ isIndexing: false, progress: 0, completed: 0, total: 0 });

  useEffect(() => {
    if (!activeWorkspace) {
      orchide?.watcher.getActiveWorkspace().then((path: string | null) => {
        if (path) setWorkspace({ path, name: path.split(/[/\\]/).pop() || 'Workspace' });
      });
    }
    orchide?.settings.get().then((s: Record<string, string>) => setSettings(s || {}));
    if (activeWorkspace) {
      orchide?.indexer.connect(activeWorkspace.path).then((status: any) => {
        if (status.isIndexing !== undefined) {
          setIndexStatus({
            isIndexing: status.isIndexing,
            progress: status.progress || 0,
            completed: status.completed || 0,
            total: status.total || 0
          });
        }
      });
      const unsub = orchide?.indexer.subscribeProgress((data: any) => {
        if (data.workspacePath === activeWorkspace.path) {
          setIndexStatus({ isIndexing: data.isIndexing, progress: data.progress, completed: data.completed, total: data.total });
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

  const set = (key: string, val: string) => setSettings(p => ({ ...p, [key]: val }));

  const navItems = ['Models', 'Workspace', 'Account'];

  return (
    <div className="fixed inset-0 bg-orch-bg flex flex-col z-[1000] text-orch-fg">
      {/* Drag titlebar */}
      <div
        className="h-[35px] flex items-center justify-center border-b border-orch-border bg-orch-surface flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <img src="/logo.png" alt="OrchIDE" className="w-4 h-4 inline-block mr-2" />
        <span className="text-[13px] font-medium text-orch-fg">Settings — OrchIDE</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar nav */}
        <div className="w-[240px] border-r border-orch-border flex flex-col px-2 py-4 bg-orch-surface flex-shrink-0">
          <div className="flex flex-col gap-0.5">
            {navItems.map(item => (
              <button
                key={item}
                className={cn(
                  'px-3 py-2 text-[13px] rounded-md cursor-pointer font-medium text-left transition-colors border-none',
                  activeNav === item
                    ? 'bg-orch-hover text-orch-fg'
                    : 'bg-transparent text-orch-fg2 hover:text-orch-fg hover:bg-orch-hover',
                )}
                onClick={() => setActiveNav(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 px-[60px] py-10 bg-orch-bg overflow-y-auto">
          {activeNav === 'Models' && (
            <div className="max-w-[760px]">
              {/* Saved alert */}
              {saved && (
                <Alert className="mb-6 bg-orch-green/10 border-orch-green/30 text-orch-green">
                  <Icon name="pass" size={14} />
                  <AlertDescription>Settings saved successfully!</AlertDescription>
                </Alert>
              )}

              {/* NVIDIA NIM */}
              <SettingsSection title="NVIDIA NIM">
                <Card className="bg-orch-surface border-orch-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[14px] font-medium text-orch-fg">API Key</CardTitle>
                    <CardDescription className="text-[13px] text-orch-fg2 leading-[1.5]">
                      Your NVIDIA NIM API key for accessing models via the OpenAI-compatible endpoint at integrate.api.nvidia.com.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Password Input using shadcn Input in a wrapper */}
                    <div className="flex items-center bg-orch-input border border-orch-border2 rounded-md overflow-hidden transition-colors focus-within:border-orch-accent">
                      <Input
                        type={showNimKey ? 'text' : 'password'}
                        value={settings.NVIDIA_NIM_API_KEY || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('NVIDIA_NIM_API_KEY', e.target.value)}
                        placeholder="nvapi-..."
                        spellCheck={false}
                        className="border-none bg-transparent text-orch-fg font-mono ring-offset-0 focus-visible:ring-0 rounded-none"
                      />
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-orch-fg2 hover:text-orch-fg rounded-none rounded-r-md" onClick={() => setShowNimKey(!showNimKey)}>
                        <Icon name={showNimKey ? 'eye-closed' : 'eye'} size={14} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-orch-surface border-orch-border mt-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[14px] font-medium text-orch-fg">Model ID</CardTitle>
                    <CardDescription className="text-[13px] text-orch-fg2">NVIDIA NIM model identifier. Default: meta/llama-3.3-70b-instruct</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Input
                      type="text"
                      value={settings.NVIDIA_NIM_MODEL || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('NVIDIA_NIM_MODEL', e.target.value)}
                      placeholder="meta/llama-3.3-70b-instruct"
                      className="bg-orch-input border-orch-border2 text-orch-fg font-mono focus-visible:ring-orch-accent"
                    />
                  </CardContent>
                </Card>
              </SettingsSection>

              {/* Tavily */}
              <SettingsSection title="TAVILY WEB SEARCH">
                <Card className="bg-orch-surface border-orch-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[14px] font-medium text-orch-fg">API Key</CardTitle>
                    <CardDescription className="text-[13px] text-orch-fg2 leading-[1.5]">
                      Tavily API key for live web search in chat and agentic modes. Get yours at tavily.com.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center bg-orch-input border border-orch-border2 rounded-md overflow-hidden transition-colors focus-within:border-orch-accent">
                      <Input
                        type={showTavilyKey ? 'text' : 'password'}
                        value={settings.TAVILY_API_KEY || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('TAVILY_API_KEY', e.target.value)}
                        placeholder="tvly-..."
                        spellCheck={false}
                        className="border-none bg-transparent text-orch-fg font-mono ring-offset-0 focus-visible:ring-0 rounded-none"
                      />
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-orch-fg2 hover:text-orch-fg rounded-none rounded-r-md" onClick={() => setShowTavilyKey(!showTavilyKey)}>
                        <Icon name={showTavilyKey ? 'eye-closed' : 'eye'} size={14} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </SettingsSection>

              {/* Save */}
              <div className="flex justify-end mt-2">
                <Button
                  onClick={handleSave}
                  className={cn('gap-1.5', saved ? 'bg-orch-green hover:bg-orch-green' : 'bg-orch-accent hover:bg-orch-accent-hover')}
                >
                  {saved ? <><Icon name="pass" size={14} /> Saved!</> : 'Save Settings'}
                </Button>
              </div>
            </div>
          )}

          {activeNav === 'Workspace' && (
            <div className="max-w-[760px]">
              <SettingsSection title="SEMANTIC INDEXING">
                <Card className="bg-orch-surface border-orch-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-[14px] font-medium text-orch-fg">AST Semantic Cache</CardTitle>
                        <CardDescription className="text-[13px] text-orch-fg2 leading-[1.5] mt-1">
                          Indexing your workspace allows the agent to find definitions and symbols instantly.
                          {activeWorkspace ? ` Currently: ${activeWorkspace.name}` : ' No workspace active.'}
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0 border-orch-border2 bg-orch-input text-orch-fg hover:bg-orch-hover gap-1.5"
                        disabled={!activeWorkspace || indexStatus.isIndexing}
                        onClick={() => orchide?.indexer.reindex(activeWorkspace!.path)}
                      >
                        {indexStatus.isIndexing ? <Spinner size={13} /> : <Icon name="refresh" size={13} />}
                        Re-index
                      </Button>
                    </div>
                  </CardHeader>
                  {activeWorkspace && (
                    <CardContent>
                      <div className="bg-black/10 p-3 rounded-md border border-orch-border">
                        <div className="flex justify-between text-[11px] text-orch-fg2 mb-2 uppercase tracking-[0.5px]">
                          <span className="flex items-center gap-1.5">
                            {indexStatus.isIndexing && <Spinner size={11} />}
                            {indexStatus.isIndexing ? 'Indexing...' : 'Idle'}
                          </span>
                          <span>{indexStatus.completed} / {indexStatus.total} files</span>
                        </div>
                        <Progress
                          value={indexStatus.progress}
                          className="h-1 bg-orch-input [&>div]:bg-orch-accent [&>div]:transition-[width] [&>div]:duration-300"
                        />
                      </div>
                    </CardContent>
                  )}
                </Card>
              </SettingsSection>

              <SettingsSection title="DATABASE">
                <Card className="bg-orch-surface border-orch-border">
                  <CardHeader>
                    <CardTitle className="text-[14px] font-medium text-orch-fg">Storage Location</CardTitle>
                    <CardDescription className="text-[13px] text-orch-fg2 leading-[1.5]">
                      Indexer data is stored in the{' '}
                      <code className="bg-orch-border2/50 px-1 py-0.5 rounded text-[12px] font-mono">.orch</code>
                      {' '}directory within your workspace.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </SettingsSection>
            </div>
          )}

          {activeNav === 'Account' && (
            <div className="max-w-[760px]">
              <SettingsSection title="ACCOUNT">
                <Card className="bg-orch-surface border-orch-border">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-[14px] font-medium text-orch-fg">Status</CardTitle>
                      <Badge variant="outline" className="text-[10px] border-orch-border2 text-orch-fg2">Local Version</Badge>
                    </div>
                    <CardDescription className="text-[13px] text-orch-fg2 leading-[1.5]">
                      You're using the local version of OrchIDE. Pro features, cloud sync, and team collaboration are coming soon.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </SettingsSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-8">
    <div className="text-[11px] text-orch-fg2 font-semibold mb-3 tracking-[0.5px]">{title}</div>
    {children}
  </div>
);
