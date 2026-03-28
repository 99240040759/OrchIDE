/**
 * InputBar — Uses shadcn Textarea + Button + Tooltip + Kbd
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Kbd } from '../../components/ui/kbd';
import { v4 as uuidv4 } from 'uuid';
import { useChatStore } from '../../store/chatStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getOrchideAPI } from '../../utils/orchide';
import { cn } from '@/lib/utils';

const orchide = getOrchideAPI();

export const InputBar: React.FC = () => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sessionId   = useChatStore(state => state.sessionId);
  const isStreaming = useChatStore(state => state.isStreaming);
  const addMessage  = useChatStore(state => state.addMessage);

  const activeWorkspace = useWorkspaceStore(state => state.activeWorkspace);
  const mode            = useWorkspaceStore(state => state.mode);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [value]);

  const handleSend = useCallback(async () => {
    const msg = value.trim();
    if (!msg || isStreaming) return;
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    const userMsg = { id: uuidv4(), role: 'user' as const, content: msg, timestamp: Date.now() };
    addMessage(userMsg);
    try {
      await orchide?.agent.send({
        sessionId,
        message: msg,
        mode: mode as 'chat' | 'agentic',
        workspacePath: activeWorkspace?.path,
        workspaceName: activeWorkspace?.name,
      });
    } catch (error) {
      console.error('[InputBar] Failed to send message:', error);
    }
  }, [value, isStreaming, sessionId, mode, activeWorkspace, addMessage]);

  const handleStop = useCallback(async () => {
    if (orchide && sessionId) await orchide.agent.cancel(sessionId);
    useChatStore.getState().finalizeStream();
  }, [sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          'relative w-full bg-orch-input border border-orch-border2 rounded-[10px] px-3.5 py-3',
          'flex flex-col gap-3 cursor-text transition-colors',
          'focus-within:border-orch-accent',
          isStreaming && 'input-generating',
        )}
        onClick={() => textareaRef.current?.focus()}
      >
        {/* shadcn Textarea — replaces raw <textarea> */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            activeWorkspace
              ? `Ask the agent to work on ${activeWorkspace.name}...`
              : 'Ask anything, or explore ideas...'
          }
          className={cn(
            'bg-transparent border-none text-orch-fg text-[14px] outline-none font-[inherit]',
            'w-full resize-none leading-[1.5] min-h-[20px] max-h-[160px] overflow-y-auto p-0',
            'ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none',
            'placeholder:text-orch-fg2/60',
            isStreaming && 'cursor-not-allowed opacity-70',
          )}
          rows={1}
          disabled={isStreaming}
        />

        <div className="flex items-center gap-1.5">
          <div className="ml-auto flex gap-1.5 items-center">
            {/* Keyboard shortcut hint */}
            {value.trim() && !isStreaming && (
              <div className="hidden sm:flex items-center gap-1 text-orch-fg2 opacity-60">
                <Kbd className="text-[10px] border-orch-border2 bg-orch-hover text-orch-fg2">↵</Kbd>
                <span className="text-[11px]">to send</span>
              </div>
            )}

            {isStreaming ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full w-7 h-7 bg-[rgba(248,81,73,0.15)] text-orch-red hover:bg-[rgba(248,81,73,0.25)] hover:text-orch-red"
                    onClick={handleStop}
                  >
                    <Icon name="debug-stop" size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Stop generation</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'rounded-full w-7 h-7 transition-colors',
                      value.trim()
                        ? 'bg-orch-accent text-white hover:bg-orch-accent-hover'
                        : 'bg-white/5 text-orch-fg2 hover:bg-white/10',
                    )}
                    onClick={handleSend}
                    disabled={!value.trim()}
                  >
                    <Icon name="arrow-right" size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send message</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
