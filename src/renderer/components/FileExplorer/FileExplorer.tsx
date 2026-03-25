import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText, Plus, Trash2, Edit2, FolderPlus } from 'lucide-react';
import { useWorkspaceStore, FileEntry } from '../../store/workspaceStore';
import './FileExplorer.css';

const orchide = (window as any).orchide;

const FILE_ICON_MAP: Record<string, string> = {
  ts: '📄', tsx: '⚛️', js: '📜', jsx: '⚛️', css: '🎨', html: '🌐',
  json: '📋', md: '📝', py: '🐍', rs: '🦀', go: '🐹', sh: '💻',
  yml: 'yaml', yaml: '⚙️', toml: '⚙️', env: '🔒', gitignore: '🙈',
};

interface ContextMenu {
  x: number;
  y: number;
  entry: FileEntry;
}

export const FileExplorer: React.FC = () => {
  const { fileTree, activeWorkspace, refreshFileTree, openFile } = useWorkspaceStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const toggleDir = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleFileClick = async (entry: FileEntry) => {
    if (entry.isDir) {
      toggleDir(entry.path);
      return;
    }
    const result = await orchide?.fs.readFile(entry.path);
    if (result?.content !== null && result?.content !== undefined) {
      openFile({
        path: entry.path,
        name: entry.name,
        content: result.content,
        isDirty: false,
        language: getLanguage(entry.name),
      });
    }
  };

  const getLanguage = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      css: 'css', html: 'html', json: 'json', md: 'markdown', py: 'python',
      rs: 'rust', go: 'go', sh: 'shell', yml: 'yaml', yaml: 'yaml',
      toml: 'toml', txt: 'plaintext', xml: 'xml',
    };
    return langMap[ext] || 'plaintext';
  };

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const handleNewFile = async (dirPath: string) => {
    const name = 'newfile.ts';
    const fullPath = `${dirPath}/${name}`;
    await orchide?.fs.createFile(fullPath);
    await refreshFileTree();
    setExpanded(prev => new Set([...prev, dirPath]));
    setContextMenu(null);
  };

  const handleNewFolder = async (dirPath: string) => {
    const name = 'new-folder';
    const fullPath = `${dirPath}/${name}`;
    await orchide?.fs.createDir(fullPath);
    await refreshFileTree();
    setExpanded(prev => new Set([...prev, dirPath]));
    setContextMenu(null);
  };

  const handleDelete = async (entry: FileEntry) => {
    await orchide?.fs.delete(entry.path);
    await refreshFileTree();
    setContextMenu(null);
  };

  const startRename = (entry: FileEntry) => {
    setRenaming(entry.path);
    setRenameValue(entry.name);
    setContextMenu(null);
  };

  const commitRename = async (entry: FileEntry) => {
    if (!renameValue || renameValue === entry.name) {
      setRenaming(null);
      return;
    }
    const parentDir = entry.path.replace(/[/\\][^/\\]+$/, '');
    const newPath = `${parentDir}/${renameValue}`;
    await orchide?.fs.rename(entry.path, newPath);
    await refreshFileTree();
    setRenaming(null);
  };

  const renderEntry = (entry: FileEntry, depth = 0): React.ReactNode => {
    const isOpen = expanded.has(entry.path);
    const isRenaming = renaming === entry.path;
    const indent = depth * 12;

    return (
      <div key={entry.path}>
        <div
          className={`file-entry`}
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => handleFileClick(entry)}
          onContextMenu={(e) => handleContextMenu(e, entry)}
        >
          <span className="file-chevron">
            {entry.isDir ? (
              isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            ) : <span style={{ width: 12, display: 'inline-block' }} />}
          </span>
          <span className="file-type-icon">
            {entry.isDir
              ? (isOpen ? <FolderOpen size={13} className="icon-folder-open" /> : <Folder size={13} className="icon-folder" />)
              : <FileText size={13} className="icon-file" />
            }
          </span>
          {isRenaming ? (
            <input
              ref={renameRef}
              className="rename-input"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => commitRename(entry)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename(entry);
                if (e.key === 'Escape') setRenaming(null);
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="file-name">{entry.name}</span>
          )}
        </div>
        {entry.isDir && isOpen && entry.children && entry.children.map(c => renderEntry(c, depth + 1))}
      </div>
    );
  };

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.type === 'refresh') refreshFileTree();
    };
    window.addEventListener('watcher-refresh', handler);
    return () => window.removeEventListener('watcher-refresh', handler);
  }, [refreshFileTree]);

  return (
    <div className="file-explorer-root">
      <div className="file-tree">
        {fileTree.length === 0 ? (
          <div className="fe-empty">Loading...</div>
        ) : (
          fileTree.map(e => renderEntry(e))
        )}
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.entry.isDir && (
            <>
              <button onClick={() => handleNewFile(contextMenu.entry.path)}><Plus size={12} /> New File</button>
              <button onClick={() => handleNewFolder(contextMenu.entry.path)}><FolderPlus size={12} /> New Folder</button>
              <div className="ctx-divider" />
            </>
          )}
          <button onClick={() => startRename(contextMenu.entry)}><Edit2 size={12} /> Rename</button>
          <button className="danger" onClick={() => handleDelete(contextMenu.entry)}><Trash2 size={12} /> Delete</button>
        </div>
      )}
    </div>
  );
};
