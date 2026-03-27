/**
 * Agent IPC Handlers
 *
 * Bridges the renderer process and the main-process AgentSession.
 * Handles message dispatch, streaming event forwarding, tool/plan approval,
 * and session lifecycle.
 *
 * Fixed bugs vs previous version:
 *  1. setupSessionListeners no longer calls removeAllListeners() on every send
 *     (used a Set to track sessions that already have listeners).
 *  2. tool_call_start IPC case now reads data.toolCallDelta (not data.toolCall).
 *  3. DB insertMessage receives a serialized string regardless of content type.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { AgentSession, type AgentSessionConfig } from '../agent/orchestrator';
import type {
  StreamEvent,
  AgentEvent,
  AssistantMessage,
} from '../agent/core/types';
import { loadSettings, getAppDataDir } from '../appdata';
import * as path from 'node:path';
import {
  createSession as dbCreateSession,
  insertMessage,
  getMessages,
  updateSessionTitle,
  insertArtifact,
  upsertTaskProgress,
} from '../db';
import { getWorkspaceIndexer } from './indexer';

// ============================================================================
// Session Management
// ============================================================================

/** Live agent sessions keyed by sessionId. */
const activeSessions = new Map<string, AgentSession>();

/**
 * Sessions that already have event listeners attached.
 * We use this to avoid re-attaching listeners (and wiping existing ones) on
 * every 'agent:send' call.
 */
const sessionsWithListeners = new Set<string>();

/**
 * Get or create an agent session.
 */
function getOrCreateSession(
  sessionId: string,
  workspacePath: string,
  workspaceName: string,
  mode: 'agentic' | 'chat' = 'agentic'
): AgentSession {
  let session = activeSessions.get(sessionId);

  if (!session) {
    console.log('[Agent IPC] Creating new session:', sessionId);
    const settings = loadSettings();

    if (settings.NVIDIA_NIM_MODEL?.includes('deepseek')) {
      console.warn('[Agent IPC] DeepSeek may not be available on NVIDIA NIM');
    }

    const config: AgentSessionConfig = {
      sessionId,
      workspacePath,
      llmConfig: {
        apiBase: settings.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
        apiKey: settings.NVIDIA_NIM_API_KEY || '',
        model: settings.NVIDIA_NIM_MODEL || 'meta/llama-3.3-70b-instruct',
      },
    };

    console.log('[Agent IPC] LLM config:', {
      apiBase: config.llmConfig.apiBase,
      model: config.llmConfig.model,
      hasApiKey: !!config.llmConfig.apiKey,
    });

    session = new AgentSession(config);
    activeSessions.set(sessionId, session);

    // Persist to DB
    dbCreateSession(sessionId, mode, workspacePath, workspaceName);
    console.log('[Agent IPC] Session created and stored:', sessionId);

    // Boot up the indexer in the background
    if (workspacePath) {
      getWorkspaceIndexer(workspacePath);
    }
  } else {
    console.log('[Agent IPC] Reusing existing session:', sessionId);
  }

  return session;
}

/** Remove an active session and clean up its state. */
function removeSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.abort();
    activeSessions.delete(sessionId);
    sessionsWithListeners.delete(sessionId);
    console.log('[Agent IPC] Session removed:', sessionId);
  }
}

/** Clean up all active sessions (called on app shutdown). */
export function cleanupAllSessions(): void {
  console.log(`[Agent IPC] Cleaning up ${activeSessions.size} active sessions`);
  for (const [_sessionId, session] of activeSessions) {
    try {
      session.abort();
    } catch {
      // Ignore errors during cleanup
    }
  }
  activeSessions.clear();
  sessionsWithListeners.clear();
}

// ============================================================================
// IPC Parameter Types
// ============================================================================

interface AgentSendParams {
  sessionId: string;
  message: string;
  workspacePath: string;
  workspaceName: string;
  mode?: 'agent' | 'chat';
}

// ============================================================================
// IPC Registration
// ============================================================================

