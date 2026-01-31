import { ulid } from 'ulid';
import type { PlanContext, TokenUsage, TransformInput } from '../types/modular';
import type { AIProvider } from './aiProvider';
import { CodexSession, CodexSessionResult } from '../stream/codexSession';
import { CodexSpawnOptions } from '../stream/codexProcess';

/**
 * Configuration for Codex CLI Provider
 */
export interface CodexProviderConfig {
  model?: string;  // e.g., 'gpt-5.2-codex', 'gpt-5.1-codex-max'
  approvalPolicy?: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  sandboxMode?: 'off' | 'workspace-write' | 'workspace-full';
  skipGitRepoCheck?: boolean;
  codexHome?: string;
  apiKey?: string;
}

/**
 * CodexCLIProvider - AI provider implementation using OpenAI Codex CLI
 *
 * Mirrors ClaudeCLIProvider's interface for compatibility with existing infrastructure.
 * Uses CodexSession for process management and JSONL parsing.
 */
export class CodexCLIProvider implements AIProvider {
  name = 'codex-cli';
  private config: CodexProviderConfig;
  private lastUsage?: TokenUsage;

  constructor(config: CodexProviderConfig = {}) {
    this.config = {
      approvalPolicy: 'never',  // Default to non-interactive
      sandboxMode: 'workspace-write',  // Default to safe sandbox
      skipGitRepoCheck: true,  // Default to skip for ephemeral workspaces
      ...config
    };
  }

  async initialize(): Promise<void> {
    // Verify Codex is available by checking if binary exists
    const isHealthy = await this.healthCheck();
    if (!isHealthy) {
      throw new Error('Codex CLI health check failed - binary not found');
    }
    console.log('✅ Codex CLI provider initialized');
  }

  /**
   * Health check - verify Codex CLI is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { execSync } = require('child_process');
      execSync('codex --version', { stdio: 'pipe' });
      return true;
    } catch {
      console.warn('[CodexCLIProvider] Codex CLI not found in PATH');
      return false;
    }
  }

  async plan(prompt: string, context: PlanContext, sessionId?: string): Promise<{
    tasks: any[];
    usage: TokenUsage;
    claudeSessionId?: string;  // Keep name for compatibility, maps to thread_id
  }> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildPlanPrompt(prompt, context);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await this.runCodex(fullPrompt, context.projectPath, sessionId);
    const responseText = typeof response.result === 'string' ? response.result : String(response.result ?? '');
    const tasks = this.parsePlanResponse(responseText);

    // Use real token usage if available, otherwise estimate
    const usage = this.lastUsage || this.estimateUsage(fullPrompt, responseText);

    return { tasks, usage, ...(response.sessionId && { claudeSessionId: response.sessionId }) };
  }

  async transform(input: TransformInput, sessionId?: string): Promise<{
    output: any;
    usage: TokenUsage;
    claudeSessionId?: string;
  }> {
    const prompts = this.getTransformPrompts();
    const systemPrompt = this.getTransformSystemPrompt(input.type);
    const promptFn = prompts[input.type];
    if (!promptFn) {
      throw new Error(`No prompt function for type: ${input.type}`);
    }
    const userPrompt = promptFn(input);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const projectPath = input.context?.projectPath;
    const response = await this.runCodex(fullPrompt, projectPath, sessionId);
    const responseText = typeof response.result === 'string' ? response.result : String(response.result ?? '');
    const output = this.parseTransformResponse(responseText, input.type);

    const usage = this.lastUsage || this.estimateUsage(fullPrompt, responseText);

    return { output, usage, ...(response.sessionId && { claudeSessionId: response.sessionId }) };
  }

  async transformWithSession(input: TransformInput, sessionId: string, contextPrompt: string): Promise<{
    output: any;
    usage: TokenUsage;
    claudeSessionId?: string;
  }> {
    const prompts = this.getTransformPrompts();
    const systemPrompt = this.getTransformSystemPrompt(input.type);
    const promptFn = prompts[input.type];
    if (!promptFn) {
      throw new Error(`No prompt function for type: ${input.type}`);
    }
    const userPrompt = promptFn(input);

    const fullPrompt = `${systemPrompt}\n\n${contextPrompt}\n\n${userPrompt}`;

    const projectPath = input.context?.projectPath;
    const response = await this.runCodex(fullPrompt, projectPath, sessionId);
    const responseText = typeof response.result === 'string' ? response.result : String(response.result ?? '');
    const output = this.parseTransformResponse(responseText, input.type);

    const usage = this.lastUsage || this.estimateUsage(fullPrompt, responseText);

    return { output, usage, ...(response.sessionId && { claudeSessionId: response.sessionId }) };
  }

  /**
   * Run Codex CLI via CodexSession
   */
  private async runCodex(
    prompt: string,
    cwd?: string,
    sessionId?: string
  ): Promise<CodexSessionResult> {
    const session = new CodexSession();
    const buildId = `codex-${ulid()}`;  // Generate a build ID for tracking

    const spawnOptions: Partial<CodexSpawnOptions> = {
      ...(this.config.model && { model: this.config.model }),
      ...(this.config.approvalPolicy && { approvalPolicy: this.config.approvalPolicy }),
      ...(this.config.sandboxMode && { sandboxMode: this.config.sandboxMode }),
      ...(this.config.skipGitRepoCheck !== undefined && { skipGitRepoCheck: this.config.skipGitRepoCheck }),
      ...(this.config.codexHome && { codexHome: this.config.codexHome }),
      ...(this.config.apiKey && { apiKey: this.config.apiKey })
    };

    try {
      let result: CodexSessionResult;

      if (sessionId) {
        // Resume existing session/thread
        result = await session.resume(
          sessionId,
          prompt,
          cwd || process.cwd(),
          buildId,
          undefined,  // timeoutMs - use default
          undefined,  // userId
          undefined,  // projectId
          spawnOptions
        );

        // If session not found, fall back to new session
        if (result.needsFallback) {
          console.log(`[CodexCLIProvider] Session ${sessionId} not found, creating new session`);
          result = await session.run(
            prompt,
            cwd || process.cwd(),
            buildId,
            undefined,  // timeoutMs - use default
            undefined,  // userId
            undefined,  // projectId
            spawnOptions
          );
        }
      } else {
        // New session
        result = await session.run(
          prompt,
          cwd || process.cwd(),
          buildId,
          undefined,  // timeoutMs - use default
          undefined,  // userId
          undefined,  // projectId
          spawnOptions
        );
      }

      // Store usage if available
      if (result.tokenUsage) {
        this.lastUsage = {
          promptTokens: result.tokenUsage.input,
          completionTokens: result.tokenUsage.output,
          totalCost: result.totalCost || this.estimateCost(result.tokenUsage.input, result.tokenUsage.output)
        };
      }

      if (!result.success) {
        throw new Error(result.error || 'Codex execution failed');
      }

      return result;

    } catch (error: any) {
      console.error(`[Codex CLI] Execution error: ${error.message}`);
      throw new Error(`Codex CLI failed: ${error.message}`);
    }
  }

