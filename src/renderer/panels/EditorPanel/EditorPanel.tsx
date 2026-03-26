/**
 * EditorPanel component - Monaco code editor with tabs
 * File watching for external changes is handled centrally in index.tsx
 */

import React, { useEffect, useRef, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { X, ChevronLeft, ChevronRight, FileText, Download } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getLanguageFromFilename } from '../../../shared/utils/languageUtils';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import './EditorPanel.css';

const orchide = (window as any).orchide;

const AUTOSAVE_DELAY = 700;

/** Track pending saves with version numbers to prevent race conditions */
interface PendingSave {
  content: string;
  version: number;
}

export const EditorPanel: React.FC = () => {
  const openFiles = useWorkspaceStore(state => state.openFiles);
  const activeFilePath = useWorkspaceStore(state => state.activeFilePath);
  const closeFile = useWorkspaceStore(state => state.closeFile);
  const setActiveFile = useWorkspaceStore(state => state.setActiveFile);
  const updateFileContent = useWorkspaceStore(state => state.updateFileContent);

  const saveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingContent = useRef<Map<string, PendingSave>>(new Map());
  const savedVersions = useRef<Map<string, number>>(new Map());

  const activeFile = openFiles.find(f => f.path === activeFilePath) || null;
  const activeLanguage = activeFile
    ? (activeFile.language || getLanguageFromFilename(activeFile.name))
    : 'plaintext';
  const isMarkdownPreview = !!activeFile && activeLanguage === 'markdown';

  // Handle content change with debounced autosave and version tracking
  const handleChange = useCallback((newContent: string | undefined, filePath: string) => {
    if (newContent === undefined) return;

    // Increment version for this file
    const currentVersion = (pendingContent.current.get(filePath)?.version ?? 0) + 1;
    pendingContent.current.set(filePath, { content: newContent, version: currentVersion });

    // Update UI immediately (mark as dirty)
    updateFileContent(filePath, newContent, true);

    // Clear previous timer and set new autosave
    const existing = saveTimers.current.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      const pending = pendingContent.current.get(filePath);
      if (!pending) return;

      const { content: contentToSave, version: saveVersion } = pending;

      const result = await orchide?.fs.writeFile(filePath, contentToSave);
      if (!result?.error) {
        // Only mark as clean if no newer version exists
        const latestPending = pendingContent.current.get(filePath);
        if (latestPending && latestPending.version === saveVersion) {
          useWorkspaceStore.getState().updateFileContent(filePath, contentToSave, false);
          savedVersions.current.set(filePath, saveVersion);
          pendingContent.current.delete(filePath);
        }
        // If version changed, another save is already queued
      }
    }, AUTOSAVE_DELAY);

    saveTimers.current.set(filePath, timer);
  }, [updateFileContent]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      saveTimers.current.forEach(t => clearTimeout(t));
      saveTimers.current.clear();
      pendingContent.current.clear();
    };
  }, []);

  // Navigation handlers
  const goToPreviousFile = useCallback(() => {
    const idx = activeFilePath ? openFiles.findIndex(f => f.path === activeFilePath) : -1;
    if (idx > 0) {
      setActiveFile(openFiles[idx - 1].path);
    }
  }, [activeFilePath, openFiles, setActiveFile]);

  const goToNextFile = useCallback(() => {
    const idx = activeFilePath ? openFiles.findIndex(f => f.path === activeFilePath) : -1;
    if (idx >= 0 && idx < openFiles.length - 1) {
      setActiveFile(openFiles[idx + 1].path);
    }
  }, [activeFilePath, openFiles, setActiveFile]);

  // Download handler
  const handleDownload = useCallback(() => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeFile]);

  // Monaco theme configuration
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
          <button className="eh-icon-btn" onClick={goToPreviousFile} title="Previous file">
            <ChevronLeft size={15} />
          </button>
          <button className="eh-icon-btn" onClick={goToNextFile} title="Next file">
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="eh-right">
          {activeFile && (
            <button className="eh-icon-btn" title="Download file" onClick={handleDownload}>
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
          isMarkdownPreview ? (
            <div className="editor-markdown-preview">
              <MarkdownRenderer
                content={activeFile.content}
                className="editor-markdown-content"
              />
            </div>
          ) : (
            <MonacoEditor
              key={activeFile.path}
              height="100%"
              language={activeLanguage}
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
          )
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
