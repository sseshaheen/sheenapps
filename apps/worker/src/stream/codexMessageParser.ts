/**
 * CodexMessageParser - Parse OpenAI Codex CLI JSONL output
 *
 * Codex outputs events in a different format than Claude:
 * - thread.started, turn.started, turn.completed, turn.failed
 * - item.started, item.updated, item.completed
 * - error
 *
 * Item types: agent_message, reasoning, command_execution, file_change,
 *             mcp_tool_call, web_search, todo_list, plan_update
 */

export interface CodexEvent {
  type: 'thread.started' | 'turn.started' | 'turn.completed' | 'turn.failed' |
        'item.started' | 'item.updated' | 'item.completed' | 'error' | 'unknown';

  // Thread/Turn fields
  thread_id?: string;
  turn_id?: string;

  // Usage (on turn.completed)
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens?: number;
  };

  // Item fields
  item?: CodexItem;

  // Error fields
  error?: {
    code?: string;
    message: string;
  };

  // Raw event for debugging
  raw?: any;
}

export interface CodexItem {
  id: string;
  type: 'agent_message' | 'reasoning' | 'command_execution' | 'file_change' |
        'mcp_tool_call' | 'web_search' | 'todo_list' | 'plan_update' | 'error';
  status?: 'in_progress' | 'completed' | 'failed';

  // For agent_message
  text?: string;

  // For command_execution
  command?: string;
  exit_code?: number;
  output?: string;

  // For file_change
  file_path?: string;
  action?: 'create' | 'modify' | 'delete';
  content?: string;

  // For web_search
  query?: string;
  results?: any[];

  // For todo_list
  todos?: Array<{ content: string; status: string }>;

  // For reasoning
  reasoning?: string;

  // Progress for item.updated
  progress?: number;
}

/**
 * Normalized tool call format (compatible with Claude's format)
 */
export interface NormalizedToolCall {
  tool: 'Write' | 'Edit' | 'Bash' | 'Read' | 'TodoWrite' | 'WebSearch' | 'Unknown';
  input: any;
  status: 'started' | 'completed' | 'failed';
}

/**
 * Normalized event format for unified frontend streaming
 */
export interface AgentEvent {
  type: 'message' | 'tool_call' | 'tool_result' | 'progress' | 'error' | 'usage' | 'session_start';

  // For messages
  text?: string;

  // For tool calls
  tool?: string;
  toolInput?: any;
  toolResult?: string;

  // For progress
  status?: 'started' | 'completed' | 'failed';
  itemId?: string;

  // For usage
  inputTokens?: number;
  outputTokens?: number;

  // For session_start
  sessionId?: string;

  // Always include source and raw for debugging
  source: 'codex';
  raw: any;
}

export class CodexMessageParser {
  private threadId: string | null = null;
  private currentTurn: string | null = null;
  private finalMessage: string = '';
  private usage: { input_tokens: number; output_tokens: number; cached_input_tokens?: number } | null = null;
  private hasCompletedTurn = false;
  private error: CodexEvent['error'] | null = null;
  private toolCalls: NormalizedToolCall[] = [];

