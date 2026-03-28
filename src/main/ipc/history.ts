import { ipcMain } from 'electron';
import {
  getChatSessions,
  getWorkspaceSessions,
  getMessages,
  deleteSession,
  getArtifacts,
  getTaskProgress,
  updateLastAssistantMessageExtras,
} from '../db';
import { deleteSessionDir } from '../appdata';

export function registerHistoryIPC(): void {
  ipcMain.handle('history:getChats', async () => {
    return getChatSessions();
  });

  ipcMain.handle('history:getWorkspaceSessions', async (_event, workspacePath: string) => {
    return getWorkspaceSessions(workspacePath);
  });

  ipcMain.handle('history:getMessages', async (_event, sessionId: string) => {
    return getMessages(sessionId);
  });

  ipcMain.handle('history:getArtifacts', async (_event, sessionId: string) => {
    return getArtifacts(sessionId);
  });

  ipcMain.handle('history:getTaskProgress', async (_event, sessionId: string) => {
    return getTaskProgress(sessionId);
  });

  ipcMain.handle('history:deleteSession', async (_event, sessionId: string) => {
    try {
      deleteSession(sessionId);
      deleteSessionDir(sessionId);
      return { error: null };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('history:updateMessageExtras', async (_event, sessionId: string, toolCalls: string | null, parts: string | null) => {
    try {
      updateLastAssistantMessageExtras(sessionId, toolCalls, parts);
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });
}
