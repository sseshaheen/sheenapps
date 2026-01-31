import type { PlanContext, TokenUsage, TransformInput } from '../types/modular';

export interface AIProvider {
  name: string;

  // Granular methods for different operations
  plan(prompt: string, context: PlanContext, sessionId?: string): Promise<{
    tasks: any[];
    usage: TokenUsage;
    claudeSessionId?: string;
  }>;

  planStream?(prompt: string, context: PlanContext, sessionId?: string): AsyncIterableIterator<{
    tasks: any[];
    usage: TokenUsage;
    claudeSessionId?: string;
  }>;

  transform(input: TransformInput, sessionId?: string): Promise<{
    output: any;
    usage: TokenUsage;
    claudeSessionId?: string;
  }>;

  // Session-aware transform with context
  transformWithSession?(input: TransformInput, sessionId: string, contextPrompt: string): Promise<{
    output: any;
    usage: TokenUsage;
    claudeSessionId?: string;
  }>;

  // Support for tool/function calling
  callWithTools?(
    prompt: string,
    tools: ToolDefinition[]
  ): Promise<{
    response: string;
    toolCalls?: ToolCall[];
    usage: TokenUsage;
  }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any; // JSON Schema
}

export interface ToolCall {
  name: string;
  arguments: any;
}