# Chat Plan API Reference for NextJS Integration

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Endpoints](#endpoints)
4. [Streaming Events](#streaming-events)
5. [Frontend Implementation](#frontend-implementation)
6. [Error Handling](#error-handling)
7. [Localization](#localization)
8. [Code Examples](#code-examples)

## Overview

The Chat Plan API provides AI-powered assistance for code-related questions, feature planning, bug fixes, and code analysis. It supports both REST and Server-Sent Events (SSE) streaming for real-time responses.

### Base URL
```
https://api.yourworker.com/v1
```

### Key Features
- ✅ Real-time streaming of Claude's responses
- ✅ Tool usage visibility (file reading, code searching)
- ✅ Progress tracking and status updates
- ✅ Multi-language support via template keys
- ✅ Session resumption for continued conversations

## Authentication

All requests require HMAC signature authentication.

### Required Headers
```typescript
{
  'X-HMAC-Signature': string,     // HMAC-SHA256 signature
  'X-HMAC-Timestamp': string,     // Unix timestamp in seconds
  'Content-Type': 'application/json',
  'Accept-Language': string        // User's locale (e.g., 'en-US', 'ar-SA')
}
```

### HMAC Signature Generation
```typescript
import crypto from 'crypto';

function generateHmacSignature(
  method: string,
  path: string,
  body: any,
  timestamp: number,
  secret: string
): string {
  const payload = `${method}\n${path}\n${timestamp}\n${JSON.stringify(body)}`;
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// Example usage
const timestamp = Math.floor(Date.now() / 1000);
const signature = generateHmacSignature(
  'POST',
  '/v1/chat-plan',
  requestBody,
  timestamp,
  process.env.HMAC_SECRET
);
```

## Endpoints

### POST /v1/chat-plan

Main endpoint for chat interactions. Supports both REST and SSE streaming.

#### Request Body
```typescript
interface ChatPlanRequest {
  userId: string;           // User ID
  projectId: string;        // Project ID
  message: string;          // User's message (max 10,000 chars)
  locale?: string;          // Language locale (e.g., 'en-US')
  context?: {
    includeVersionHistory?: boolean;    // Include version history
    includeProjectStructure?: boolean;  // Include file structure
    includeBuildErrors?: boolean;       // Include recent errors
  };
}
```

#### REST Response (Accept: application/json)
```typescript
interface ChatPlanResponse {
  type: 'chat_response';
  subtype: 'success' | 'error';
  sessionId: string;        // Session ID for tracking
  messageId: string;        // Unique message ID
  timestamp: string;        // ISO 8601 timestamp
  mode: 'question' | 'feature' | 'fix' | 'analysis' | 'general' | 'build';
  data: {
    // Varies by mode - see Mode-Specific Responses below
  };
  metadata: {
    duration_ms: number;
    tokens_used: number;
    projectContext: {
      versionId?: string;
      buildId?: string;
      lastModified: string;
    };
  };
  availableActions?: Array<{
    type: 'convert_to_build' | 'save_plan' | 'share' | 'export';
    label: string;
    payload?: any;
  }>;
}
```

#### Streaming Response (Accept: text/event-stream)
See [Streaming Events](#streaming-events) section.

### Mode-Specific Response Data

#### Question Mode
```typescript
{
  answer: string;
  references?: Array<{
    file: string;
    line: number;
    snippet: string;
  }>;
  relatedTopics?: string[];
}
```

#### Feature Mode
```typescript
{
  summary: string;
  feasibility: 'simple' | 'moderate' | 'complex';
  plan: {
    overview: string;
    steps: Array<{
      order: number;
      title: string;
      description: string;
      files: string[];
      estimatedEffort: 'low' | 'medium' | 'high';
    }>;
    dependencies: Array<{
      name: string;
      version?: string;
      reason: string;
    }>;
    risks: string[];
    alternatives?: string[];
  };
  buildPrompt?: string;
}
```

#### Fix Mode
```typescript
{
  issue: {
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
  };
  rootCause: string;
  solution: {
    approach: string;
    changes: Array<{
      file: string;
      changeType: 'modify' | 'create' | 'delete';
      description: string;
    }>;
    testingStrategy: string;
  };
  preventionTips?: string[];
  buildPrompt?: string;
}
```

## Streaming Events

When using SSE streaming (`Accept: text/event-stream`), the API sends real-time events as Claude processes the request.

### Event Types

#### 1. assistant_text
Claude's text responses, streamed as they're generated.
```typescript
event: assistant_text
data: {
  "text": "I'll analyze your code...",
  "index": 0,                    // Chunk index
  "isPartial": false,            // Whether more text is coming
  "messageId": "msg-123"         // Optional message ID
}
```

#### 2. tool_use
Sent when Claude uses a tool (Read, Grep, Write, etc.).
```typescript
event: tool_use
data: {
  "toolName": "Read",
  "toolId": "toolu_01abc",
  "input": {
    "file_path": "/src/app.ts"
  },
  "description": "CHAT_TOOL_READ_FILE"  // Template key for i18n
}
```

#### 3. tool_result
Results from tool execution.
```typescript
event: tool_result
data: {
  "toolUseId": "toolu_01abc",
  "preview": "First few lines...",  // Truncated preview
  "size": 2048                      // Size in bytes
}
```

#### 4. progress_update
Progress indicators during processing.
```typescript
event: progress_update
data: {
  "stage": "analyzing" | "processing" | "finalizing",
  "message": "CHAT_ANALYZING"  // Template key for i18n
}
```

#### 5. complete
Final event with complete response.
```typescript
event: complete
data: {
  "fullResponse": {
    "mode": "question",
    "data": { /* mode-specific data */ }
  },
  "duration": 5432,        // milliseconds
  "sessionId": "abc-123"
}
```

#### 6. error
Error events with i18n template keys.
```typescript
event: error
data: {
  "code": "CHAT_ERROR_INSUFFICIENT_BALANCE",
  "params": {
    "required": 120,       // Raw values for formatting
    "available": 30
  },
  "recoverable": false
}
```

### Error Codes
- `CHAT_ERROR_INSUFFICIENT_BALANCE` - Not enough AI time
- `CHAT_ERROR_TIMEOUT` - Request timed out
- `CHAT_ERROR_PARSE_FAILED` - Failed to parse response
- `CHAT_ERROR_GENERAL` - General error

## Frontend Implementation

### 1. Install Dependencies
```bash
npm install event-source-polyfill
```

### 2. Create Chat Client
```typescript
// services/chatPlanClient.ts
import { EventSourcePolyfill } from 'event-source-polyfill';

export class ChatPlanClient {
  private baseUrl: string;
  private hmacSecret: string;

  constructor(baseUrl: string, hmacSecret: string) {
    this.baseUrl = baseUrl;
    this.hmacSecret = hmacSecret;
  }

  async streamChat(
    request: ChatPlanRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await this.generateHmacSignature(
      'POST',
      '/v1/chat-plan',
      request,
      timestamp
    );

    const eventSource = new EventSourcePolyfill(
      `${this.baseUrl}/v1/chat-plan`,
      {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream',
          'Content-Type': 'application/json',
          'Accept-Language': request.locale || 'en-US',
          'X-HMAC-Signature': signature,
          'X-HMAC-Timestamp': timestamp.toString()
        },
        body: JSON.stringify(request)
      }
    );

    // Handle different event types
    eventSource.addEventListener('assistant_text', (e: MessageEvent) => {
      onEvent({
        type: 'assistant_text',
        data: JSON.parse(e.data)
      });
    });

    eventSource.addEventListener('tool_use', (e: MessageEvent) => {
      onEvent({
        type: 'tool_use',
        data: JSON.parse(e.data)
      });
    });

    eventSource.addEventListener('tool_result', (e: MessageEvent) => {
      onEvent({
        type: 'tool_result',
        data: JSON.parse(e.data)
      });
    });

    eventSource.addEventListener('progress_update', (e: MessageEvent) => {
      onEvent({
        type: 'progress_update',
        data: JSON.parse(e.data)
      });
    });

    eventSource.addEventListener('complete', (e: MessageEvent) => {
      onEvent({
        type: 'complete',
        data: JSON.parse(e.data)
      });
      eventSource.close();
    });

    eventSource.addEventListener('error', (e: MessageEvent) => {
      if (e.data) {
        onEvent({
          type: 'error',
          data: JSON.parse(e.data)
        });
      }
      eventSource.close();
    });

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      eventSource.close();
    };
  }

  private async generateHmacSignature(
    method: string,
    path: string,
    body: any,
    timestamp: number
  ): Promise<string> {
    const payload = `${method}\n${path}\n${timestamp}\n${JSON.stringify(body)}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.hmacSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
```

### 3. React Hook Implementation
```typescript
// hooks/useChatPlan.ts
import { useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { ChatPlanClient } from '../services/chatPlanClient';

interface ChatMessage {
  type: 'user' | 'assistant' | 'tool' | 'error';
  content: string;
  timestamp: Date;
  metadata?: any;
}

export function useChatPlan(projectId: string, userId: string) {
  const { t, i18n } = useTranslation('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [progress, setProgress] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');

  const client = new ChatPlanClient(
    process.env.NEXT_PUBLIC_API_URL!,
    process.env.NEXT_PUBLIC_HMAC_SECRET!
  );

  const sendMessage = useCallback(async (message: string) => {
    // Add user message
    setMessages(prev => [...prev, {
      type: 'user',
      content: message,
      timestamp: new Date()
    }]);

    setIsStreaming(true);
    setCurrentText('');
    setTools([]);

    try {
      await client.streamChat(
        {
          userId,
          projectId,
          message,
          locale: i18n.language
        },
        (event) => {
          switch (event.type) {
            case 'assistant_text':
              setCurrentText(prev => prev + event.data.text);
              break;

            case 'tool_use':
              // Translate tool usage message
              const toolMsg = t(event.data.description, {
                file: event.data.input.file_path,
                pattern: event.data.input.pattern,
                tool: event.data.toolName
              });
              setTools(prev => [...prev, toolMsg]);
              break;

            case 'tool_result':
              // Optional: Show tool results
              console.log('Tool result:', event.data);
              break;

            case 'progress_update':
              // Show progress stage
              console.log('Progress:', event.data.stage);
              break;

            case 'complete':
              // Finalize the assistant message
              setMessages(prev => [...prev, {
                type: 'assistant',
                content: currentText || JSON.stringify(event.data.fullResponse.data),
                timestamp: new Date(),
                metadata: {
                  mode: event.data.fullResponse.mode,
                  duration: event.data.duration
                }
              }]);
              setIsStreaming(false);
              break;

            case 'error':
              // Translate error message
              const errorMsg = t(event.data.code, event.data.params);
              setMessages(prev => [...prev, {
                type: 'error',
                content: errorMsg,
                timestamp: new Date()
              }]);
              setIsStreaming(false);
              break;
          }
        }
      );
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        type: 'error',
        content: t('CHAT_ERROR_GENERAL', { message: error.message }),
        timestamp: new Date()
      }]);
      setIsStreaming(false);
    }
  }, [client, projectId, userId, i18n.language, t]);

  return {
    messages,
    isStreaming,
    currentText,
    tools,
    progress,
    sessionId,
    sendMessage
  };
}
```

### 4. React Component Example
```tsx
// components/ChatInterface.tsx
import { useState } from 'react';
import { useChatPlan } from '../hooks/useChatPlan';

export function ChatInterface({ projectId, userId }) {
  const {
    messages,
    isStreaming,
    currentText,
    tools,
    progress,
    sendMessage
  } = useChatPlan(projectId, userId);

  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.type}`}>
            <div className="message-content">{msg.content}</div>
            <div className="message-time">
              {msg.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="message assistant streaming">
            <div className="message-content">
              {currentText || '...'}
            </div>
            {tools.length > 0 && (
              <div className="tools-used">
                {tools.map((tool, i) => (
                  <div key={i} className="tool-badge">{tool}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {progress && (
        <div className="progress-status">
          <span>{progress}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={isStreaming}
          maxLength={10000}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          {isStreaming ? 'Processing...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
```

## Error Handling

### Network Errors
```typescript
eventSource.onerror = (error) => {
  if (eventSource.readyState === EventSource.CLOSED) {
    // Connection closed normally
  } else if (eventSource.readyState === EventSource.CONNECTING) {
    // Attempting to reconnect
  } else {
    // Network error
    console.error('Stream error:', error);
    // Implement retry logic or show error to user
  }
};
```

### Timeout Handling
```typescript
const timeout = setTimeout(() => {
  eventSource.close();
  onError('Request timed out');
}, 60000); // 1 minute timeout

eventSource.addEventListener('complete', () => {
  clearTimeout(timeout);
});
```

### Rate Limiting
The API returns 429 status for rate limiting. Implement exponential backoff:
```typescript
async function retryWithBackoff(
  fn: () => Promise<any>,
  maxRetries: number = 3
) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error.status === 429) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}
```

## Localization

### Translation Files Structure
```
/locales
  /en
    chat.json
  /ar
    chat.json
  /es
    chat.json
  /fr
    chat.json
```

### Template Keys
All user-facing messages use template keys. See [CHAT_STREAMING_I18N_EXAMPLE.md](./CHAT_STREAMING_I18N_EXAMPLE.md) for complete translation examples.

### Common Template Keys
```typescript
// Progress tracking
'CHAT_ANALYZING'
'CHAT_PROCESSING'
'CHAT_FINALIZING'

// Tool usage
'CHAT_TOOL_READ_FILE'
'CHAT_TOOL_SEARCH_CODE'
'CHAT_TOOL_FIND_FILES'
'CHAT_TOOL_WRITE_FILE'
'CHAT_TOOL_EDIT_FILE'
'CHAT_TOOL_GENERIC'


// Errors
'CHAT_ERROR_INSUFFICIENT_BALANCE'
'CHAT_ERROR_TIMEOUT'
'CHAT_ERROR_GENERAL'

// Completion
'CHAT_COMPLETE_SUCCESS'
'CHAT_COMPLETE_WITH_STATS'
```

## Best Practices

### 1. Connection Management
- Implement keepalive detection
- Close connections properly
- Handle reconnection gracefully

### 2. Memory Management
- Clear old messages periodically
- Limit message history
- Dispose of event sources properly

### 3. User Experience
- Show typing indicators during streaming
- Display tool usage for transparency
- Provide clear error messages
- Save draft messages locally

### 4. Performance
- Debounce user input
- Implement virtual scrolling for long conversations
- Cache responses when appropriate
- Use React.memo for message components

### 5. Security
- Never expose HMAC secret in frontend
- Validate all inputs
- Sanitize displayed content
- Implement CSRF protection

## Testing

### Mock SSE Server
```typescript
// __tests__/mockSSEServer.ts
export function createMockSSEServer() {
  return (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send mock events
    res.write('event: assistant_text\n');
    res.write(`data: ${JSON.stringify({
      text: 'Test response',
      index: 0,
      isPartial: false
    })}\n\n`);

    setTimeout(() => {
      res.write('event: complete\n');
      res.write(`data: ${JSON.stringify({
        fullResponse: { mode: 'question', data: {} },
        duration: 200
      })}\n\n`);
      res.end();
    }, 200);
  };
}
```

### Component Testing
```typescript
// __tests__/ChatInterface.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInterface } from '../components/ChatInterface';

jest.mock('../services/chatPlanClient');

describe('ChatInterface', () => {
  it('should send message and display response', async () => {
    const { getByPlaceholderText, getByText } = render(
      <ChatInterface projectId="test" userId="user1" />
    );

    const input = getByPlaceholderText('Ask a question...');
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => {
      expect(getByText('Test message')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(getByText(/Test response/)).toBeInTheDocument();
    });
  });
});
```

## Troubleshooting

### Common Issues

#### 1. EventSource not connecting
- Check CORS settings
- Verify HMAC signature
- Ensure proper headers

#### 2. Messages not displaying
- Check event listener names match exactly
- Verify JSON parsing
- Check console for errors

#### 3. Streaming stops unexpectedly
- Check for timeout (10 minutes max)
- Verify network stability
- Check server logs

#### 4. Incorrect locale
- Ensure Accept-Language header is set
- Verify locale format (e.g., 'en-US')
- Check translation files exist

## Support

For issues or questions:
- API Documentation: This document
- Backend Team: [Contact Info]
- Frontend Examples: See code examples above
- Error Tracking: Check application logs

## Changelog

### Version 1.0.0 (Current)
- Initial streaming implementation
- Real-time tool usage tracking
- Multi-language support
- Session resumption
- HMAC authentication
