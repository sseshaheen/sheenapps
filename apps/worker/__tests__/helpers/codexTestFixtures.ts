/**
 * Test fixtures for Codex JSONL event parsing
 */

// Individual event samples
export const SAMPLE_EVENTS = {
  // Thread/Turn lifecycle
  threadStarted: '{"type":"thread.started","thread_id":"th_abc123"}',
  turnStarted: '{"type":"turn.started","turn_id":"turn_001"}',
  turnCompleted: '{"type":"turn.completed","usage":{"input_tokens":150,"output_tokens":75,"cached_input_tokens":50}}',
  turnCompletedNoUsage: '{"type":"turn.completed"}',
  turnFailed: '{"type":"turn.failed","error":{"code":"rate_limit","message":"Rate limit exceeded"}}',

  // Item events - agent_message
  itemStartedMessage: '{"type":"item.started","item":{"id":"item_1","type":"agent_message"}}',
  itemUpdatedMessage: '{"type":"item.updated","item":{"id":"item_1","type":"agent_message","text":"Hello..."}}',
  itemCompletedMessage: '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Hello, I will help you build this app."}}',

  // Item events - file_change
  itemStartedFileCreate: '{"type":"item.started","item":{"id":"item_2","type":"file_change","action":"create","file_path":"src/App.tsx"}}',
  itemCompletedFileCreate: '{"type":"item.completed","item":{"id":"item_2","type":"file_change","action":"create","file_path":"src/App.tsx","content":"export default function App() { return <div>Hello</div>; }"}}',
  itemStartedFileModify: '{"type":"item.started","item":{"id":"item_3","type":"file_change","action":"modify","file_path":"src/index.ts"}}',
  itemCompletedFileModify: '{"type":"item.completed","item":{"id":"item_3","type":"file_change","action":"modify","file_path":"src/index.ts","content":"console.log(1);"}}',
  itemStartedFileDelete: '{"type":"item.started","item":{"id":"item_4","type":"file_change","action":"delete","file_path":"old.ts"}}',

  // Item events - command_execution
  itemStartedBash: '{"type":"item.started","item":{"id":"item_5","type":"command_execution","command":"npm install"}}',
  itemCompletedBash: '{"type":"item.completed","item":{"id":"item_5","type":"command_execution","command":"npm install","exit_code":0,"output":"added 500 packages"}}',
  itemCompletedBashFailed: '{"type":"item.completed","item":{"id":"item_6","type":"command_execution","command":"npm test","exit_code":1,"output":"1 test failed"}}',

  // Item events - reasoning
  itemStartedReasoning: '{"type":"item.started","item":{"id":"item_7","type":"reasoning"}}',
  itemCompletedReasoning: '{"type":"item.completed","item":{"id":"item_7","type":"reasoning","reasoning":"I will create a React component with TypeScript..."}}',

  // Item events - web_search
  itemStartedWebSearch: '{"type":"item.started","item":{"id":"item_8","type":"web_search","query":"react hooks tutorial"}}',
  itemCompletedWebSearch: '{"type":"item.completed","item":{"id":"item_8","type":"web_search","query":"react hooks tutorial","results":[{"title":"React Hooks","url":"https://react.dev"}]}}',

  // Item events - todo_list
  itemCompletedTodoList: '{"type":"item.completed","item":{"id":"item_9","type":"todo_list","todos":[{"content":"Create App.tsx","status":"completed"},{"content":"Add styles","status":"in_progress"},{"content":"Write tests","status":"pending"}]}}',

  // Item events - mcp_tool_call
  itemStartedMcp: '{"type":"item.started","item":{"id":"item_10","type":"mcp_tool_call"}}',
  itemCompletedMcp: '{"type":"item.completed","item":{"id":"item_10","type":"mcp_tool_call"}}',

  // Item events - plan_update
  itemCompletedPlanUpdate: '{"type":"item.completed","item":{"id":"item_11","type":"plan_update"}}',

  // Error events
  errorEvent: '{"type":"error","error":{"code":"internal_error","message":"Something went wrong"}}',
  errorEventNoCode: '{"type":"error","message":"Generic error"}',

  // Unknown event type (for forward compatibility testing)
  unknownEvent: '{"type":"future.new_event","data":{"foo":"bar"}}'
};

