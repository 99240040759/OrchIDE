/**
 * Agent IPC handlers
 * Handles communication between renderer and AI agent with full stream support
 * Captures ALL events: text, tool calls, tool results, thinking, etc.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { createOrchAgent } from '../agent/mastraAgent';
import {
  createSession,
  insertMessage,
  getMessages,
  updateSessionTitle,
} from '../db';
import type { AgentRunParams, StreamEvent, ToolCallEvent } from '../../shared/types';

/**
 * Stream state management - tracks active streams per session
 */
interface ActiveStream {
  sessionId: string;
  aborted: boolean;
  startTime: number;
}

const activeStreams = new Map<string, ActiveStream>();

/**
 * Cancel any existing stream for a session
 */
function cancelActiveStream(sessionId: string): void {
  const existing = activeStreams.get(sessionId);
  if (existing && !existing.aborted) {
    existing.aborted = true;
    console.log(`[Agent] Cancelled stream for session ${sessionId}`);
  }
}

/**
 * Check if a stream has been aborted
 */
function isStreamAborted(sessionId: string): boolean {
  const stream = activeStreams.get(sessionId);
  return stream?.aborted ?? false;
}

/**
 * Run the agent stream with full event capture
 * Uses fullStream to capture ALL events including tool calls and results
 */
