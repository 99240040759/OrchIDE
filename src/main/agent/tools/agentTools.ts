import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BrowserWindow } from 'electron';
import { upsertTaskProgress, insertArtifact, upsertFileChanged } from '../../db';
import { writeSessionFile } from '../../appdata';
import { v4 as uuidv4 } from 'uuid';

function broadcastToAll(channel: string, data: any) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  });
}

export function createTaskTool(sessionId: string) {
  return createTool({
    id: 'updateTaskProgress',
    description: `Update the task progress checklist (task.md). Use markdown checkbox format:
- [ ] uncompleted task
- [x] completed task  
- [/] in-progress task
Call this at the start of work and after each major step completes. This is stored persistently and shown in the right sidebar.`,
    inputSchema: z.object({
      title: z.string().describe('Short title of the current overall task'),
      checklistMarkdown: z.string().describe('Full task.md content with markdown checkboxes'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    execute: async ({ context, ...inputs }: any) => {
      const { title, checklistMarkdown } = inputs;
      const content = `# ${title}\n\n${checklistMarkdown}`;
      writeSessionFile(sessionId, 'task.md', content);
      upsertTaskProgress(sessionId, content);
      broadcastToAll('agent:task-update', { sessionId, checklistMd: content });
      return { success: true };
    },
  });
}

export function createArtifactTool(sessionId: string) {
  return createTool({
    id: 'createArtifact',
    description: `Create or update an artifact document (implementation_plan.md, walkthrough.md, or any research document).
Artifacts are stored in the agent's session folder and displayed in the right sidebar.
Types: 'implementation_plan' | 'walkthrough' | 'task' | 'other'
Icons: implementation_plan→Map, walkthrough→BookOpen, task→ListTodo, other→FileText`,
    inputSchema: z.object({
      name: z.string().describe('Display name of the artifact, e.g. "Implementation Plan"'),
      type: z.enum(['implementation_plan', 'walkthrough', 'task', 'other']).describe('Type of artifact'),
      filename: z.string().describe('Filename e.g. "implementation_plan.md" or "research_notes.md"'),
      content: z.string().describe('Full markdown content of the artifact'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      filePath: z.string().nullable(),
    }),
    execute: async ({ context, ...inputs }: any) => {
      const { name, type, filename, content } = inputs;
      const filePath = writeSessionFile(sessionId, filename, content);
      const iconMap: Record<string, string> = {
        implementation_plan: 'Map',
        walkthrough: 'BookOpen',
        task: 'ListTodo',
        other: 'FileText',
      };
      const id = uuidv4();
      const icon = iconMap[type] || 'FileText';
      insertArtifact(id, sessionId, name, type, filePath, icon);
      broadcastToAll('agent:artifact-created', {
        sessionId,
        artifact: { id, name, type, filePath, icon },
      });
      return { success: true, filePath };
    },
  });
}

export function createFileChangedTool(sessionId: string) {
  return createTool({
    id: 'reportFileChanged',
    description: 'Report that you have created, modified, or deleted a file in the workspace. This updates the Files Changed panel in the right sidebar.',
    inputSchema: z.object({
      filePath: z.string().describe('Absolute or relative path of the file changed'),
      status: z.enum(['added', 'modified', 'deleted']).describe('What happened to the file'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    execute: async ({ context, ...inputs }: any) => {
      const { filePath, status } = inputs;
      const id = uuidv4();
      upsertFileChanged(id, sessionId, filePath, status);
      broadcastToAll('agent:file-changed', {
        sessionId,
        change: { id, filePath, status },
      });
      return { success: true };
    },
  });
}
