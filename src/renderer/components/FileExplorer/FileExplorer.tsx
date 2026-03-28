/**
 * FileExplorer — Uses shadcn ContextMenu (replaces hand-rolled fixed-div)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '../../components/ui/Icon';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '../../components/ui/context-menu';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { getLanguageFromFilename } from '../../../shared/utils/languageUtils';
import type { FileEntry } from '../../../shared/types';
import { getOrchideAPI } from '../../utils/orchide';
import { cn } from '@/lib/utils';

const orchide = getOrchideAPI();

function getVSCodeIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseUrl = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@master/icons';
  const iconMap: Record<string, string> = {
    ts: 'file_type_typescript.svg', tsx: 'file_type_reactts.svg',
    js: 'file_type_js.svg', jsx: 'file_type_reactjs.svg',
    css: 'file_type_css.svg', html: 'file_type_html.svg',
    json: 'file_type_json.svg', md: 'file_type_markdown.svg',
    py: 'file_type_python.svg', rs: 'file_type_rust.svg',
    go: 'file_type_go.svg', java: 'file_type_java.svg',
    c: 'file_type_c.svg', cpp: 'file_type_cpp.svg', h: 'file_type_c.svg',
    svg: 'file_type_svg.svg', png: 'file_type_image.svg',
    jpg: 'file_type_image.svg', jpeg: 'file_type_image.svg',
    txt: 'file_type_text.svg', yml: 'file_type_yaml.svg',
    yaml: 'file_type_yaml.svg', xml: 'file_type_xml.svg',
    sh: 'file_type_shell.svg', bash: 'file_type_shell.svg',
  };
  return `${baseUrl}/${iconMap[ext] || 'default_file.svg'}`;
}

export const FileExplorer: React.FC = () => {
  const fileTree        = useWorkspaceStore(state => state.fileTree);
  const refreshFileTree = useWorkspaceStore(state => state.refreshFileTree);
  const openFile        = useWorkspaceStore(state => state.openFile);

  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [renaming,    setRenaming]    = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const toggleDir = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  const handleFileClick = useCallback(async (entry: FileEntry) => {
    if (entry.isDir) { toggleDir(entry.path); return; }
    const result = await orchide?.fs.readFile(entry.path);
    if (result?.content != null) {
      openFile({ path: entry.path, name: entry.name, content: result.content, isDirty: false, language: getLanguageFromFilename(entry.name) });
      useLayoutStore.getState().setEditorOpen(true);
    }
  }, [toggleDir, openFile]);

  const handleNewFile   = useCallback(async (dirPath: string) => { await orchide?.fs.createFile(`${dirPath}/newfile.ts`); await refreshFileTree(); setExpanded(p => new Set([...p, dirPath])); }, [refreshFileTree]);
  const handleNewFolder = useCallback(async (dirPath: string) => { await orchide?.fs.createDir(`${dirPath}/new-folder`); await refreshFileTree(); setExpanded(p => new Set([...p, dirPath])); }, [refreshFileTree]);
  const handleDelete    = useCallback(async (entry: FileEntry) => { await orchide?.fs.delete(entry.path); await refreshFileTree(); }, [refreshFileTree]);

  const startRename = useCallback((entry: FileEntry) => { setRenaming(entry.path); setRenameValue(entry.name); }, []);

  const commitRename = useCallback(async (entry: FileEntry) => {
    if (!renameValue || renameValue === entry.name) { setRenaming(null); return; }
    const parentDir = entry.path.replace(/[/\\][^/\\]+$/, '');
    await orchide?.fs.rename(entry.path, `${parentDir}/${renameValue}`);
    await refreshFileTree();
    setRenaming(null);
  }, [renameValue, refreshFileTree]);

  const renderEntry = (entry: FileEntry, depth = 0): React.ReactNode => {
    const isOpen     = expanded.has(entry.path);
    const isRenaming = renaming === entry.path;

    return (
      <ContextMenu key={entry.path}>
        <ContextMenuTrigger asChild>
          <div>
            <div
              className="flex items-center gap-1 py-[3px] pr-2 cursor-pointer rounded transition-colors hover:bg-orch-hover overflow-hidden whitespace-nowrap min-w-0 w-full"
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              onClick={() => handleFileClick(entry)}
            >
              <span className="flex items-center flex-shrink-0 text-orch-fg2">
                {entry.isDir
                  ? isOpen ? <Icon name="chevron-down" size={12} /> : <Icon name="chevron-right" size={12} />
                  : <span style={{ width: 12, display: 'inline-block' }} />
                }
              </span>
              <span className="flex items-center flex-shrink-0">
                {entry.isDir
                  ? isOpen
                    ? <Icon name="folder-opened" size={13} className="text-orch-folder" />
                    : <Icon name="folder" size={13} className="text-orch-folder" />
                  : <img src={getVSCodeIcon(entry.name)} alt="" width={13} height={13} />
                }
              </span>
              {isRenaming ? (
                <input
                  ref={renameRef}
                  className="flex-1 bg-orch-input border border-orch-accent text-orch-fg text-[12px] font-[inherit] px-1 py-px rounded outline-none min-w-0"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(entry)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(entry); if (e.key === 'Escape') setRenaming(null); }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 overflow-hidden text-ellipsis text-orch-fg text-[12px] min-w-0">{entry.name}</span>
              )}
            </div>
            {entry.isDir && isOpen && entry.children?.map(c => renderEntry(c, depth + 1))}
          </div>
        </ContextMenuTrigger>

        {/* shadcn ContextMenu — replaces hand-rolled fixed-div entirely */}
        <ContextMenuContent className="bg-orch-bg border-orch-border text-orch-fg text-[12px] min-w-[150px] p-1">
          {entry.isDir && (
            <>
              <ContextMenuItem
                className="flex items-center gap-2 px-2.5 py-[5px] rounded cursor-pointer hover:bg-orch-hover text-orch-fg"
                onSelect={() => handleNewFile(entry.path)}
              >
                <Icon name="add" size={12} /> New File
              </ContextMenuItem>
              <ContextMenuItem
                className="flex items-center gap-2 px-2.5 py-[5px] rounded cursor-pointer hover:bg-orch-hover text-orch-fg"
                onSelect={() => handleNewFolder(entry.path)}
              >
                <Icon name="new-folder" size={12} /> New Folder
              </ContextMenuItem>
              <ContextMenuSeparator className="bg-orch-border my-1" />
            </>
          )}
          <ContextMenuItem
            className="flex items-center gap-2 px-2.5 py-[5px] rounded cursor-pointer hover:bg-orch-hover text-orch-fg"
            onSelect={() => startRename(entry)}
          >
            <Icon name="edit" size={12} /> Rename
          </ContextMenuItem>
          <ContextMenuItem
            className="flex items-center gap-2 px-2.5 py-[5px] rounded cursor-pointer text-orch-red hover:bg-[rgba(248,81,73,0.15)]"
            onSelect={() => handleDelete(entry)}
          >
            <Icon name="trash" size={12} /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div className="text-[12px] text-orch-fg select-none w-full min-w-0 overflow-x-hidden">
      {fileTree.length === 0
        ? <div className="px-3 py-2 text-orch-fg2">Loading...</div>
        : fileTree.map(e => renderEntry(e))
      }
    </div>
  );
};