  /**
   * Estimate cost based on token counts (GPT-5.2 Codex pricing)
   */
  private estimateCost(inputTokens: number, outputTokens: number): number {
    // GPT-5.2 Codex pricing (estimated - adjust based on actual pricing)
    const costPerMillion = {
      input: 10.00,   // $10 per million input tokens (estimated)
      output: 30.00   // $30 per million output tokens (estimated)
    };

    const inputCost = (inputTokens * costPerMillion.input) / 1_000_000;
    const outputCost = (outputTokens * costPerMillion.output) / 1_000_000;

    return inputCost + outputCost;
  }

  private buildSystemPrompt(): string {
    return `You are an AI assistant that generates structured task plans for software development projects.

CRITICAL DEPENDENCY COMPATIBILITY TABLE (follow these exactly):
| Stack | Required Versions | Notes |
|-------|------------------|-------|
| Create React App (CRA) | react-scripts@5.0.1 + typescript@^4.9.5 | CRA 5 doesn't support TS 5+ |
| Vite + React | vite@^5.0.0 + typescript@^5.0.0 | Modern, fast alternative |
| Next.js 14 | next@^14.0.0 + typescript@^5.0.0 | Full-stack React |
| Plain React | react@^18.2.0 + react-dom@^18.2.0 | No build tool needed |

NEVER mix: react-scripts + TypeScript 5, react-scripts + ESLint 9, React 17 + react-scripts 5

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
    const prompts: Record<string, string> = {
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

  private getTransformPrompts(): Record<string, (input: TransformInput) => string> {
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

  private parsePlanResponse(text: string): any[] {
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const tasks = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(tasks)) {
        throw new Error('Response is not an array');
      }

      return tasks.map(task => ({
        ...task,
        id: ulid()
      }));
    } catch (error) {
      console.error('Failed to parse plan response:', error);
      console.error('Response text:', text);

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
    if (typeof text !== 'string') {
      console.warn('parseTransformResponse received non-string:', typeof text);
      text = String(text);
    }

    if (type === 'heal_json') {
      const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[0]);
          return jsonMatch[0];
        } catch (e) {
          return text.trim();
        }
      }
      return text.trim();
    }

    return text.trim();
  }

  private estimateUsage(prompt: string, response: string): TokenUsage {
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(response.length / 4);

    return {
      promptTokens,
      completionTokens,
      totalCost: this.estimateCost(promptTokens, completionTokens)
    };
  }

  // Streaming is not supported with CLI
  async *planStream(prompt: string, context: PlanContext): AsyncIterableIterator<{
    tasks: any[];
    usage: TokenUsage;
  }> {
    const result = await this.plan(prompt, context);
    yield result;
  }
}
