/**
 * EditorPanel — Refactored to use shadcn/ui Tabs + ScrollArea
 * Now using useDebouncedCallback for cleaner autosave implementation
 */

import React, { useEffect, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import MonacoEditor from '@monaco-editor/react';
import { Icon } from '../../components/ui/Icon';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { ScrollArea, ScrollBar } from '../../components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getLanguageFromFilename } from '../../../shared/utils/languageUtils';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { getOrchideAPI } from '../../utils/orchide';
import { cn } from '@/lib/utils';

const orchide = getOrchideAPI();
const AUTOSAVE_DELAY = 700;

const monacoTheme = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [] as any[],
  colors: {
    'editor.background':                  '#1F1F1F',
    'editor.foreground':                  '#CCCCCC',
    'editorLineNumber.foreground':        '#6E7681',
    'editorLineNumber.activeForeground':  '#CCCCCC',
    'editor.selectionBackground':         '#264F78',
    'editor.inactiveSelectionBackground': '#3A3D41',
    'editorCursor.foreground':            '#AEAFAD',
    'editor.lineHighlightBackground':     '#282828',
    'editorGroupHeader.tabsBackground':   '#181818',
    'tab.activeBackground':               '#1F1F1F',
    'tab.inactiveBackground':             '#181818',
    'tab.activeBorderTop':                '#0078D4',
    'tab.border':                         '#2B2B2B',
    'scrollbarSlider.background':         '#4E4E4E88',
    'scrollbarSlider.hoverBackground':    '#646464AA',
    'sideBar.background':                 '#181818',
  },
};

export const EditorPanel: React.FC = () => {
  const openFiles         = useWorkspaceStore(state => state.openFiles);
  const activeFilePath    = useWorkspaceStore(state => state.activeFilePath);
  const closeFile         = useWorkspaceStore(state => state.closeFile);
  const setActiveFile     = useWorkspaceStore(state => state.setActiveFile);
  const updateFileContent = useWorkspaceStore(state => state.updateFileContent);

  const activeFile     = openFiles.find(f => f.path === activeFilePath) || null;

  /**
   * Debounced file save handler
   * Uses use-debounce for clean, declarative debouncing
   */
  const debouncedSave = useDebouncedCallback(
    async (filePath: string, content: string) => {
      const result = await orchide?.fs.writeFile(filePath, content);
      if (!result?.error) {
        // Mark file as saved (not dirty)
        useWorkspaceStore.getState().updateFileContent(filePath, content, false);
      } else {
        console.error('[EditorPanel] Failed to save file:', result?.error);
      }
    },
    AUTOSAVE_DELAY
  );

  /**
   * Handle editor content changes
   * Updates store immediately and triggers debounced save
   */
  const handleChange = useCallback((newContent: string | undefined, filePath: string) => {
    if (newContent === undefined) return;
    
    // Update store immediately (marks file as dirty)
    updateFileContent(filePath, newContent, true);
    
    // Trigger debounced save
    debouncedSave(filePath, newContent);
  }, [updateFileContent, debouncedSave]);

  /**
   * Cleanup: Cancel pending saves on unmount
   */
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  const handleDownload = useCallback(() => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = activeFile.name; a.click();
    URL.revokeObjectURL(url);
  }, [activeFile]);

  if (openFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-orch-fg2 gap-3">
        <div className="text-4xl opacity-20">📄</div>
        <p className="text-[14px] text-orch-fg2">Open a file to start editing</p>
        <span className="text-[12px] opacity-50">Click a file in the Explorer or an artifact</span>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <Tabs
        value={activeFilePath || ''}
        onValueChange={setActiveFile}
        className="flex flex-col flex-1 h-full overflow-hidden"
      >
        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <div className="flex items-center h-9 border-b border-orch-border bg-orch-surface flex-shrink-0 px-1">
          <ScrollArea className="flex-1" style={{ overflowX: 'auto' }}>
            <TabsList className="flex h-full items-end gap-0 bg-transparent p-0 w-max rounded-none">
              {openFiles.map(file => (
                <TabsTrigger
                  key={file.path}
                  value={file.path}
                  className={cn(
                    'group flex items-center gap-1.5 px-2.5 h-[34px] rounded-none border-t-2 border-t-transparent',
                    'text-[12px] text-orch-fg2 data-[state=active]:text-orch-fg',
                    'data-[state=active]:bg-orch-bg data-[state=active]:border-t-orch-accent',
                    'data-[state=inactive]:bg-transparent hover:bg-white/[0.04] hover:text-orch-fg',
                    'border-r border-orch-border shadow-none max-w-[160px]',
                  )}
                >
                  <Icon name="file" size={11} className="flex-shrink-0" />
                  <span className="truncate max-w-[100px]">{file.name}</span>
                  {file.isDirty && <span className="w-[5px] h-[5px] bg-orch-accent rounded-full flex-shrink-0" />}
                  <button
                    className="ml-0.5 p-px rounded opacity-0 group-hover:opacity-100 hover:text-orch-red text-orch-fg2 transition-opacity"
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); closeFile(file.path); }}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Nav actions */}
          <div className="flex items-center gap-1 px-2 flex-shrink-0">
            {activeFile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleDownload}
                    className="flex items-center justify-center px-1.5 py-1 rounded text-orch-fg2 bg-transparent border-none cursor-pointer transition-colors hover:text-orch-fg hover:bg-white/[0.06]"
                  >
                    <Icon name="desktop-download" size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Download file</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ── Tab panels ──────────────────────────────────────────────── */}
        {openFiles.map(file => {
          const lang = file.language || getLanguageFromFilename(file.name);
          const isMd = lang === 'markdown';
          return (
            <TabsContent
              key={file.path}
              value={file.path}
              className="flex-1 overflow-hidden m-0 p-0 data-[state=inactive]:hidden"
            >
              {isMd ? (
                <ScrollArea className="h-full">
                  <div className="py-[22px] px-[26px]">
                    <MarkdownRenderer content={file.content} className="max-w-[920px] mx-auto" />
                  </div>
                </ScrollArea>
              ) : (
                <MonacoEditor
                  key={file.path}
                  height="100%"
                  language={lang}
                  value={file.content}
                  theme="orch-dark"
                  beforeMount={monaco => { monaco.editor.defineTheme('orch-dark', monacoTheme); }}
                  options={{
                    fontSize: 13,
                    fontFamily: "'Cascadia Code', 'Fira Code', 'Cascadia Mono', Menlo, 'DejaVu Sans Mono', Consolas, monospace",
                    fontLigatures: true,
                    minimap: { enabled: true, scale: 1 },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    renderLineHighlight: 'line',
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    smoothScrolling: true,
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    renderWhitespace: 'selection',
                    padding: { top: 12, bottom: 12 },
                    suggest: { showKeywords: true, showSnippets: true },
                    tabSize: 2,
                    insertSpaces: true,
                    automaticLayout: true,
                  }}
                  onChange={value => handleChange(value, file.path)}
                />
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </TooltipProvider>
  );
};
