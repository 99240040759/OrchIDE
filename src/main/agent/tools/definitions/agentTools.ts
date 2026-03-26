/**
 * Agent Tool Definitions — Antigravity-Level
 *
 * Tools for agent cognitive infrastructure:
 * - updateTaskProgress: checklist tracking
 * - createArtifact: document deliverables/diagrams
 * - taskBoundary: orchestration mode controller (PLANNING/EXECUTION/VERIFICATION)
 * - notifyUser: user communication gate
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

MANDATORY: Call this at the start of every complex task and after each major step completes.
This is shown in the right sidebar. Keep items concise. Do NOT create literal task files in workspace.`,
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
    readonly: false,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};

// ============================================================================
// Create Artifact Tool
// ============================================================================

export const createArtifactDefinition: Tool['definition'] = createToolDefinition(
  'createArtifact',
  `Create or update an artifact document. Artifacts are displayed in the right sidebar.
Types: 'implementation_plan' | 'walkthrough' | 'task' | 'other'
Icons: implementation_plan→Map, walkthrough→BookOpen, task→ListTodo, other→FileText

Use artifacts for:
- Implementation plans (PLANNING mode — requires user review)
- Walkthroughs (VERIFICATION mode — proof of work)
- Research reports, analysis documents, reference materials
- Any structured document the user needs to review

DO NOT use for simple one-off answers or short content.`,
  {
    required: ['name', 'type', 'filename', 'content'],
    properties: {
      name: {
        type: 'string',
        description: 'Display name e.g. "Implementation Plan"',
      },
      type: {
        type: 'string',
        description: 'Type of artifact',
        enum: ['implementation_plan', 'walkthrough', 'task', 'other'],
      },
      filename: {
        type: 'string',
        description: 'Filename e.g. "implementation_plan.md"',
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
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};

// ============================================================================
// Task Boundary Tool (Antigravity-level orchestration)
// ============================================================================

export const taskBoundaryDefinition: Tool['definition'] = createToolDefinition(
  'taskBoundary',
  `Indicate the start of a task or update the current task's progress.
This controls the task view UI shown in the right sidebar.

RULES:
- Call this as the FIRST tool in any multi-step work, before any other tools.
- Set mode to PLANNING when researching/designing, EXECUTION when writing code, VERIFICATION when testing.
- Update status every ~5 tool calls to keep user informed.
- taskName should be descriptive and human-readable, like "Implementing User Authentication".
- Change taskName when moving between major activities.
- taskStatus should describe what you're ABOUT TO DO, not what you've already done.
- taskSummary should cumulatively describe what you've accomplished so far.`,
  {
    required: ['taskName', 'mode', 'taskStatus', 'taskSummary'],
    properties: {
      taskName: {
        type: 'string',
        description: 'Name of the current task, e.g. "Implementing User Profiles". Human-readable title.',
      },
      mode: {
        type: 'string',
        description: 'Current work mode',
        enum: ['PLANNING', 'EXECUTION', 'VERIFICATION'],
      },
      taskStatus: {
        type: 'string',
        description: 'What you are about to do next. Single line, concise.',
      },
      taskSummary: {
        type: 'string',
        description: 'What has been accomplished so far. Past tense, 1-2 sentences.',
      },
      predictedTaskSize: {
        type: 'integer',
        description: 'Estimated number of tool calls remaining for this task.',
      },
    },
  }
);

export const taskBoundaryTool: Omit<Tool, 'execute'> = {
  definition: taskBoundaryDefinition,
  display: {
    displayTitle: 'Task Boundary',
    wouldLikeTo: 'set task boundary',
    isCurrently: 'setting task boundary',
    hasAlready: 'set task boundary',
    icon: 'layout-dashboard',
    group: 'agent',
  },
  behavior: {
    readonly: false,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: true,
  },
};

// ============================================================================
// Notify User Tool (communication gate)
// ============================================================================

export const notifyUserDefinition: Tool['definition'] = createToolDefinition(
  'notifyUser',
  `Communicate with the user. This is the ONLY way to send messages to the user during task execution.
Regular text output is NOT visible to the user while a task is active.

Use this to:
- Request review of artifacts (include file paths in pathsToReview)
- Ask clarifying questions that block progress
- Report completion of a major milestone

Set blockedOnUser=true if you cannot proceed without their response.
Set shouldAutoProceed=true only if you are very confident the user doesn't need to review.
Batch all independent questions into one call — minimize interruptions.`,
  {
    required: ['message', 'blockedOnUser'],
    properties: {
      message: {
        type: 'string',
        description: 'Message to the user. Be concise.',
      },
      pathsToReview: {
        type: 'array',
        description: 'File paths for the user to review (e.g. artifact paths)',
        items: { type: 'string' },
      },
      blockedOnUser: {
        type: 'boolean',
        description: 'True if you need user approval/feedback before proceeding.',
      },
      shouldAutoProceed: {
        type: 'boolean',
        description: 'True if work can continue without explicit user feedback.',
      },
    },
  }
);

export const notifyUserTool: Omit<Tool, 'execute'> = {
  definition: notifyUserDefinition,
  display: {
    displayTitle: 'Notify User',
    wouldLikeTo: 'notify you',
    isCurrently: 'waiting for your response',
    hasAlready: 'notified you',
    icon: 'message-circle',
    group: 'agent',
  },
  behavior: {
    readonly: false,
    isInstant: true,
    defaultPolicy: 'allowedWithoutPermission',
    allowsParallel: false,
  },
};
