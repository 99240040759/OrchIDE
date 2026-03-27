/**
 * FileExplorer component - File tree view with context menu actions
 * Uses VS Code icon CDN for proper file type icons
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '../../components/ui/Icon';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { getLanguageFromFilename } from '../../../shared/utils/languageUtils';
import type { FileEntry } from '../../../shared/types';
import { getOrchideAPI } from '../../utils/orchide';
import './FileExplorer.css';

const orchide = getOrchideAPI();

/**
 * Get file extension icon URL from VS Code CDN
 */
function getVSCodeIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseUrl = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@master/icons';

  const iconMap: Record<string, string> = {
    ts: 'file_type_typescript.svg',
    tsx: 'file_type_reactts.svg',
    js: 'file_type_js.svg',
    jsx: 'file_type_reactjs.svg',
    css: 'file_type_css.svg',
    html: 'file_type_html.svg',
    json: 'file_type_json.svg',
    md: 'file_type_markdown.svg',
    py: 'file_type_python.svg',
    rs: 'file_type_rust.svg',
    go: 'file_type_go.svg',
    java: 'file_type_java.svg',
    c: 'file_type_c.svg',
    cpp: 'file_type_cpp.svg',
    h: 'file_type_c.svg',
    svg: 'file_type_svg.svg',
    png: 'file_type_image.svg',
    jpg: 'file_type_image.svg',
    jpeg: 'file_type_image.svg',
    gif: 'file_type_image.svg',
    txt: 'file_type_text.svg',
    yml: 'file_type_yaml.svg',
    yaml: 'file_type_yaml.svg',
    xml: 'file_type_xml.svg',
    sh: 'file_type_shell.svg',
    bash: 'file_type_shell.svg',
  };

  const iconFile = iconMap[ext] || 'default_file.svg';
  return `${baseUrl}/${iconFile}`;
}

interface ContextMenu {
  x: number;
  y: number;
  entry: FileEntry;
}

export const FileExplorer: React.FC = () => {
  const fileTree = useWorkspaceStore(state => state.fileTree);
  const refreshFileTree = useWorkspaceStore(state => state.refreshFileTree);
  const openFile = useWorkspaceStore(state => state.openFile);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  // Close context menu on any click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  // Focus rename input when renaming starts
  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const toggleDir = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleFileClick = useCallback(async (entry: FileEntry) => {
    if (entry.isDir) {
      toggleDir(entry.path);
      return;
    }

    const result = await orchide?.fs.readFile(entry.path);
    if (result?.content != null) {
      openFile({
        path: entry.path,
        name: entry.name,
        content: result.content,
        isDirty: false,
        language: getLanguageFromFilename(entry.name),
      });
      useLayoutStore.getState().setEditorOpen(true);
    }
  }, [toggleDir, openFile]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleNewFile = useCallback(async (dirPath: string) => {
    const name = 'newfile.ts';
    const fullPath = `${dirPath}/${name}`;
    await orchide?.fs.createFile(fullPath);
    await refreshFileTree();
    setExpanded(prev => new Set([...prev, dirPath]));
    setContextMenu(null);
  }, [refreshFileTree]);

  const handleNewFolder = useCallback(async (dirPath: string) => {
    const name = 'new-folder';
    const fullPath = `${dirPath}/${name}`;
    await orchide?.fs.createDir(fullPath);
    await refreshFileTree();
    setExpanded(prev => new Set([...prev, dirPath]));
    setContextMenu(null);
  }, [refreshFileTree]);

  const handleDelete = useCallback(async (entry: FileEntry) => {
    await orchide?.fs.delete(entry.path);
    await refreshFileTree();
    setContextMenu(null);
  }, [refreshFileTree]);

  const startRename = useCallback((entry: FileEntry) => {
    setRenaming(entry.path);
    setRenameValue(entry.name);
    setContextMenu(null);
  }, []);

  const commitRename = useCallback(async (entry: FileEntry) => {
    if (!renameValue || renameValue === entry.name) {
      setRenaming(null);
      return;
    }
    const parentDir = entry.path.replace(/[/\\][^/\\]+$/, '');
    const newPath = `${parentDir}/${renameValue}`;
    await orchide?.fs.rename(entry.path, newPath);
    await refreshFileTree();
    setRenaming(null);
  }, [renameValue, refreshFileTree]);

  const renderEntry = (entry: FileEntry, depth = 0): React.ReactNode => {
    const isOpen = expanded.has(entry.path);
    const isRenaming = renaming === entry.path;
    const indent = depth * 12;

    return (
      <div key={entry.path}>
        <div
          className="file-entry"
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => handleFileClick(entry)}
          onContextMenu={(e) => handleContextMenu(e, entry)}
        >
          <span className="file-chevron">
            {entry.isDir ? (
              isOpen ? <Icon name="chevron-down" size={12} /> : <Icon name="chevron-right" size={12} />
            ) : (
              <span style={{ width: 12, display: 'inline-block' }} />
            )}
          </span>
          <span className="file-type-icon">
            {entry.isDir ? (
              isOpen ? (
                <Icon name="folder-opened" size={13} className="icon-folder-open" />
              ) : (
                <Icon name="folder" size={13} className="icon-folder" />
              )
            ) : (
              <img
                src={getVSCodeIcon(entry.name)}
                alt=""
                width={13}
                height={13}
                className="icon-file"
              />
            )}
          </span>
          {isRenaming ? (
            <input
              ref={renameRef}
              className="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(entry)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(entry);
                if (e.key === 'Escape') setRenaming(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="file-name">{entry.name}</span>
          )}
        </div>
        {entry.isDir && isOpen && entry.children?.map((c) => renderEntry(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="file-explorer-root">
      <div className="file-tree">
        {fileTree.length === 0 ? (
          <div className="fe-empty">Loading...</div>
        ) : (
          fileTree.map((e) => renderEntry(e))
        )}
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.entry.isDir && (
            <>
              <button onClick={() => handleNewFile(contextMenu.entry.path)}>
                <Icon name="add" size={12} /> New File
              </button>
              <button onClick={() => handleNewFolder(contextMenu.entry.path)}>
                <Icon name="new-folder" size={12} /> New Folder
              </button>
              <div className="ctx-divider" />
            </>
          )}
          <button onClick={() => startRename(contextMenu.entry)}>
            <Icon name="edit" size={12} /> Rename
          </button>
          <button className="danger" onClick={() => handleDelete(contextMenu.entry)}>
            <Icon name="trash" size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
};
