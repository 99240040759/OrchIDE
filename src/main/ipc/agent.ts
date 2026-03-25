import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { createOrchAgent } from '../agent/mastraAgent';
import {
  createSession,
  insertMessage,
  getMessages,
  updateSessionTitle,
} from '../db';

interface AgentRunParams {
  sessionId: string;
  message: string;
  mode: 'chat' | 'agentic';
  workspacePath?: string;
  workspaceName?: string;
}

async function runAgentStream(params: AgentRunParams, senderWindow: BrowserWindow) {
  const send = (channel: string, data: any) => {
    if (!senderWindow.isDestroyed()) {
      senderWindow.webContents.send(channel, data);
    }
  };

  try {
    // Ensure session exists
    createSession(params.sessionId, params.mode, params.workspacePath, params.workspaceName);

    // Store user message in DB
    const userMsgId = uuidv4();
    insertMessage(userMsgId, params.sessionId, 'user', params.message);

    // Build conversation history for context
    const history = getMessages(params.sessionId);
    const mastraMessages = history
      .slice(-20) // last 20 messages for context
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));

    // Create agent
    const agent = createOrchAgent({
      sessionId: params.sessionId,
      workspacePath: params.workspacePath,
      workspaceName: params.workspaceName,
    });

    send('agent:stream-start', { sessionId: params.sessionId });

    let fullResponse = '';

    // Stream the agent response
    const stream = await agent.stream(mastraMessages as any);

    for await (const chunk of stream.textStream) {
      fullResponse += chunk;
      send('agent:stream-chunk', { sessionId: params.sessionId, chunk });
    }

    // Store assistant response
    const assistantMsgId = uuidv4();
    insertMessage(assistantMsgId, params.sessionId, 'assistant', fullResponse);

    // Auto-title from first interaction
    const currentMessages = getMessages(params.sessionId);
    if (currentMessages.length <= 2) {
      const title = params.message.slice(0, 60) + (params.message.length > 60 ? '...' : '');
      updateSessionTitle(params.sessionId, title);
      send('agent:session-titled', { sessionId: params.sessionId, title });
    }

    send('agent:stream-end', { sessionId: params.sessionId });

  } catch (error: any) {
    send('agent:stream-error', {
      sessionId: params.sessionId,
      error: error.message || 'Agent encountered an error',
    });
  }
}

export function registerAgentIPC(): void {
  ipcMain.handle('agent:send', async (event, params: AgentRunParams) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { error: 'No window found' };

    // Run async — don't await so IPC returns immediately and streaming begins
    runAgentStream(params, win).catch(console.error);

    return { started: true };
  });

  ipcMain.handle('agent:getSession', async (_event, sessionId: string) => {
    const messages = getMessages(sessionId);
    return { messages };
  });

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
