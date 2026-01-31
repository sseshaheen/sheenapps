import { ulid } from 'ulid';
import type { PlanContext, TokenUsage, TransformInput } from '../types/modular';
import type { AIProvider } from './aiProvider';
import { ClaudeExecutorFactory } from './executors/claudeExecutorFactory';
import type { IClaudeExecutor } from './IClaudeExecutor';

/**
 * Extract the first balanced JSON array from text.
 * More robust than regex which grabs first [ to last ].
 * Properly handles brackets inside JSON strings like "text [like this]".
 */
function extractFirstJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];

    // Handle string state
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    // Not in string - check for brackets and string start
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // Unbalanced brackets
}

/**
 * Extract the first balanced JSON object from text.
 * Same string-aware logic as extractFirstJsonArray.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export class ClaudeCLIProvider implements AIProvider {
  name = 'claude-cli';
  private executor: IClaudeExecutor;

  constructor() {
    this.executor = ClaudeExecutorFactory.create();
  }

  async initialize(): Promise<void> {
    const isHealthy = await this.executor.healthCheck();
    if (!isHealthy) {
      throw new Error('Claude executor health check failed');
    }
    console.log('✅ Claude CLI provider initialized');
  }

  async plan(prompt: string, context: PlanContext, sessionId?: string): Promise<{
    tasks: any[];
    usage: TokenUsage;
    claudeSessionId?: string;
  }> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildPlanPrompt(prompt, context);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await this.runClaudeCLI(fullPrompt, context.projectPath, sessionId);
    const tasks = this.parsePlanResponse(response.output);

    // Use real token usage if available, otherwise estimate
    const usage = response.usage || this.estimateUsage(fullPrompt, response.output);

    return { tasks, usage, claudeSessionId: response.sessionId };
  }

  async transform(input: TransformInput, sessionId?: string): Promise<{
    output: any;
    usage: TokenUsage;
    claudeSessionId?: string;
  }> {
    const prompts = this.getTransformPrompts();
    const systemPrompt = this.getTransformSystemPrompt(input.type);
    const userPrompt = prompts[input.type](input);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // Use projectPath from context if available
    const projectPath = input.context?.projectPath;
    const response = await this.runClaudeCLI(fullPrompt, projectPath, sessionId);
    const output = this.parseTransformResponse(response.output, input.type);

    // Use real token usage if available, otherwise estimate
    const usage = response.usage || this.estimateUsage(fullPrompt, response.output);

    return { output, usage, claudeSessionId: response.sessionId };
  }

  async transformWithSession(input: TransformInput, sessionId: string, contextPrompt: string): Promise<{
    output: any;
    usage: TokenUsage;
    claudeSessionId?: string;
  }> {
    const prompts = this.getTransformPrompts();
    const systemPrompt = this.getTransformSystemPrompt(input.type);
    const userPrompt = prompts[input.type](input);

    // Prepend context prompt to maintain session awareness
    const fullPrompt = `${systemPrompt}\n\n${contextPrompt}\n\n${userPrompt}`;

    // Use projectPath from context if available
    const projectPath = input.context?.projectPath;
    const response = await this.runClaudeCLI(fullPrompt, projectPath, sessionId);
    const output = this.parseTransformResponse(response.output, input.type);

    // Use real token usage if available, otherwise estimate
    const usage = response.usage || this.estimateUsage(fullPrompt, response.output);

    return { output, usage, claudeSessionId: response.sessionId };
  }

  private async runClaudeCLI(prompt: string, cwd?: string, sessionId?: string): Promise<{
    output: string;
    sessionId?: string;
    usage?: TokenUsage;
  }> {
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];

    // Only add --dangerously-skip-permissions if explicitly enabled via env var
    // This flag is powerful and should be gated for safety
    if (process.env.CLAUDE_SKIP_PERMISSIONS === 'true') {
      args.push("--dangerously-skip-permissions");
    }

    // Add resume flag if session ID is provided
    if (sessionId) {
      args.push("-r", sessionId);
    }

    try {
      const result = await this.executor.execute(prompt, args, cwd);

      // Return usage directly instead of storing in shared state (race condition fix)
      const usage = result.usage ? {
        promptTokens: result.usage.inputTokens,
        completionTokens: result.usage.outputTokens,
        totalCost: result.usage.totalCost
      } : undefined;

      return {
        output: result.output,
        sessionId: result.sessionId,
        usage
      };
    } catch (error: any) {
      console.error(`[Claude CLI] Execution error: ${error.message}`);
      throw new Error(`Claude CLI failed: ${error.message}`);
    }
  }

  private buildSystemPrompt(): string {
    return `You are an AI assistant that generates structured task plans for software development projects.

CRITICAL DEPENDENCY COMPATIBILITY TABLE (follow these exactly):
| Stack | Required Versions | Notes |
|-------|------------------|-------|
| Next.js 15 (recommended) | next@^15.0.0 + react@^19.0.0 + typescript@^5.0.0 | App Router, Server Components by default |
| Vite + React | vite@^6.0.0 + react@^19.0.0 + typescript@^5.0.0 | Fast SPA/client-only apps |
| Create React App (CRA) | react-scripts@5.0.1 + typescript@^4.9.5 | LEGACY - prefer Vite or Next.js |
| Plain React | react@^19.0.0 + react-dom@^19.0.0 | No build tool needed |

PREFER Next.js 15 for new projects - it provides Server Components, server actions, and better patterns.
NEVER mix: react-scripts + TypeScript 5, react-scripts + ESLint 9, React 18 + Next.js 15

Your response must be a valid JSON array of tasks. Each task must have these fields:
- id: unique identifier (string)
- type: one of "create_file", "modify_file", "create_component", "setup_config", "install_deps"
- name: short descriptive name (string)
- description: detailed description (string)
- estimatedDuration: time in seconds (number)
- priority: 1-10 where 1 is highest (number)
- input: object with prompt, context, targetPath, and dependencies

Example response format:
[
  {
    "id": "task-1",
    "type": "setup_config",
    "name": "Setup TypeScript Config",
    "description": "Create tsconfig.json with React settings",
    "estimatedDuration": 10,
    "priority": 1,
    "input": {
      "prompt": "Create TypeScript configuration for React",
      "targetPath": "tsconfig.json"
    }
  }
]

IMPORTANT:
- Return ONLY the JSON array, no markdown formatting or explanation
- Tasks should be in logical order
- Include all necessary dependencies between tasks
- Use realistic time estimates for agentic tasks`;
  }

  private buildPlanPrompt(prompt: string, context: PlanContext): string {
    return `Create a task plan for the following request:

"${prompt}"

Project context:
- Framework: ${context.framework}
- Project path: ${context.projectPath}
- Existing files: ${context.existingFiles.length > 0 ? context.existingFiles.join(', ') : 'none'}

Generate a comprehensive task plan that will accomplish the user's request. Include all necessary files, configurations, and dependencies.

Remember to return ONLY a valid JSON array of tasks.`;
  }

  private getTransformSystemPrompt(type: TransformInput['type']): string {
    const prompts = {
      code_gen: `You are an expert programmer. Generate clean, well-commented code.
CRITICAL: Output ONLY the raw code without any markdown formatting or code fences.
Never include \`\`\`javascript, \`\`\`css, or any other markdown in your output.`,
      refactor: `You are a code refactoring expert. Improve code structure while maintaining functionality.
CRITICAL: Output ONLY the raw code without any markdown formatting or code fences.`,
      test_gen: `You are a testing expert. Write comprehensive tests with good coverage.
CRITICAL: Output ONLY the raw code without any markdown formatting or code fences.`,
      lint_fix: `You are a code quality expert. Fix linting issues and improve code style.
CRITICAL: Output ONLY the raw code without any markdown formatting or code fences.`,
      heal_json: 'You are a JSON expert. Fix malformed JSON to be valid.'
    };

    return prompts[type] || 'You are a helpful AI assistant.';
  }

  private getTransformPrompts() {
    return {
      code_gen: (input: TransformInput) => {
        const ctx = input.context || {};
        return `Generate code for: ${input.input}

Framework: ${ctx.framework || 'not specified'}
Target file: ${ctx.targetPath || 'not specified'}
Component type: ${ctx.componentType || 'not specified'}

Return ONLY the code, no markdown formatting or explanations.`;
      },

      refactor: (input: TransformInput) => {
        return `Refactor this code while maintaining its functionality:

${input.input}

Return ONLY the refactored code, no markdown formatting or explanations.`;
      },

      test_gen: (input: TransformInput) => {
        return `Write a simple unit test for this function:

${input.input}

Requirements:
- Write ONE simple test case
- Use a common test framework (Jest, Mocha, or describe/it style)
- Keep it concise (under 20 lines)
- Return ONLY the test code, no markdown formatting or explanations.`;
      },

      lint_fix: (input: TransformInput) => {
        return `Fix linting issues in this code:

${input.input}

Return ONLY the fixed code, no markdown formatting or explanations.`;
      },

      heal_json: (input: TransformInput) => {
        return `Fix this JSON to be valid:

${input.input}

Return ONLY the valid JSON, no markdown formatting or explanations.`;
      }
    };
  }

  /**
   * Normalize task IDs - only generate if missing.
   * Preserves existing IDs to maintain dependency references.
   */
  private normalizeTaskIds(tasks: any[]): any[] {
    return tasks.map((t) => ({
      ...t,
      // Only generate ID if missing or invalid
      id: typeof t.id === 'string' && t.id.length > 0 ? t.id : ulid(),
    }));
  }

  private parsePlanResponse(text: string): any[] {
    try {
      const trimmed = text.trim();

      // Best case: response is exact JSON array
      if (trimmed.startsWith('[')) {
        const tasks = JSON.parse(trimmed);
        if (Array.isArray(tasks)) {
          return this.normalizeTaskIds(tasks);
        }
      }

      // Otherwise, extract first balanced JSON array using bracket-balancer
      // This is more robust than regex /\[[\s\S]*\]/ which grabs first [ to last ]
      const json = extractFirstJsonArray(text);
      if (!json) {
        throw new Error('No JSON array found in response');
      }

      const tasks = JSON.parse(json);
      if (!Array.isArray(tasks)) {
        throw new Error('Response is not an array');
      }

      // Normalize IDs - only generate if missing
      return this.normalizeTaskIds(tasks);
    } catch (error) {
      console.error('Failed to parse plan response:', error);
      console.error('Response text:', text);

      // If parsing fails, create a simple task
      return [{
        id: ulid(),
        type: 'create_file',
        name: 'Create project',
        description: 'Create project based on prompt',
        estimatedDuration: 60,
        priority: 1,
        input: {
          prompt: text,
          targetPath: 'index.html'
        }
      }];
    }
  }

  private parseTransformResponse(text: string, type: TransformInput['type']): any {
    // Make sure we have a string
    if (typeof text !== 'string') {
      console.warn('parseTransformResponse received non-string:', typeof text);
      text = String(text);
    }

    // For heal_json, we need to return the actual JSON string, not parse it
    if (type === 'heal_json') {
      // Try to extract valid JSON from the response
      const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
      if (jsonMatch) {
        try {
          // Validate it's parseable
          JSON.parse(jsonMatch[0]);
          return jsonMatch[0];
        } catch (e) {
          // If not valid, return the cleaned up version
          return text.trim();
        }
      }
      // If no JSON found, return the text as is
      return text.trim();
    }

    // For other types, return the text directly
    return text.trim();
  }

  private estimateUsage(prompt: string, response: string): TokenUsage {
    // Rough estimation: 1 token ≈ 4 characters
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(response.length / 4);

    // Claude 3.5 Sonnet pricing
    const costPerMillion = {
      input: 3.00,   // $3 per million input tokens
      output: 15.00  // $15 per million output tokens
    };

    const inputCost = (promptTokens * costPerMillion.input) / 1_000_000;
    const outputCost = (completionTokens * costPerMillion.output) / 1_000_000;

    return {
      promptTokens,
      completionTokens,
      totalCost: inputCost + outputCost
    };
  }

  // Streaming is not supported with CLI
  async *planStream(prompt: string, context: PlanContext): AsyncIterableIterator<{
    tasks: any[];
    usage: TokenUsage;
  }> {
    // Fall back to non-streaming approach
    const result = await this.plan(prompt, context);
    yield result;
  }
}
