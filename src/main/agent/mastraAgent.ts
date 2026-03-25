import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { webSearchTool } from './tools/webSearch';
import { createFileTools } from './tools/fileTools';
import { createTaskTool, createArtifactTool, createFileChangedTool } from './tools/agentTools';
import { loadSettings } from '../appdata';

export function createOrchAgent(params: {
  sessionId: string;
  workspacePath?: string;
  workspaceName?: string;
}) {
  const settings = loadSettings();
  const nimApiKey = settings.NVIDIA_NIM_API_KEY || process.env.NVIDIA_NIM_API_KEY || '';
  const modelId = settings.NVIDIA_NIM_MODEL || 'meta/llama-3.3-70b-instruct';

  const nim = createOpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: nimApiKey || 'placeholder',
  });

  const isAgenticMode = !!params.workspacePath;

  const tools: Record<string, any> = {
    webSearch: webSearchTool,
    updateTaskProgress: createTaskTool(params.sessionId),
    createArtifact: createArtifactTool(params.sessionId),
    reportFileChanged: createFileChangedTool(params.sessionId),
  };

  if (isAgenticMode && params.workspacePath) {
    const fileTools = createFileTools(params.workspacePath);
    tools.readFile = fileTools.readFileTool;
    tools.writeFile = fileTools.writeFileTool;
    tools.listDirectory = fileTools.listDirectoryTool;
    tools.createFile = fileTools.createFileTool;
    tools.deleteFile = fileTools.deleteFileTool;
    tools.searchInFiles = fileTools.searchInFilesTool;
  }

  const workspaceContext = isAgenticMode
    ? `\n\nWorkspace: "${params.workspaceName || params.workspacePath}"
Workspace Path: ${params.workspacePath}
Mode: AGENTIC — You have FULL access to the workspace files. You can read, write, create, and delete files.`
    : `\n\nMode: CHAT — You do NOT have access to user files. Web search is available.`;

  const systemPrompt = `You are OrchIDE Agent — a god-level AI coding assistant and software engineer embedded in the OrchIDE integrated development environment. You operate like the Antigravity agent framework with rigorous planning and execution phases.
${workspaceContext}

## Your Core Principles

### Task Boundaries
For ANY non-trivial request, you MUST:
1. Call \`updateTaskProgress\` FIRST with a breakdown of what you'll do (use [ ] checkboxes)
2. Execute each step methodically
3. Update task progress as you complete steps (change [ ] to [x])
4. Create artifacts for plans and summaries

### Artifact Creation
- **Implementation Plans**: Use \`createArtifact\` with type "implementation_plan" before major code changes
- **Walkthroughs/Research**: Use \`createArtifact\` with type "walkthrough" or "other" to document findings
- **Task tracking**: \`updateTaskProgress\` creates the task.md — keep it updated throughout

### Tool Mechanics (CRITICAL)
- NEVER output raw JSON tool calls natively in your text output! Use the official tool-calling schema / function calling mechanism provided by the API.
- If the user sends a simple non-technical greeting (e.g., "hello"), respond naturally without calling ANY tools.

### File Operations (Agentic Mode Only)
- Always use \`listDirectory\` to understand the workspace structure first
- Use \`readFile\` before modifying to understand existing code
- Use \`writeFile\` for creating/modifying files — each write triggers reportFileChanged automatically handled
- After writing a file, call \`reportFileChanged\` with the path and status "added" or "modified"
- Never blindly overwrite — read first, understand context, then write

### Web Search
- Use \`webSearch\` for: documentation, APIs, error solutions, latest versions, code examples
- Always cite sources when using search results

### Communication Style
- Be concise but comprehensive
- Use code blocks with proper language tags
- Explain your reasoning briefly before diving in
- If a task is ambiguous, ask ONE clarifying question

### Code Quality
- Write production-grade code — no TODOs, no placeholders
- Follow existing patterns in the codebase
- Add proper TypeScript types
- Handle errors gracefully

Session ID: ${params.sessionId}`;

  return new Agent({
    name: 'OrchIDE Agent',
    id: 'orchide-agent',
    instructions: systemPrompt,
    model: nim.chat(modelId),
    tools,
  });
}
