/**
 * Agent Tool Implementations
 * 
 * Tools for agent self-management: task progress, artifacts, plans.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../types';

// ============================================================================
// Update Task Progress Implementation
// ============================================================================

export const updateTaskProgressImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const title = args.title as string;
  const checklistMarkdown = args.checklistMarkdown as string;

  // Emit event for UI update
  if (context.sendEvent) {
    context.sendEvent({
      type: 'task_progress',
      title,
      checklistMarkdown,
      timestamp: Date.now(),
    });
  }

  return {
    output: [{
      name: 'Task Progress Updated',
      description: title,
      content: checklistMarkdown,
    }],
    success: true,
    metadata: { title },
  };
};

// ============================================================================
// Create Artifact Implementation
// ============================================================================

export const createArtifactImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const name = args.name as string;
  const artifactType = args.type as string;
  const filename = args.filename as string;
  const content = args.content as string;

  const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Determine icon based on type
  const iconMap: Record<string, string> = {
    implementation_plan: 'Map',
    walkthrough: 'BookOpen',
    task: 'ListTodo',
    other: 'FileText',
  };
  const icon = iconMap[artifactType] || 'FileText';

  // Write artifact to session folder if available
  let filePath = filename;
  if (context.sessionPath) {
    const artifactsDir = path.join(context.sessionPath, 'artifacts');
    try {
      await fs.mkdir(artifactsDir, { recursive: true });
      filePath = path.join(artifactsDir, filename);
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      // Fall back to just tracking without file
      console.error('Failed to write artifact file:', error);
    }
  }

  const artifact = {
    id: artifactId,
    name,
    type: artifactType,
    filePath,
    icon,
    createdAt: Date.now(),
  };

  // Emit event for UI
  if (context.sendEvent) {
    context.sendEvent({
      type: 'artifact_created',
      artifact,
      timestamp: Date.now(),
    });
  }

  return {
    output: [{
      name: 'Artifact Created',
      description: `${artifactType}: ${name}`,
      content: `Created artifact "${name}" → ${filePath}`,
    }],
    success: true,
    metadata: { artifactId, filePath },
  };
};

// ============================================================================
// Report File Changed Implementation
// ============================================================================

export const reportFileChangedImpl: Tool['execute'] = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> => {
  const filePath = args.filePath as string;
  const status = args.status as 'added' | 'modified' | 'deleted';

  // Emit event for UI
  if (context.sendEvent) {
    context.sendEvent({
      type: 'file_changed',
      filePath,
      status,
      timestamp: Date.now(),
    });
  }

  return {
    output: [{
      name: 'File Change Reported',
      description: `${status}: ${filePath}`,
      content: `File ${filePath} was ${status}`,
    }],
    success: true,
  };
};