export function registerAgentIPCNew(): void {

  // --------------------------------------------------------------------------
  // Main: send a user message to the agent
  // --------------------------------------------------------------------------
  ipcMain.handle('agent:send', async (event, params: AgentSendParams) => {
    console.log('[Agent IPC] agent:send', {
      sessionId: params.sessionId,
      messagePreview: params.message?.substring(0, 80),
      mode: params.mode,
    });

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      console.error('[Agent IPC] No window found for sender');
      return { error: 'No window found', started: false };
    }

    if (!params.message?.trim()) {
      return { error: 'Empty message', started: false };
    }

    const { sessionId, message } = params;
    const workspacePath = params.workspacePath || path.join(getAppDataDir(), 'workspaces', 'global');
    const workspaceName = params.workspaceName || 'Global Workspace';

    try {
      const dbMode = params.mode === 'chat' ? 'chat' : 'agentic';
      const session = getOrCreateSession(sessionId, workspacePath, workspaceName, dbMode);

      // Attach listeners ONCE per session lifetime.
      // Do not call removeAllListeners here — that would blow away listeners
      // that may be in the middle of handling a previous async stream.
      setupSessionListeners(session, win, sessionId);

      // Store user turn in DB
      const userMsgId = uuidv4();
      insertMessage(userMsgId, sessionId, 'user', message);

      // Notify renderer that streaming is starting
      win.webContents.send('agent:stream-start', { sessionId });

      // Kick off the agent loop asynchronously; errors are surfaced via events.
      session.chat(message).catch((error) => {
        console.error(`[Agent IPC] Chat error for ${sessionId}:`, error);
        if (!win.isDestroyed()) {
          win.webContents.send('agent:stream-error', {
            sessionId,
            error: error instanceof Error ? error.message : 'Agent encountered an error',
          });
        }
      });

      return { started: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start agent';
      console.error('[Agent IPC] agent:send error:', msg);
      return { error: msg, started: false };
    }
  });

  // --------------------------------------------------------------------------
  // Cancel current operation
  // --------------------------------------------------------------------------
  ipcMain.handle('agent:cancel', async (_event, sessionId: string) => {
    activeSessions.get(sessionId)?.abort();
    return { cancelled: true };
  });

  // --------------------------------------------------------------------------
  // Get session state (for reconnect / reload)
  // --------------------------------------------------------------------------
  ipcMain.handle('agent:getSession', async (_event, sessionId: string) => {
    if (!sessionId) return { messages: [], error: 'Invalid session ID' };

    const session = activeSessions.get(sessionId);
    if (session) {
      return {
        messages: session.getHistory(),
        state: session.getState(),
        currentPlan: session.getCurrentPlan(),
      };
    }

    // Fallback: return raw DB messages
    return { messages: getMessages(sessionId) };
  });

  // --------------------------------------------------------------------------
  // Session lifecycle
  // --------------------------------------------------------------------------
  ipcMain.handle('agent:closeSession', async (_event, sessionId: string) => {
    removeSession(sessionId);
    return { success: true };
  });

  ipcMain.handle('agent:exportSession', async (_event, sessionId: string) => {
    const session = activeSessions.get(sessionId);
    if (!session) return { error: 'Session not found' };
    return { session: session.export() };
  });

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------
  ipcMain.handle('settings:get', async () => loadSettings());

  ipcMain.handle('settings:save', async (_event, settings: Record<string, string>) => {
    const { saveSettings } = await import('../appdata');
    saveSettings(settings);

    // Invalidate all active sessions so they pick up the new API key / model
    // on the next message without requiring an app restart.
    console.log('[Agent IPC] Settings saved — clearing all cached sessions so new config takes effect');
    for (const [_id, session] of activeSessions) {
      try { session.abort(); } catch { /* ignore */ }
    }
    activeSessions.clear();
    sessionsWithListeners.clear();

    return { success: true };
  });
  // --------------------------------------------------------------------------
  // Resume from notifyUser block
  // --------------------------------------------------------------------------
  ipcMain.handle('agent:resume-notify', async (_event, sessionId: string) => {
    const session = activeSessions.get(sessionId);
    if (session) {
      session.resumeFromNotify();
      return { resumed: true };
    }
    return { error: 'Session not found' };
  });

  console.log('[Agent IPC] All handlers registered');
}

// ============================================================================
// Session Event → IPC Bridge
// ============================================================================

/**
 * Wire up a session's EventEmitter events to IPC messages sent to the renderer.
 *
 * This function is idempotent: if a session already has listeners attached
 * (tracked via sessionsWithListeners), it returns immediately.  This prevents
 * the original bug where calling removeAllListeners() on every 'agent:send'
 * would wipe mid-flight event handlers.
 */
