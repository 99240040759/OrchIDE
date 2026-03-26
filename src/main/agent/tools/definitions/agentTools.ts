/**
 * Agent Tool Definitions
 * 
 * Tools for agent-specific operations: task progress, artifacts, file changes.
 */

import type { Tool } from '../types';
import { createToolDefinition } from '../registry';

// ============================================================================
// Update Task Progress Tool
// ============================================================================

export const updateTaskProgressDefinition: Tool['definition'] = createToolDefinition(
  'updateTaskProgress',
  `Update the task progress checklist. Use markdown checkbox format:
- [ ] uncompleted task
- [x] completed task  
- [/] in-progress task

Call this at the start of work and after each major step completes. This is shown in the right sidebar.`,
  {
    required: ['title', 'checklistMarkdown'],
    properties: {
      title: {
        type: 'string',
        description: 'Short title of the current overall task',
      },
      checklistMarkdown: {
        type: 'string',
        description: 'Full task.md content with markdown checkboxes',
      },
    },
  }
);

export const updateTaskProgressTool: Omit<Tool, 'execute'> = {
  definition: updateTaskProgressDefinition,
  display: {
    displayTitle: 'Update Task Progress',
    wouldLikeTo: 'update task progress',
    isCurrently: 'updating task progress',
    hasAlready: 'updated task progress',
    icon: 'list-checks',
    group: 'agent',
  },
  behavior: {
    readonly: false, // Updates UI state
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission', // Auto-approve - only updates UI
    allowsParallel: true,
  },
};

// ============================================================================
// Create Artifact Tool
// ============================================================================

export const createArtifactDefinition: Tool['definition'] = createToolDefinition(
  'createArtifact',
  `Create or update an artifact document (implementation_plan.md, walkthrough.md, or any research document).
Artifacts are stored in the agent's session folder and displayed in the right sidebar.
Types: 'implementation_plan' | 'walkthrough' | 'task' | 'other'
Icons: implementation_plan→Map, walkthrough→BookOpen, task→ListTodo, other→FileText`,
  {
    required: ['name', 'type', 'filename', 'content'],
    properties: {
      name: {
        type: 'string',
        description: 'Display name of the artifact, e.g. "Implementation Plan"',
      },
      type: {
        type: 'string',
        description: 'Type of artifact',
        enum: ['implementation_plan', 'walkthrough', 'task', 'other'],
      },
      filename: {
        type: 'string',
        description: 'Filename e.g. "implementation_plan.md" or "research_notes.md"',
      },
      content: {
        type: 'string',
        description: 'Full markdown content of the artifact',
      },
    },
  }
);

export const createArtifactTool: Omit<Tool, 'execute'> = {
  definition: createArtifactDefinition,
  display: {
    displayTitle: 'Create Artifact',
    wouldLikeTo: 'create artifact "{{{ name }}}"',
    isCurrently: 'creating artifact "{{{ name }}}"',
    hasAlready: 'created artifact "{{{ name }}}"',
    icon: 'file-text',
    group: 'agent',
  },
  behavior: {
    readonly: false,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission', // Auto-approve - only creates in session folder
    allowsParallel: true,
  },
};

// ============================================================================
// Report File Changed Tool
// ============================================================================

export const reportFileChangedDefinition: Tool['definition'] = createToolDefinition(
  'reportFileChanged',
  'Report that you have created, modified, or deleted a file in the workspace. This updates the Files Changed panel in the right sidebar.',
  {
    required: ['filePath', 'status'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Absolute or relative path of the file changed',
      },
      status: {
        type: 'string',
        description: 'What happened to the file',
        enum: ['added', 'modified', 'deleted'],
      },
    },
  }
);

export const reportFileChangedTool: Omit<Tool, 'execute'> = {
  definition: reportFileChangedDefinition,
  display: {
    displayTitle: 'Report File Change',
    wouldLikeTo: 'report file change: {{{ filePath }}}',
    isCurrently: 'reporting file change',
    hasAlready: 'reported file change: {{{ filePath }}}',
    icon: 'file-diff',
    group: 'agent',
  },
  behavior: {
    readonly: false,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};