// Edge case inputs
export const EDGE_CASES = {
  emptyLine: '',
  whitespaceOnly: '   \t\n  ',
  nonJsonLine: 'Loading codex...',
  codexVersionLine: 'codex v1.0.0',
  malformedJson: '{"type":"thread.started", broken',
  lineNotStartingWithBrace: 'text before {"type":"error"}',
  unicodeContent: '{"type":"item.completed","item":{"id":"item_u","type":"agent_message","text":"你好世界 🌍"}}',
  veryLongLine: `{"type":"item.completed","item":{"id":"item_long","type":"agent_message","text":"${'a'.repeat(10000)}"}}`,
  nestedJson: '{"type":"item.completed","item":{"id":"item_n","type":"agent_message","text":"{\\"nested\\":true}"}}',
  extraFields: '{"type":"thread.started","thread_id":"th_123","extra_field":"ignored","another":123}'
};

// Complete session flows
export const SESSION_FLOWS = {
  // Successful simple session
  simpleSuccess: [
    SAMPLE_EVENTS.threadStarted,
    SAMPLE_EVENTS.turnStarted,
    SAMPLE_EVENTS.itemStartedMessage,
    SAMPLE_EVENTS.itemCompletedMessage,
    SAMPLE_EVENTS.turnCompleted
  ],

  // Session with file creation
  fileCreation: [
    SAMPLE_EVENTS.threadStarted,
    SAMPLE_EVENTS.turnStarted,
    SAMPLE_EVENTS.itemStartedMessage,
    SAMPLE_EVENTS.itemCompletedMessage,
    SAMPLE_EVENTS.itemStartedFileCreate,
    SAMPLE_EVENTS.itemCompletedFileCreate,
    SAMPLE_EVENTS.turnCompleted
  ],

  // Session with command execution
  commandExecution: [
    SAMPLE_EVENTS.threadStarted,
    SAMPLE_EVENTS.turnStarted,
    SAMPLE_EVENTS.itemStartedBash,
    SAMPLE_EVENTS.itemCompletedBash,
    SAMPLE_EVENTS.turnCompleted
  ],

  // Session that fails
  turnFailure: [
    SAMPLE_EVENTS.threadStarted,
    SAMPLE_EVENTS.turnStarted,
    SAMPLE_EVENTS.itemStartedMessage,
    SAMPLE_EVENTS.turnFailed
  ],

  // Session with error event
  errorDuringSession: [
    SAMPLE_EVENTS.threadStarted,
    SAMPLE_EVENTS.turnStarted,
    SAMPLE_EVENTS.errorEvent
  ],

  // Complex session with multiple tools
  complexSession: [
    SAMPLE_EVENTS.threadStarted,
    SAMPLE_EVENTS.turnStarted,
    SAMPLE_EVENTS.itemStartedMessage,
    SAMPLE_EVENTS.itemCompletedMessage,
    SAMPLE_EVENTS.itemCompletedTodoList,
    SAMPLE_EVENTS.itemStartedFileCreate,
    SAMPLE_EVENTS.itemCompletedFileCreate,
    SAMPLE_EVENTS.itemStartedFileModify,
    SAMPLE_EVENTS.itemCompletedFileModify,
    SAMPLE_EVENTS.itemStartedBash,
    SAMPLE_EVENTS.itemCompletedBash,
    SAMPLE_EVENTS.itemCompletedReasoning,
    SAMPLE_EVENTS.turnCompleted
  ]
};

// Parsed event structures for assertion
export const EXPECTED_PARSED = {
  threadStarted: {
    type: 'thread.started',
    thread_id: 'th_abc123'
  },
  turnCompleted: {
    type: 'turn.completed',
    usage: {
      input_tokens: 150,
      output_tokens: 75,
      cached_input_tokens: 50
    }
  },
  turnFailed: {
    type: 'turn.failed',
    error: {
      code: 'rate_limit',
      message: 'Rate limit exceeded'
    }
  }
};

// Helper to create custom events
export function createEvent(type: string, data: Record<string, any> = {}): string {
  return JSON.stringify({ type, ...data });
}

// Helper to create item event
export function createItemEvent(
  eventType: 'item.started' | 'item.updated' | 'item.completed',
  itemType: string,
  itemData: Record<string, any> = {}
): string {
  return JSON.stringify({
    type: eventType,
    item: {
      id: `item_${Date.now()}`,
      type: itemType,
      ...itemData
    }
  });
}