function setupSessionListeners(
  session: AgentSession,
  win: BrowserWindow,
  sessionId: string
): void {
  if (sessionsWithListeners.has(sessionId)) {
    console.log('[Agent IPC] Listeners already attached for session:', sessionId);
    return;
  }

  sessionsWithListeners.add(sessionId);
  console.log('[Agent IPC] Attaching listeners for session:', sessionId);

  // ---- Stream events --------------------------------------------------------
  session.on('stream', (event: StreamEvent) => {
    if (win.isDestroyed()) return;
    const { type, data } = event;

    switch (type) {
      // ---- Text streaming ---------------------------------------------------
      case 'text_delta':
        // Legacy chunk channel (for simple renderers that just concatenate)
        win.webContents.send('agent:stream-chunk', {
          sessionId,
          chunk: data.text,
        });
        // Structured event channel
        win.webContents.send('agent:stream-event', {
          sessionId,
          type: 'text-delta',
          data: { text: data.text },
        });
        break;

      // ---- Reasoning/Thinking streaming (NVIDIA models) --------------------
      case 'reasoning_delta':
        win.webContents.send('agent:stream-event', {
          sessionId,
          type: 'reasoning-delta',
          data: { text: data.text },
        });
        break;

      // ---- Tool call starting to stream ------------------------------------
      // FIXED: data lives in toolCallDelta, NOT toolCall, when the LLM first
      // emits the tool call during streaming.
      // Emit the ToolCallEvent shape that chatStore.handleStreamEvent expects.
      case 'tool_call_start':
        win.webContents.send('agent:stream-event', {
          sessionId,
          type: 'tool-call-start',
          data: {
            toolCall: {
              id: data.toolCallDelta?.id ?? data.toolCall?.id ?? '',
              toolName:
                data.toolCallDelta?.function?.name ?? data.toolCall?.function?.name ?? '',
              args: {},          // args aren't complete until tool_call_complete
              status: 'running',
            } satisfies import('../../shared/types').ToolCallEvent,
          },
        });
        break;

      // ---- Tool call arguments are streaming in chunks --------------------
      case 'tool_call_delta':
        // Renderers can use this for live argument preview if desired.
        win.webContents.send('agent:stream-event', {
          sessionId,
          type: 'tool-call-delta',
          data: {
            toolCallId: data.toolCallDelta?.id,
            argumentChunk: data.toolCallDelta?.function?.arguments,
          },
        });
        break;

      // ---- Tool call fully received, about to execute ----------------------
      case 'tool_call_complete':
        win.webContents.send('agent:stream-event', {
          sessionId,
          type: 'tool-call-complete',
          data: {
            toolCall: data.toolCall,
            toolCallId: data.toolCall?.id ?? data.toolCallState?.toolCallId,
          },
        });
        break;

      // ---- Tool finished executing, result available -----------------------
      // Map ToolCallState → ToolCallEvent shape so chatStore.updateToolCall works.
      case 'tool_result': {
        const tcs = data.toolCallState;
        const resultText: string = tcs?.output?.map((o) => o.content).join('\n') ?? '';
        win.webContents.send('agent:stream-event', {
          sessionId,
          type: 'tool-result',
          data: {
            toolCall: {
              id: tcs?.toolCallId ?? '',
              toolName: tcs?.toolCall?.function?.name ?? '',
              args: tcs?.parsedArgs ?? {},
              status: tcs?.status === 'done' ? 'completed' : 'error',
              result: resultText || undefined,
              error: tcs?.error,
            } satisfies import('../../shared/types').ToolCallEvent,
          },
        });
        break;
      }

      // ---- LLM stream ended (may have been mid-tool-loop) -----------------
      case 'stream_end':
        // Don't send stream-end here; wait for the 'complete' event which fires
        // only after the entire tool loop (all iterations) finishes.
        break;

      case 'error':
        win.webContents.send('agent:stream-error', {
          sessionId,
          error: data.error,
        });
        break;

      default:
        break;
    }
  });

  // ---- Agent meta-events (task progress, artifacts, file changes) ----------
  // These events come from the agent tools (updateTaskProgress, createArtifact,
  // reportFileChanged) via session.emit('agent_event'). We discriminate by
  // event.type and fire discrete IPC channels so the renderer's subscribeAll
  // handles them. We also persist to DB.
  session.on('agent_event', (event: AgentEvent) => {
    if (win.isDestroyed()) return;
    const evt = event as unknown as Record<string, unknown>;
    const evtType = evt.type as string;

    switch (evtType) {
      case 'task_progress': {
        const checklistMd = (evt.checklistMarkdown as string) || '';
        // Persist to DB
        upsertTaskProgress(sessionId, checklistMd);
        // Send to renderer
        win.webContents.send('agent:task-update', { sessionId, checklistMd });
        break;
      }
      case 'artifact_created': {
        const artifact = evt.artifact as Record<string, unknown>;
        if (artifact) {
          // Persist to DB
          insertArtifact(
            artifact.id as string,
            sessionId,
            artifact.name as string,
            artifact.type as string,
            artifact.filePath as string,
            artifact.icon as string
          );
          // Send to renderer
          win.webContents.send('agent:artifact-created', { sessionId, artifact });
        }
        break;
      }

      case 'plan_created':
      case 'plan_step_updated':
        win.webContents.send('agent:agent-event', { sessionId, event });
        break;
      case 'task_boundary': {
        const tb = evt.taskBoundary as Record<string, unknown> | undefined;
        if (tb) {
          win.webContents.send('agent:task-boundary', {
            sessionId,
            taskName: tb.taskName,
            mode: tb.mode,
            taskStatus: tb.taskStatus,
            taskSummary: tb.taskSummary,
            predictedTaskSize: tb.predictedTaskSize,
          });
        }
        break;
      }
      case 'notify_user': {
        const nu = evt.notifyUser as Record<string, unknown> | undefined;
        if (nu) {
          win.webContents.send('agent:notify-user', {
            sessionId,
            message: nu.message,
            pathsToReview: nu.pathsToReview,
            blockedOnUser: nu.blockedOnUser,
            shouldAutoProceed: nu.shouldAutoProceed,
          });
        }
        break;
      }
      default:
        win.webContents.send('agent:agent-event', { sessionId, event });
        break;
    }
  });

  // ---- Entire agent turn complete (all tool iterations done) ---------------
  session.on('complete', () => {
    if (win.isDestroyed()) return;

    // Persist the final assistant message to DB.
    // FIXED: content can be null (tool-only responses) or MessageContent[] —
    // always serialize to a string before handing to SQLite.
    const history = session.getHistory();
    const lastAssistantMsg = [...history]
      .reverse()
      .find((m): m is AssistantMessage => m.role === 'assistant');

    if (lastAssistantMsg) {
      const contentStr = serializeContent(lastAssistantMsg.content);
      const reasoningStr = lastAssistantMsg.reasoning ?? null;
      const msgId = uuidv4();
      insertMessage(msgId, sessionId, 'assistant', contentStr, reasoningStr);

      // Auto-generate session title from first user message (when 2 msgs exist)
      const dbMessages = getMessages(sessionId);
      if (dbMessages.length === 2) {
        const userMsg = dbMessages.find((m: { role: string }) => m.role === 'user');
        if (userMsg) {
          const title =
            (userMsg.content as string).slice(0, 60) +
            ((userMsg.content as string).length > 60 ? '...' : '');
          updateSessionTitle(sessionId, title);
          win.webContents.send('agent:session-titled', { sessionId, title });
        }
      }
    }

    // Tell renderer the turn is fully done
    win.webContents.send('agent:stream-event', {
      sessionId,
      type: 'finish',
      data: { finishReason: 'stop' },
    });
    win.webContents.send('agent:stream-end', { sessionId });

    // Allow future messages to re-attach listeners cleanly if needed.
    // We keep the session alive but remove from the "has listeners" set
    // so the next send can re-check.  (Listeners stay attached — we only
    // remove from the set so the guard doesn't think they're still in-flight.)
    // NOTE: We intentionally do NOT call removeAllListeners() here.
  });

  // ---- Session-level error -------------------------------------------------
  session.on('error', (error: Error) => {
    if (win.isDestroyed()) return;
    console.error('[Agent IPC] Session error event:', error.message);
    win.webContents.send('agent:stream-error', {
      sessionId,
      error: error.message,
    });
    // Clean up listener tracking so next send re-attaches cleanly
    sessionsWithListeners.delete(sessionId);
  });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Safely convert a ChatMessage content field to a plain string for SQLite.
 * Handles: string | MessageContent[] | null | undefined
 */
function serializeContent(
  content: string | import('../agent/core/types').MessageContent[] | null | undefined
): string {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  // MessageContent[] — join text parts
  return content
    .map((c) => (c.type === 'text' ? (c.text ?? '') : '[image]'))
    .join('');
}