  /**
   * Parse a single JSONL line from Codex output
   */
  parse(line: string): CodexEvent | null {
    try {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) {
        return null;
      }

      const event = JSON.parse(trimmed) as any;

      // Handle known event types
      switch (event.type) {
        case 'thread.started':
          this.threadId = event.thread_id;
          return {
            type: 'thread.started',
            thread_id: event.thread_id,
            raw: event
          };

        case 'turn.started':
          this.currentTurn = event.turn_id;
          return {
            type: 'turn.started',
            turn_id: event.turn_id,
            raw: event
          };

        case 'turn.completed':
          if (event.usage) {
            this.usage = event.usage;
          }
          this.hasCompletedTurn = true;
          return {
            type: 'turn.completed',
            usage: event.usage,
            raw: event
          };

        case 'turn.failed':
          this.error = event.error;
          return {
            type: 'turn.failed',
            error: event.error,
            raw: event
          };

        case 'item.started':
        case 'item.updated':
        case 'item.completed':
          return this.parseItemEvent(event);

        case 'error':
          this.error = event.error || { message: event.message || 'Unknown error' };
          return {
            type: 'error',
            ...(this.error ? { error: this.error } : {}),
            raw: event
          };

        default:
          // Unknown event type - log but don't crash
          console.warn(`[CodexMessageParser] Unknown event type: ${event.type}`, event);
          return {
            type: 'unknown',
            raw: event
          };
      }
    } catch (e) {
      // Not all lines are JSON (progress output, etc.)
      if (line.includes('codex') || line.trim() === '') {
        return null;
      }
      console.error('[CodexMessageParser] Failed to parse line:', line);
      console.error('[CodexMessageParser] Error:', e);
      return null;
    }
  }

  /**
   * Parse item.* events and track tool calls
   */
  private parseItemEvent(event: any): CodexEvent {
    const item = event.item as CodexItem;

    // Track final message from agent_message items
    if (item?.type === 'agent_message' && event.type === 'item.completed' && item.text) {
      this.finalMessage = item.text;
    }

    // Track tool calls
    if (event.type === 'item.started' || event.type === 'item.completed') {
      const toolCall = this.itemToToolCall(item, event.type === 'item.completed' ? 'completed' : 'started');
      if (toolCall) {
        this.toolCalls.push(toolCall);
      }
    }

    return {
      type: event.type,
      item,
      raw: event
    };
  }

  /**
   * Convert Codex item to normalized tool call format
   */
  private itemToToolCall(item: CodexItem, status: 'started' | 'completed' | 'failed'): NormalizedToolCall | null {
    if (!item) return null;

    switch (item.type) {
      case 'file_change':
        return {
          tool: item.action === 'modify' ? 'Edit' : 'Write',
          input: {
            file_path: item.file_path,
            content: item.content,
            action: item.action
          },
          status
        };

      case 'command_execution':
        return {
          tool: 'Bash',
          input: {
            command: item.command,
            exit_code: item.exit_code,
            output: item.output
          },
          status
        };

      case 'web_search':
        return {
          tool: 'WebSearch',
          input: {
            query: item.query,
            results: item.results
          },
          status
        };

      case 'todo_list':
        return {
          tool: 'TodoWrite',
          input: {
            todos: item.todos
          },
          status
        };

      case 'agent_message':
      case 'reasoning':
        // Not tool calls
        return null;

      default:
        return {
          tool: 'Unknown',
          input: item,
          status
        };
    }
  }

  /**
   * Convert CodexEvent to normalized AgentEvent for unified streaming
   */
  toAgentEvent(event: CodexEvent): AgentEvent | null {
    switch (event.type) {
      case 'thread.started':
        return {
          type: 'session_start',
          ...(event.thread_id ? { sessionId: event.thread_id } : {}),
          source: 'codex',
          raw: event.raw
        } as AgentEvent;

      case 'turn.completed':
        if (event.usage) {
          return {
            type: 'usage',
            inputTokens: event.usage.input_tokens,
            outputTokens: event.usage.output_tokens,
            source: 'codex',
            raw: event.raw
          };
        }
        return null;

      case 'item.started':
      case 'item.completed':
        return this.itemToAgentEvent(event);

      case 'error':
      case 'turn.failed':
        return {
          type: 'error',
          text: event.error?.message || 'Unknown error',
          source: 'codex',
          raw: event.raw
        };

      default:
        return null;
    }
  }

  /**
   * Convert item event to AgentEvent
   */
  private itemToAgentEvent(event: CodexEvent): AgentEvent | null {
    const item = event.item;
    if (!item) return null;

    const status = event.type === 'item.completed' ? 'completed' : 'started';

    switch (item.type) {
      case 'agent_message':
        if (status === 'completed' && item.text) {
          return {
            type: 'message',
            text: item.text,
            source: 'codex',
            raw: event.raw
          };
        }
        return null;

      case 'file_change':
        return {
          type: status === 'completed' ? 'tool_result' : 'tool_call',
          tool: item.action === 'modify' ? 'Edit' : 'Write',
          toolInput: { file_path: item.file_path, action: item.action },
          ...(status === 'completed' ? { toolResult: `${item.action}: ${item.file_path}` } : {}),
          status,
          itemId: item.id,
          source: 'codex',
          raw: event.raw
        } as AgentEvent;

      case 'command_execution':
        return {
          type: status === 'completed' ? 'tool_result' : 'tool_call',
          tool: 'Bash',
          toolInput: { command: item.command },
          ...(status === 'completed' && item.output ? { toolResult: item.output } : {}),
          status,
          itemId: item.id,
          source: 'codex',
          raw: event.raw
        } as AgentEvent;

      case 'web_search':
        return {
          type: status === 'completed' ? 'tool_result' : 'tool_call',
          tool: 'WebSearch',
          toolInput: { query: item.query },
          status,
          itemId: item.id,
          source: 'codex',
          raw: event.raw
        } as AgentEvent;

      case 'todo_list':
        return {
          type: status === 'completed' ? 'tool_result' : 'tool_call',
          tool: 'TodoWrite',
          toolInput: { todos: item.todos },
          status,
          itemId: item.id,
          source: 'codex',
          raw: event.raw
        } as AgentEvent;

      case 'reasoning':
        return {
          type: 'progress',
          ...(item.reasoning ? { text: item.reasoning } : {}),
          status,
          itemId: item.id,
          source: 'codex',
          raw: event.raw
        } as AgentEvent;

      default:
        return {
          type: 'progress',
          status,
          itemId: item.id,
          source: 'codex',
          raw: event.raw
        };
    }
  }

  // Getters for accumulated state
  getSessionId(): string | null {
    return this.threadId;
  }

  getFinalMessage(): string {
    return this.finalMessage;
  }

  getUsage(): { input_tokens: number; output_tokens: number; cached_input_tokens?: number } | null {
    return this.usage;
  }

  getHasCompletedTurn(): boolean {
    return this.hasCompletedTurn;
  }

  getError(): CodexEvent['error'] | null {
    return this.error;
  }

  getToolCalls(): NormalizedToolCall[] {
    return this.toolCalls;
  }

  /**
   * Check if event indicates a tool use
   */
  static isToolUse(event: CodexEvent): boolean {
    if (event.type !== 'item.started' && event.type !== 'item.completed') {
      return false;
    }
    const toolTypes = ['file_change', 'command_execution', 'web_search', 'mcp_tool_call'];
    return event.item ? toolTypes.includes(event.item.type) : false;
  }

  /**
   * Extract tool uses from an event
   */
  static extractToolUses(event: CodexEvent): Array<{ name: string; input: any }> {
    if (!this.isToolUse(event) || !event.item) {
      return [];
    }

    const item = event.item;
    switch (item.type) {
      case 'file_change':
        return [{
          name: item.action === 'modify' ? 'Edit' : 'Write',
          input: { file_path: item.file_path, content: item.content }
        }];
      case 'command_execution':
        return [{
          name: 'Bash',
          input: { command: item.command }
        }];
      case 'web_search':
        return [{
          name: 'WebSearch',
          input: { query: item.query }
        }];
      default:
        return [];
    }
  }

  /**
   * Reset parser state for new session
   */
  reset(): void {
    this.threadId = null;
    this.currentTurn = null;
    this.finalMessage = '';
    this.usage = null;
    this.error = null;
    this.toolCalls = [];
  }
}
