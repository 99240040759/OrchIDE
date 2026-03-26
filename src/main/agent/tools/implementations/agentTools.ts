/**
 * Agent Tool Implementations — Antigravity-Level
 *
 * Implements: updateTaskProgress, createArtifact, reportFileChanged,
 * taskBoundary, notifyUser
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Tool, ToolContext, ToolResult } from '../types';
import type { TaskBoundaryData, NotifyUserData } from '../../core/types';

// ============================================================================
// Update Task Progress
// ============================================================================

export const updateTaskProgressImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const title = args.title as string;
  const checklistMarkdown = args.checklistMarkdown as string;

  if (!title || !checklistMarkdown) {
    return {
      output: [{ name: 'Error', description: 'Missing arguments', content: 'title and checklistMarkdown are required.' }],
      success: false,
      error: 'Missing arguments',
    };
  }

  // Emit agent event for IPC to pick up
  context.sendEvent?.({
    type: 'task_progress',
    timestamp: Date.now(),
    message: title,
    checklistMarkdown,
  });

  return {
    output: [{ name: 'Task Updated', description: title, content: 'Task progress updated.' }],
    success: true,
  };
};

// ============================================================================
// Create Artifact
// ============================================================================

export const createArtifactImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const name = args.name as string;
  const type = args.type as string;
  const filename = args.filename as string;
  const content = args.content as string;

  if (!name || !type || !filename || content === undefined) {
    return {
      output: [{ name: 'Error', description: 'Missing arguments', content: 'name, type, filename, and content are required.' }],
      success: false,
      error: 'Missing arguments',
    };
  }

  // Write to session directory
  const sessionDir = context.sessionPath || '/tmp';
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const filePath = path.join(sessionDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');

  // Determine icon
  const iconMap: Record<string, string> = {
    implementation_plan: 'Map',
    walkthrough: 'BookOpen',
    task: 'ListTodo',
    other: 'FileText',
  };

  const artifact = {
    id: `artifact_${uuidv4().slice(0, 8)}`,
    sessionId: context.sessionId,
    name,
    type,
    filePath,
    icon: iconMap[type] || 'FileText',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Emit agent event
  context.sendEvent?.({
    type: 'artifact_created',
    timestamp: Date.now(),
    artifact,
  });

  return {
    output: [{
      name: 'Artifact Created',
      description: `${name} (${type})`,
      content: `Created artifact "${name}" at ${filePath}`,
    }],
    success: true,
    metadata: { artifactId: artifact.id, filePath },
  };
};

// ============================================================================
// Report File Changed
// ============================================================================

export const reportFileChangedImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const filePath = args.filePath as string;
  const status = args.status as 'added' | 'modified' | 'deleted';

  if (!filePath || !status) {
    return {
      output: [{ name: 'Error', description: 'Missing arguments', content: 'filePath and status are required.' }],
      success: false,
      error: 'Missing arguments',
    };
  }

  // Resolve to absolute path
  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(context.workspacePath || '', filePath);

  context.sendEvent?.({
    type: 'file_changed',
    timestamp: Date.now(),
    filePath: absPath,
    status,
  });

  return {
    output: [{ name: 'File Change Reported', description: filePath, content: `${status}: ${filePath}` }],
    success: true,
  };
};

// ============================================================================
// Task Boundary
// ============================================================================

export const taskBoundaryImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const taskName = args.taskName as string;
  const mode = args.mode as string;
  const taskStatus = args.taskStatus as string;
  const taskSummary = args.taskSummary as string;
  const predictedTaskSize = args.predictedTaskSize as number | undefined;

  if (!taskName || !mode || !taskStatus || !taskSummary) {
    return {
      output: [{ name: 'Error', description: 'Missing arguments', content: 'taskName, mode, taskStatus, taskSummary are required.' }],
      success: false,
      error: 'Missing arguments',
    };
  }

  const data: TaskBoundaryData = {
    taskName,
    mode: mode as TaskBoundaryData['mode'],
    taskStatus,
    taskSummary,
    predictedTaskSize,
  };

  context.sendEvent?.({
    type: 'task_boundary',
    timestamp: Date.now(),
    taskBoundary: data,
  });

  return {
    output: [{
      name: 'Task Boundary Set',
      description: `[${mode}] ${taskName}`,
      content: `Mode: ${mode}\nTask: ${taskName}\nStatus: ${taskStatus}`,
    }],
    success: true,
  };
};

// ============================================================================
// Notify User
// ============================================================================

export const notifyUserImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const message = args.message as string;
  const pathsToReview = args.pathsToReview as string[] | undefined;
  const blockedOnUser = (args.blockedOnUser as boolean) ?? false;
  const shouldAutoProceed = (args.shouldAutoProceed as boolean) ?? false;

  if (!message) {
    return {
      output: [{ name: 'Error', description: 'Missing message', content: 'message is required.' }],
      success: false,
      error: 'Missing message',
    };
  }

  const data: NotifyUserData = {
    message,
    pathsToReview,
    blockedOnUser,
    shouldAutoProceed,
  };

  context.sendEvent?.({
    type: 'notify_user',
    timestamp: Date.now(),
    notifyUser: data,
    message,
  });

  return {
    output: [{
      name: 'User Notified',
      description: blockedOnUser ? 'Waiting for user response' : 'Notification sent',
      content: message,
    }],
    success: true,
    metadata: { blockedOnUser, shouldAutoProceed },
  };
};