async function runAgentStream(
  params: AgentRunParams,
  senderWindow: BrowserWindow
): Promise<void> {
  const { sessionId } = params;

  // Cancel any existing stream for this session
  cancelActiveStream(sessionId);

  // Create new stream tracker
  const streamState: ActiveStream = {
    sessionId,
    aborted: false,
    startTime: Date.now(),
  };
  activeStreams.set(sessionId, streamState);

  // Helper to send messages to renderer
  const send = (channel: string, data: unknown): void => {
    if (senderWindow.isDestroyed()) return;
    if (isStreamAborted(sessionId) && channel !== 'agent:stream-error') return;
    senderWindow.webContents.send(channel, data);
  };

  // Helper to send stream events
  const sendEvent = (type: StreamEvent['type'], data: StreamEvent['data']): void => {
    send('agent:stream-event', { sessionId, type, data } as StreamEvent);
  };

  try {
    // Validate session ID
    if (!sessionId || sessionId.trim() === '') {
      throw new Error('Invalid session ID');
    }

    // Ensure session exists in database
    createSession(
      sessionId,
      params.mode,
      params.workspacePath,
      params.workspaceName
    );

    // Store user message
    const userMsgId = uuidv4();
    insertMessage(userMsgId, sessionId, 'user', params.message);

    // Build conversation history
    const history = getMessages(sessionId);
    const mastraMessages = history.slice(-20).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Create agent instance
    const agent = createOrchAgent({
      sessionId,
      workspacePath: params.workspacePath,
      workspaceName: params.workspaceName,
    });

    // Signal stream start
    send('agent:stream-start', { sessionId });

    let fullTextResponse = '';
    const activeToolCalls = new Map<string, ToolCallEvent>();

    // Stream the agent response using fullStream for ALL events
    const stream = await agent.stream(mastraMessages);

    for await (const part of stream.fullStream) {
      if (isStreamAborted(sessionId)) {
        console.log(`[Agent] Stream aborted for session ${sessionId}`);
        break;
      }

      switch (part.type) {
        case 'text-delta': {
          // Incremental text chunk
          const text = part.textDelta || '';
          fullTextResponse += text;
          sendEvent('text-delta', { text });
          // Also send legacy chunk for backwards compatibility
          send('agent:stream-chunk', { sessionId, chunk: text });
          break;
        }

        case 'tool-call': {
          // Tool call initiated
          const toolCall: ToolCallEvent = {
            id: part.toolCallId || uuidv4(),
            toolName: part.toolName || 'unknown',
            args: part.args || {},
            status: 'running',
          };
          activeToolCalls.set(toolCall.id, toolCall);
          sendEvent('tool-call-start', { toolCall });
          break;
        }

        case 'tool-result': {
          // Tool execution completed
          const toolId = part.toolCallId || '';
          const existing = activeToolCalls.get(toolId);
          if (existing) {
            existing.status = 'completed';
            existing.result = part.result;
            activeToolCalls.set(toolId, existing);
            sendEvent('tool-result', { toolCall: existing });
          } else {
            // Tool result without prior call (shouldn't happen but handle it)
            const toolCall: ToolCallEvent = {
              id: toolId,
              toolName: part.toolName || 'unknown',
              args: {},
              status: 'completed',
              result: part.result,
            };
            sendEvent('tool-result', { toolCall });
          }
          break;
        }

        case 'step-finish': {
          // A step (text generation or tool use) completed
          sendEvent('step-finish', {
            stepType: (part as any).stepType || 'unknown',
            finishReason: (part as any).finishReason || 'unknown'
          });
          break;
        }

        case 'finish': {
          // Stream finished
          sendEvent('finish', {
            finishReason: (part as any).finishReason || 'stop'
          });
          break;
        }

        case 'error': {
          // Handle streaming error
          const errorMsg = (part as any).error?.message || 'Unknown stream error';
          console.error(`[Agent] Stream error:`, errorMsg);
          // Mark any active tool calls as errored
          for (const [id, tc] of activeToolCalls) {
            if (tc.status === 'running') {
              tc.status = 'error';
              tc.error = errorMsg;
              sendEvent('tool-result', { toolCall: tc });
            }
          }
          break;
        }

        default: {
          // Log unknown event types for debugging
          console.log(`[Agent] Unknown stream part type: ${(part as any).type}`);
        }
      }
    }

    // Store final response if not aborted and has content
    if (!isStreamAborted(sessionId) && fullTextResponse.trim()) {
      const assistantMsgId = uuidv4();
      insertMessage(assistantMsgId, sessionId, 'assistant', fullTextResponse);

      // Auto-title for new sessions
      const currentMessages = getMessages(sessionId);
      if (currentMessages.length === 2) {
        const title = params.message.slice(0, 60) + (params.message.length > 60 ? '...' : '');
        updateSessionTitle(sessionId, title);
        send('agent:session-titled', { sessionId, title });
      }
    }

    // Signal stream end
    if (!isStreamAborted(sessionId)) {
      send('agent:stream-end', { sessionId });
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Agent encountered an error';
    console.error(`[Agent] Stream error for session ${sessionId}:`, errorMessage);

    send('agent:stream-error', {
      sessionId,
      error: errorMessage,
    });
  } finally {
    // Clean up stream tracker
    setTimeout(() => {
      const current = activeStreams.get(sessionId);
      if (current && current.startTime === streamState.startTime) {
        activeStreams.delete(sessionId);
      }
    }, 1000);
  }
}

/**
 * Register all agent-related IPC handlers
 */
export function registerAgentIPC(): void {
  // Main agent send handler
  ipcMain.handle('agent:send', async (event, params: AgentRunParams) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    if (!win) {
      console.error('[Agent] No window found for sender');
      return { error: 'No window found', started: false };
    }

    if (!params.message?.trim()) {
      return { error: 'Empty message', started: false };
    }

    // Start streaming async
    runAgentStream(params, win).catch((err) => {
      console.error('[Agent] Unhandled stream error:', err);
      if (!win.isDestroyed()) {
        win.webContents.send('agent:stream-error', {
          sessionId: params.sessionId,
          error: 'Agent failed to start',
        });
      }
    });

    return { started: true };
  });

  // Cancel stream handler
  ipcMain.handle('agent:cancel', async (_event, sessionId: string) => {
    cancelActiveStream(sessionId);
    return { cancelled: true };
  });

  // Get session messages
  ipcMain.handle('agent:getSession', async (_event, sessionId: string) => {
    if (!sessionId) return { messages: [], error: 'Invalid session ID' };
    const messages = getMessages(sessionId);
    return { messages };
  });

  // Settings handlers
  ipcMain.handle('settings:get', async () => {
    const { loadSettings } = await import('../appdata');
    return loadSettings();
  });

  ipcMain.handle('settings:save', async (_event, settings: Record<string, string>) => {
    const { saveSettings } = await import('../appdata');
    saveSettings(settings);
    return { success: true };
  });
}
