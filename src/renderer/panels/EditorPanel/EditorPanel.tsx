import React, { useEffect, useRef, useCallback, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { X, ChevronLeft, ChevronRight, FileText, Download, Search } from 'lucide-react';
import { useWorkspaceStore, OpenFile } from '../../store/workspaceStore';
import { useAgentStore } from '../../store/agentStore';
import './EditorPanel.css';

const orchide = (window as any).orchide;

const AUTOSAVE_DELAY = 700;

function getLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    css: 'css', html: 'html', json: 'json', md: 'markdown', py: 'python',
    rs: 'rust', go: 'go', sh: 'shell', yml: 'yaml', yaml: 'yaml',
    toml: 'toml', txt: 'plaintext', xml: 'xml', c: 'c', cpp: 'cpp',
    java: 'java', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
  };
  return map[ext] || 'plaintext';
}

export const EditorPanel: React.FC = () => {
  const { openFiles, activeFilePath, closeFile, setActiveFile, updateFileContent } = useWorkspaceStore();
  const { addFileChange } = useAgentStore();
  const saveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const activeFile = openFiles.find(f => f.path === activeFilePath) || null;

  const handleChange = useCallback((newContent: string | undefined, filePath: string) => {
    if (newContent === undefined) return;
    updateFileContent(filePath, newContent, true);

    // Clear previous timer and set new autosave
    const existing = saveTimers.current.get(filePath);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      const result = await orchide?.fs.writeFile(filePath, newContent);
      if (!result?.error) {
        updateFileContent(filePath, newContent, false);
      }
    }, AUTOSAVE_DELAY);
    saveTimers.current.set(filePath, t);
  }, [updateFileContent]);

  // Watcher integration: reload if file changed externally
  useEffect(() => {
    if (!orchide) return;
    orchide.watcher.onEvent(async (event: { type: string; path: string }) => {
      if (event.type === 'change') {
        const openFile = openFiles.find(f => f.path === event.path);
        if (openFile) {
          const result = await orchide.fs.readFile(event.path);
          if (result?.content !== null) {
            updateFileContent(event.path, result.content, false);
          }
        }
      }
    });
    return () => orchide.watcher.offEvent();
  }, [openFiles, updateFileContent]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      saveTimers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const monacoTheme = {
    base: 'vs-dark' as const,
    inherit: true,
    rules: [] as any[],
    colors: {
      'editor.background': '#1F1F1F',
      'editor.foreground': '#CCCCCC',
      'editorLineNumber.foreground': '#6E7681',
      'editorLineNumber.activeForeground': '#CCCCCC',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3A3D41',
      'editorCursor.foreground': '#AEAFAD',
      'editor.lineHighlightBackground': '#282828',
      'editorGroupHeader.tabsBackground': '#181818',
      'tab.activeBackground': '#1F1F1F',
      'tab.inactiveBackground': '#181818',
      'tab.activeBorderTop': '#0078D4',
      'tab.border': '#2B2B2B',
      'scrollbarSlider.background': '#4E4E4E88',
      'scrollbarSlider.hoverBackground': '#646464AA',
      'sideBar.background': '#181818',
    },
  };

  return (
    <div className="editor-container">
      <div className="editor-header">
        <div className="eh-left">
          <button className="eh-icon-btn" onClick={() => {
            const idx = activeFilePath ? openFiles.findIndex(f => f.path === activeFilePath) : -1;
            if (idx > 0) setActiveFile(openFiles[idx - 1].path);
          }}>
            <ChevronLeft size={15} />
          </button>
          <button className="eh-icon-btn" onClick={() => {
            const idx = activeFilePath ? openFiles.findIndex(f => f.path === activeFilePath) : -1;
            if (idx >= 0 && idx < openFiles.length - 1) setActiveFile(openFiles[idx + 1].path);
          }}>
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="eh-right">
          <button className="eh-icon-btn" onClick={() => setIsSearchOpen(!isSearchOpen)} title="Search (Cmd+F)">
            <Search size={13} />
          </button>
          {activeFile && (
            <button
              className="eh-icon-btn"
              title="Download file"
              onClick={() => {
                const blob = new Blob([activeFile.content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = activeFile.name; a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      {openFiles.length > 0 && (
        <div className="tab-bar">
          {openFiles.map(file => (
            <div
              key={file.path}
              className={`tab ${file.path === activeFilePath ? 'active' : ''}`}
              onClick={() => setActiveFile(file.path)}
              title={file.path}
            >
              <FileText size={11} className="tab-file-icon" />
              <span className="tab-name">{file.name}</span>
              {file.isDirty && <span className="tab-dot" />}
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); closeFile(file.path); }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="editor-content">
        {activeFile ? (
          <MonacoEditor
            key={activeFile.path}
            height="100%"
            language={activeFile.language || getLanguage(activeFile.name)}
            value={activeFile.content}
            theme="orch-dark"
            beforeMount={(monaco) => {
              monaco.editor.defineTheme('orch-dark', monacoTheme);
            }}
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
            onChange={(value) => handleChange(value, activeFile.path)}
          />
        ) : (
          <div className="editor-empty">
            <div className="editor-empty-icon">📄</div>
            <p>Open a file to start editing</p>
            <span>Click a file in the Explorer or click an artifact</span>
          </div>
        )}
      </div>
    </div>
  );
};
