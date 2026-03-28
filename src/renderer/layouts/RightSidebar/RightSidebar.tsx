/**
 * RightSidebar — Uses shadcn Progress + Spinner + Collapsible + Badge + ScrollArea
 */

import React, { useCallback } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Progress } from '../../components/ui/progress';
import { Spinner } from '../../components/ui/spinner';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible';
import { Separator } from '../../components/ui/separator';
import { useAgentStore } from '../../store/agentStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useLayoutStore } from '../../store/layoutStore';
import { getOrchideAPI } from '../../utils/orchide';
import { cn } from '@/lib/utils';

const ARTIFACT_ICONS: Record<string, string> = {
  Map: 'git-pull-request', BookOpen: 'book', ListTodo: 'checklist', FileText: 'file',
};

const orchide = getOrchideAPI();

export const RightSidebar: React.FC = () => {
  const taskTitle  = useAgentStore(state => state.taskTitle);
  const taskItems  = useAgentStore(state => state.taskItems);
  const artifacts  = useAgentStore(state => state.artifacts);
  const agentState = useAgentStore(state => state.agentState);
  const openFile   = useWorkspaceStore(state => state.openFile);

  const completedCount = taskItems.filter(t => t.status === 'done').length;
  const totalCount     = taskItems.length;
  const progressPct    = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const openArtifact = useCallback(async (filePath: string, name: string) => {
    if (!orchide) return;
    const result = await orchide.fs.readFile(filePath);
    if (result?.content != null) {
      openFile({ path: filePath, name, content: result.content, isDirty: false, language: 'markdown' });
      useLayoutStore.getState().setEditorOpen(true);
    }
  }, [openFile]);

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col p-3.5 text-orch-fg text-[12px] gap-0">

        {/* Agent state badge */}
        {agentState !== 'idle' && (
          <div className="mb-3">
            {agentState === 'generating' && (
              <Badge variant="outline" className="flex items-center gap-1.5 px-2.5 py-2 bg-[rgba(59,130,246,0.08)] border-orch-accent/20 text-orch-accent text-[11px] font-medium rounded-md w-full justify-start">
                <Spinner size={12} /> Agent working…
              </Badge>
            )}
            {agentState === 'error' && (
              <Badge variant="outline" className="flex items-center gap-1.5 px-2.5 py-2 bg-[rgba(248,81,73,0.08)] border-orch-red/20 text-orch-red text-[11px] font-medium rounded-md w-full justify-start">
                <span className="text-[8px]">●</span> Agent error
              </Badge>
            )}
          </div>
        )}

        {/* Task Progress — Collapsible section */}
        <Collapsible defaultOpen>
          {/* min-w-0 on the trigger lets the title truncate instead of expanding the row */}
          <CollapsibleTrigger className="flex items-center gap-1.5 w-full mb-2.5 text-[10px] font-bold uppercase tracking-[0.5px] text-orch-fg opacity-70 hover:opacity-100 transition-opacity min-w-0">
            <span className="flex-1 min-w-0 truncate text-left">{taskTitle || 'Progress'}</span>
            <Icon name="link-external" size={12} className="flex-shrink-0" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {taskItems.length === 0 ? (
              <div className="text-orch-fg2 text-[11px] py-0.5 italic">No active task</div>
            ) : (
              <>
                {totalCount > 0 && (
                  <div className="relative mb-4">
                    <Progress value={progressPct} className="h-[3px] bg-orch-hover [&>div]:bg-orch-accent" />
                    <span className="absolute right-0 -top-4 text-[9px] text-orch-fg2 font-semibold">
                      {completedCount}/{totalCount}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  {taskItems.map(item => (
                    <div
                      key={item.id}
                      className={cn('flex items-start gap-[7px] leading-[1.4] min-w-0', item.depth === 1 && 'pl-3.5', item.depth >= 2 && 'pl-6')}
                    >
                      {item.status === 'done'        && <Icon name="pass"           size={13} className="text-orch-green mt-px flex-shrink-0" />}
                      {item.status === 'in-progress' && <Spinner size={13} className="text-orch-accent mt-px flex-shrink-0" />}
                      {item.status === 'todo'        && <Icon name="circle-outline" size={13} className="opacity-50 mt-px flex-shrink-0" />}
                      <span className={cn('flex-1 min-w-0 text-orch-fg2 text-[12px] truncate', item.status === 'done' && 'line-through opacity-50')}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator className="my-4" />

        {/* Artifacts — Collapsible section */}
        <Collapsible defaultOpen>
          {/* min-w-0 on the trigger lets the title truncate instead of expanding the row */}
          <CollapsibleTrigger className="flex items-center gap-1.5 w-full mb-2.5 text-[10px] font-bold uppercase tracking-[0.5px] text-orch-fg opacity-70 hover:opacity-100 transition-opacity min-w-0">
            <span className="flex-1 min-w-0 truncate text-left">Artifacts</span>
            <Icon name="info" size={12} className="flex-shrink-0" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {artifacts.length === 0 ? (
              <div className="text-orch-fg2 text-[11px] py-0.5 italic">No artifacts yet</div>
            ) : (
              artifacts.map(artifact => (
                <div
                  key={artifact.id}
                  className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-md border border-transparent cursor-pointer transition-colors hover:bg-orch-hover hover:border-orch-border min-w-0"
                  onClick={() => openArtifact(artifact.filePath, artifact.name)}
                  title={artifact.filePath}
                >
                  <Icon name={ARTIFACT_ICONS[artifact.icon] || 'file'} size={14} className="text-orch-accent flex-shrink-0" />
                  {/* flex-1 min-w-0 here is the key: forces this column to shrink so the icon above is always visible */}
                  <div className="flex flex-col gap-px flex-1 min-w-0">
                    <span className="font-medium text-orch-fg text-[12px] truncate">{artifact.name}</span>
                    <span className="text-[10px] text-orch-fg2 capitalize truncate">{artifact.type.replace('_', ' ')}</span>
                  </div>
                </div>
              ))
            )}
          </CollapsibleContent>
        </Collapsible>

      </div>
    </ScrollArea>
  );
};
