import { CodexMessageParser, CodexEvent, AgentEvent } from '../codexMessageParser';
import { SAMPLE_EVENTS, EDGE_CASES, SESSION_FLOWS, createItemEvent } from '../../../__tests__/helpers/codexTestFixtures';

describe('CodexMessageParser', () => {
  let parser: CodexMessageParser;

  beforeEach(() => {
    parser = new CodexMessageParser();
  });

  describe('parse() - Event Type Parsing', () => {
    describe('thread.started', () => {
      it('parses thread.started and extracts thread_id', () => {
        const result = parser.parse(SAMPLE_EVENTS.threadStarted);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('thread.started');
        expect(result!.thread_id).toBe('th_abc123');
        expect(result!.raw).toBeDefined();
      });

      it('stores thread_id in parser state', () => {
        parser.parse(SAMPLE_EVENTS.threadStarted);
        expect(parser.getSessionId()).toBe('th_abc123');
      });
    });

    describe('turn.started', () => {
      it('parses turn.started and extracts turn_id', () => {
        const result = parser.parse(SAMPLE_EVENTS.turnStarted);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('turn.started');
        expect(result!.turn_id).toBe('turn_001');
      });
    });

    describe('turn.completed', () => {
      it('parses turn.completed with usage', () => {
        const result = parser.parse(SAMPLE_EVENTS.turnCompleted);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('turn.completed');
        expect(result!.usage).toEqual({
          input_tokens: 150,
          output_tokens: 75,
          cached_input_tokens: 50
        });
      });

      it('parses turn.completed without usage', () => {
        const result = parser.parse(SAMPLE_EVENTS.turnCompletedNoUsage);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('turn.completed');
        expect(result!.usage).toBeUndefined();
      });

      it('stores usage in parser state', () => {
        parser.parse(SAMPLE_EVENTS.turnCompleted);
        expect(parser.getUsage()).toEqual({
          input_tokens: 150,
          output_tokens: 75,
          cached_input_tokens: 50
        });
      });
    });

    describe('turn.failed', () => {
      it('parses turn.failed and extracts error', () => {
        const result = parser.parse(SAMPLE_EVENTS.turnFailed);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('turn.failed');
        expect(result!.error).toEqual({
          code: 'rate_limit',
          message: 'Rate limit exceeded'
        });
      });

      it('stores error in parser state', () => {
        parser.parse(SAMPLE_EVENTS.turnFailed);
        expect(parser.getError()).toEqual({
          code: 'rate_limit',
          message: 'Rate limit exceeded'
        });
      });
    });

    describe('error', () => {
      it('parses error event with code and message', () => {
        const result = parser.parse(SAMPLE_EVENTS.errorEvent);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('error');
        expect(result!.error).toEqual({
          code: 'internal_error',
          message: 'Something went wrong'
        });
      });

      it('parses error event without code', () => {
        const result = parser.parse(SAMPLE_EVENTS.errorEventNoCode);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('error');
        expect(result!.error!.message).toBe('Generic error');
      });
    });

    describe('unknown event type', () => {
      it('returns type unknown for unrecognized events', () => {
        const result = parser.parse(SAMPLE_EVENTS.unknownEvent);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('unknown');
        expect(result!.raw).toBeDefined();
      });

      it('does not throw on unknown events', () => {
        expect(() => parser.parse(SAMPLE_EVENTS.unknownEvent)).not.toThrow();
      });
    });
  });

  describe('parse() - Item Events', () => {
    describe('item.started', () => {
      it('parses item.started for agent_message', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemStartedMessage);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('item.started');
        expect(result!.item).toBeDefined();
        expect(result!.item!.type).toBe('agent_message');
        expect(result!.item!.id).toBe('item_1');
      });

      it('parses item.started for file_change', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemStartedFileCreate);

        expect(result).not.toBeNull();
        expect(result!.item!.type).toBe('file_change');
        expect(result!.item!.action).toBe('create');
        expect(result!.item!.file_path).toBe('src/App.tsx');
      });

      it('parses item.started for command_execution', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemStartedBash);

        expect(result).not.toBeNull();
        expect(result!.item!.type).toBe('command_execution');
        expect(result!.item!.command).toBe('npm install');
      });
    });

    describe('item.updated', () => {
      it('parses item.updated with partial content', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemUpdatedMessage);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('item.updated');
        expect(result!.item!.text).toBe('Hello...');
      });
    });

    describe('item.completed', () => {
      it('parses item.completed for agent_message with text', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemCompletedMessage);

        expect(result).not.toBeNull();
        expect(result!.type).toBe('item.completed');
        expect(result!.item!.text).toBe('Hello, I will help you build this app.');
      });

      it('stores finalMessage from completed agent_message', () => {
        parser.parse(SAMPLE_EVENTS.itemCompletedMessage);
        expect(parser.getFinalMessage()).toBe('Hello, I will help you build this app.');
      });

      it('parses item.completed for file_change with content', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemCompletedFileCreate);

        expect(result).not.toBeNull();
        expect(result!.item!.content).toContain('export default function App()');
      });

      it('parses item.completed for command_execution with output', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemCompletedBash);

        expect(result).not.toBeNull();
        expect(result!.item!.exit_code).toBe(0);
        expect(result!.item!.output).toBe('added 500 packages');
      });

      it('parses item.completed for reasoning', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemCompletedReasoning);

        expect(result).not.toBeNull();
        expect(result!.item!.type).toBe('reasoning');
        expect(result!.item!.reasoning).toContain('React component');
      });

      it('parses item.completed for web_search with results', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemCompletedWebSearch);

        expect(result).not.toBeNull();
        expect(result!.item!.type).toBe('web_search');
        expect(result!.item!.query).toBe('react hooks tutorial');
        expect(result!.item!.results).toHaveLength(1);
      });

      it('parses item.completed for todo_list', () => {
        const result = parser.parse(SAMPLE_EVENTS.itemCompletedTodoList);

        expect(result).not.toBeNull();
        expect(result!.item!.type).toBe('todo_list');
        expect(result!.item!.todos).toHaveLength(3);
        expect(result!.item!.todos![0]!.status).toBe('completed');
      });
    });
  });

  describe('parse() - Edge Cases', () => {
    it('returns null for empty line', () => {
      expect(parser.parse(EDGE_CASES.emptyLine)).toBeNull();
    });

    it('returns null for whitespace-only line', () => {
      expect(parser.parse(EDGE_CASES.whitespaceOnly)).toBeNull();
    });

    it('returns null for non-JSON line', () => {
      expect(parser.parse(EDGE_CASES.nonJsonLine)).toBeNull();
    });

    it('returns null for line containing "codex"', () => {
      expect(parser.parse(EDGE_CASES.codexVersionLine)).toBeNull();
    });

    it('returns null for malformed JSON', () => {
      // Should not throw
      expect(() => parser.parse(EDGE_CASES.malformedJson)).not.toThrow();
      expect(parser.parse(EDGE_CASES.malformedJson)).toBeNull();
    });

    it('returns null for line not starting with brace', () => {
      expect(parser.parse(EDGE_CASES.lineNotStartingWithBrace)).toBeNull();
    });

    it('handles unicode content correctly', () => {
      const result = parser.parse(EDGE_CASES.unicodeContent);

      expect(result).not.toBeNull();
      expect(result!.item!.text).toContain('你好世界');
      expect(result!.item!.text).toContain('🌍');
    });

    it('handles very long lines', () => {
      const result = parser.parse(EDGE_CASES.veryLongLine);

      expect(result).not.toBeNull();
      expect(result!.item!.text!.length).toBe(10000);
    });

    it('handles nested JSON in content', () => {
      const result = parser.parse(EDGE_CASES.nestedJson);

      expect(result).not.toBeNull();
      expect(result!.item!.text).toContain('nested');
    });

    it('ignores extra fields gracefully', () => {
      const result = parser.parse(EDGE_CASES.extraFields);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('thread.started');
      expect(result!.thread_id).toBe('th_123');
    });
  });

  describe('State Accumulation', () => {
    it('accumulates tool calls from item events', () => {
      parser.parse(SAMPLE_EVENTS.itemStartedFileCreate);
      parser.parse(SAMPLE_EVENTS.itemCompletedFileCreate);
      parser.parse(SAMPLE_EVENTS.itemStartedBash);
      parser.parse(SAMPLE_EVENTS.itemCompletedBash);

      const toolCalls = parser.getToolCalls();
      expect(toolCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('tracks multiple messages updating finalMessage', () => {
      parser.parse(SAMPLE_EVENTS.itemCompletedMessage);
      expect(parser.getFinalMessage()).toBe('Hello, I will help you build this app.');

      // Parse another message
      const secondMessage = createItemEvent('item.completed', 'agent_message', { text: 'Task complete!' });
      parser.parse(secondMessage);
      expect(parser.getFinalMessage()).toBe('Task complete!');
    });

    it('processes full session flow correctly', () => {
      SESSION_FLOWS.simpleSuccess.forEach(line => parser.parse(line));

      expect(parser.getSessionId()).toBe('th_abc123');
      expect(parser.getFinalMessage()).toBe('Hello, I will help you build this app.');
      expect(parser.getUsage()).toEqual({
        input_tokens: 150,
        output_tokens: 75,
        cached_input_tokens: 50
      });
      expect(parser.getError()).toBeNull();
    });
  });

  describe('reset()', () => {
    it('clears all accumulated state', () => {
      // Accumulate state
      parser.parse(SAMPLE_EVENTS.threadStarted);
      parser.parse(SAMPLE_EVENTS.itemCompletedMessage);
      parser.parse(SAMPLE_EVENTS.turnCompleted);
      parser.parse(SAMPLE_EVENTS.itemStartedFileCreate);

      // Verify state is set
      expect(parser.getSessionId()).not.toBeNull();
      expect(parser.getFinalMessage()).not.toBe('');
      expect(parser.getUsage()).not.toBeNull();
      expect(parser.getToolCalls().length).toBeGreaterThan(0);

      // Reset
      parser.reset();

      // Verify state is cleared
      expect(parser.getSessionId()).toBeNull();
      expect(parser.getFinalMessage()).toBe('');
      expect(parser.getUsage()).toBeNull();
      expect(parser.getError()).toBeNull();
      expect(parser.getToolCalls()).toHaveLength(0);
    });
  });

  describe('toAgentEvent() - Event Conversion', () => {
    it('converts thread.started to session_start', () => {
      const event = parser.parse(SAMPLE_EVENTS.threadStarted)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).not.toBeNull();
      expect(agentEvent!.type).toBe('session_start');
      expect(agentEvent!.sessionId).toBe('th_abc123');
      expect(agentEvent!.source).toBe('codex');
    });

    it('converts turn.completed with usage to usage event', () => {
      const event = parser.parse(SAMPLE_EVENTS.turnCompleted)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).not.toBeNull();
      expect(agentEvent!.type).toBe('usage');
      expect(agentEvent!.inputTokens).toBe(150);
      expect(agentEvent!.outputTokens).toBe(75);
    });

    it('returns null for turn.completed without usage', () => {
      const event = parser.parse(SAMPLE_EVENTS.turnCompletedNoUsage)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).toBeNull();
    });

    it('converts item.completed agent_message to message event', () => {
      const event = parser.parse(SAMPLE_EVENTS.itemCompletedMessage)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).not.toBeNull();
      expect(agentEvent!.type).toBe('message');
      expect(agentEvent!.text).toBe('Hello, I will help you build this app.');
    });

    it('returns null for item.started agent_message', () => {
      const event = parser.parse(SAMPLE_EVENTS.itemStartedMessage)!;
      const agentEvent = parser.toAgentEvent(event);

      // agent_message started doesn't produce an event (no text yet)
      expect(agentEvent).toBeNull();
    });

    it('converts item.started file_change to tool_call', () => {
      const event = parser.parse(SAMPLE_EVENTS.itemStartedFileCreate)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).not.toBeNull();
      expect(agentEvent!.type).toBe('tool_call');
      expect(agentEvent!.tool).toBe('Write');
      expect(agentEvent!.status).toBe('started');
    });

    it('converts item.completed file_change to tool_result', () => {
      const event = parser.parse(SAMPLE_EVENTS.itemCompletedFileCreate)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).not.toBeNull();
      expect(agentEvent!.type).toBe('tool_result');
      expect(agentEvent!.tool).toBe('Write');
      expect(agentEvent!.status).toBe('completed');
      expect(agentEvent!.toolResult).toContain('create');
    });

    it('converts file_change modify to Edit tool', () => {
      const event = parser.parse(SAMPLE_EVENTS.itemStartedFileModify)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent!.tool).toBe('Edit');
    });

    it('converts command_execution to Bash tool', () => {
      const event = parser.parse(SAMPLE_EVENTS.itemStartedBash)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).not.toBeNull();
      expect(agentEvent!.type).toBe('tool_call');
      expect(agentEvent!.tool).toBe('Bash');
      expect(agentEvent!.toolInput).toEqual({ command: 'npm install' });
    });

    it('converts reasoning to progress event', () => {
      const event = parser.parse(SAMPLE_EVENTS.itemCompletedReasoning)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).not.toBeNull();
      expect(agentEvent!.type).toBe('progress');
      expect(agentEvent!.text).toContain('React component');
    });

    it('converts error to error event', () => {
      const event = parser.parse(SAMPLE_EVENTS.errorEvent)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).not.toBeNull();
      expect(agentEvent!.type).toBe('error');
      expect(agentEvent!.text).toBe('Something went wrong');
    });

    it('converts turn.failed to error event', () => {
      const event = parser.parse(SAMPLE_EVENTS.turnFailed)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).not.toBeNull();
      expect(agentEvent!.type).toBe('error');
      expect(agentEvent!.text).toBe('Rate limit exceeded');
    });

    it('returns null for unknown event types', () => {
      const event = parser.parse(SAMPLE_EVENTS.unknownEvent)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).toBeNull();
    });

    it('returns null for turn.started', () => {
      const event = parser.parse(SAMPLE_EVENTS.turnStarted)!;
      const agentEvent = parser.toAgentEvent(event);

      expect(agentEvent).toBeNull();
    });
  });

  describe('itemToToolCall() - Tool Mapping', () => {
    it('maps file_change create to Write', () => {
      parser.parse(SAMPLE_EVENTS.itemStartedFileCreate);
      const toolCalls = parser.getToolCalls();

      expect(toolCalls.some(tc => tc.tool === 'Write')).toBe(true);
    });

    it('maps file_change modify to Edit', () => {
      parser.parse(SAMPLE_EVENTS.itemStartedFileModify);
      const toolCalls = parser.getToolCalls();

      expect(toolCalls.some(tc => tc.tool === 'Edit')).toBe(true);
    });

    it('maps command_execution to Bash', () => {
      parser.parse(SAMPLE_EVENTS.itemStartedBash);
      const toolCalls = parser.getToolCalls();

      expect(toolCalls.some(tc => tc.tool === 'Bash')).toBe(true);
    });

    it('maps web_search to WebSearch', () => {
      parser.parse(SAMPLE_EVENTS.itemStartedWebSearch);
      const toolCalls = parser.getToolCalls();

      expect(toolCalls.some(tc => tc.tool === 'WebSearch')).toBe(true);
    });

    it('maps todo_list to TodoWrite', () => {
      parser.parse(SAMPLE_EVENTS.itemCompletedTodoList);
      const toolCalls = parser.getToolCalls();

      expect(toolCalls.some(tc => tc.tool === 'TodoWrite')).toBe(true);
    });

    it('does not create tool call for agent_message', () => {
      parser.parse(SAMPLE_EVENTS.itemCompletedMessage);
      const toolCalls = parser.getToolCalls();

      expect(toolCalls.some(tc => tc.tool === 'Write' || tc.tool === 'Edit' || tc.tool === 'Bash')).toBe(false);
    });

    it('does not create tool call for reasoning', () => {
      parser.parse(SAMPLE_EVENTS.itemCompletedReasoning);
      const toolCalls = parser.getToolCalls();

      expect(toolCalls.length).toBe(0); // reasoning is not a tool
    });

    it('maps unknown item types to Unknown tool', () => {
      parser.parse(SAMPLE_EVENTS.itemCompletedMcp);
      const toolCalls = parser.getToolCalls();

      expect(toolCalls.some(tc => tc.tool === 'Unknown')).toBe(true);
    });
  });

  describe('Static Methods', () => {
    describe('isToolUse()', () => {
      it('returns true for file_change item', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemStartedFileCreate)!;
        expect(CodexMessageParser.isToolUse(event)).toBe(true);
      });

      it('returns true for command_execution item', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemStartedBash)!;
        expect(CodexMessageParser.isToolUse(event)).toBe(true);
      });

      it('returns true for web_search item', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemStartedWebSearch)!;
        expect(CodexMessageParser.isToolUse(event)).toBe(true);
      });

      it('returns true for mcp_tool_call item', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemStartedMcp)!;
        expect(CodexMessageParser.isToolUse(event)).toBe(true);
      });

      it('returns false for agent_message item', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemStartedMessage)!;
        expect(CodexMessageParser.isToolUse(event)).toBe(false);
      });

      it('returns false for reasoning item', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemCompletedReasoning)!;
        expect(CodexMessageParser.isToolUse(event)).toBe(false);
      });

      it('returns false for non-item events', () => {
        const event = parser.parse(SAMPLE_EVENTS.threadStarted)!;
        expect(CodexMessageParser.isToolUse(event)).toBe(false);
      });
    });

    describe('extractToolUses()', () => {
      it('extracts file_change as Write/Edit', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemCompletedFileCreate)!;
        const toolUses = CodexMessageParser.extractToolUses(event);

        expect(toolUses).toHaveLength(1);
        expect(toolUses[0]!.name).toBe('Write');
        expect(toolUses[0]!.input.file_path).toBe('src/App.tsx');
      });

      it('extracts file_change modify as Edit', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemCompletedFileModify)!;
        const toolUses = CodexMessageParser.extractToolUses(event);

        expect(toolUses[0]!.name).toBe('Edit');
      });

      it('extracts command_execution as Bash', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemCompletedBash)!;
        const toolUses = CodexMessageParser.extractToolUses(event);

        expect(toolUses).toHaveLength(1);
        expect(toolUses[0]!.name).toBe('Bash');
        expect(toolUses[0]!.input.command).toBe('npm install');
      });

      it('extracts web_search as WebSearch', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemCompletedWebSearch)!;
        const toolUses = CodexMessageParser.extractToolUses(event);

        expect(toolUses).toHaveLength(1);
        expect(toolUses[0]!.name).toBe('WebSearch');
        expect(toolUses[0]!.input.query).toBe('react hooks tutorial');
      });

      it('returns empty array for non-tool items', () => {
        const event = parser.parse(SAMPLE_EVENTS.itemCompletedMessage)!;
        const toolUses = CodexMessageParser.extractToolUses(event);

        expect(toolUses).toHaveLength(0);
      });

      it('returns empty array for non-item events', () => {
        const event = parser.parse(SAMPLE_EVENTS.threadStarted)!;
        const toolUses = CodexMessageParser.extractToolUses(event);

        expect(toolUses).toHaveLength(0);
      });
    });
  });

  describe('Full Session Flow Processing', () => {
    it('processes simple success flow', () => {
      SESSION_FLOWS.simpleSuccess.forEach(line => parser.parse(line));

      expect(parser.getSessionId()).toBe('th_abc123');
      expect(parser.getFinalMessage()).not.toBe('');
      expect(parser.getUsage()).not.toBeNull();
      expect(parser.getError()).toBeNull();
    });

    it('processes file creation flow', () => {
      SESSION_FLOWS.fileCreation.forEach(line => parser.parse(line));

      const toolCalls = parser.getToolCalls();
      expect(toolCalls.some(tc => tc.tool === 'Write')).toBe(true);
    });

    it('processes command execution flow', () => {
      SESSION_FLOWS.commandExecution.forEach(line => parser.parse(line));

      const toolCalls = parser.getToolCalls();
      expect(toolCalls.some(tc => tc.tool === 'Bash')).toBe(true);
    });

    it('processes turn failure flow', () => {
      SESSION_FLOWS.turnFailure.forEach(line => parser.parse(line));

      expect(parser.getError()).not.toBeNull();
      expect(parser.getError()!.message).toBe('Rate limit exceeded');
    });

    it('processes error during session flow', () => {
      SESSION_FLOWS.errorDuringSession.forEach(line => parser.parse(line));

      expect(parser.getError()).not.toBeNull();
    });

    it('processes complex session with multiple tools', () => {
      SESSION_FLOWS.complexSession.forEach(line => parser.parse(line));

      const toolCalls = parser.getToolCalls();
      expect(toolCalls.length).toBeGreaterThanOrEqual(4); // file create, file modify, bash, todo
      expect(parser.getFinalMessage()).not.toBe('');
      expect(parser.getUsage()).not.toBeNull();
    });
  });
});
