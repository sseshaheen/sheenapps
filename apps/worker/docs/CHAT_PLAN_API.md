# Chat Plan Mode API Documentation

## Overview

The Chat Plan API simplifies the frontend integration by removing the need for frontend-managed state. The AI automatically determines the intent of user messages, and all session/version/build state is managed backend-side.

## Key Features

1. **No Frontend State Management**: 
   - No need to determine `chatMode` - AI classifies intent automatically
   - No need to manage `sessionId` - backend uses `projects.last_ai_session_id`
   - No need to provide `versionId`/`buildId` - backend fetches from projects table

2. **Single-Pass AI Classification**: 
   - One Claude call handles both classification and response
   - Reduces latency and token usage

3. **Automatic Session Continuity**: 
   - Sessions automatically resume from last Claude interaction
   - Works across builds, updates, and chat interactions

## API Endpoints

### 1. Process Chat Request (Simplified)

**Endpoint**: `POST /v1/chat-plan`

**Request**:
```typescript
interface SimplifiedChatRequest {
  userId: string;
  projectId: string;
  message: string;
  locale?: string;  // Optional, for i18n (e.g., 'en-US', 'ar-EG')
  context?: {       // Optional additional context
    includeVersionHistory?: boolean;
    includeProjectStructure?: boolean;
    includeBuildErrors?: boolean;
  };
}
```

**Response**:
```typescript
interface ChatResponse {
  type: 'chat_response';
  subtype: 'success' | 'error' | 'partial';
  sessionId: string;  // For reference only - frontend doesn't need to manage
  messageId: string;
  timestamp: string;
  mode: 'question' | 'feature' | 'fix' | 'analysis' | 'general' | 'build';  // AI-determined
  data: any;  // Response structure depends on mode
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

**Example Request**:
```bash
curl -X POST https://worker.example.com/v1/chat-plan \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: <hmac_signature>" \
  -d '{
    "userId": "user-123",
    "projectId": "proj-456",
    "message": "How do I add authentication to my app?",
    "locale": "en-US"
  }'
```

**Example Response**:
```json
{
  "type": "chat_response",
  "subtype": "success",
  "sessionId": "clm9x2...",
  "messageId": "msg-789",
  "timestamp": "2025-01-09T12:00:00Z",
  "mode": "question",  // AI determined this is a question
  "data": {
    "answer": "To add authentication to your React app, you can use...",
    "references": [
      { "file": "src/App.tsx", "line": 45, "snippet": "..." }
    ],
    "relatedTopics": ["authorization", "JWT tokens", "session management"]
  },
  "metadata": {
    "duration_ms": 2500,
    "tokens_used": 1250,
    "projectContext": {
      "versionId": "ver-123",
      "buildId": "build-456",
      "lastModified": "2025-01-09T11:00:00Z"
    }
  }
}
```

### 2. Convert Plan to Build

**Endpoint**: `POST /v1/chat-plan/convert-to-build`

Same as v1 but simplified response.

### 3. Get Project Timeline

**Endpoint**: `GET /v1/project/:projectId/timeline`

Same as v1 with enhanced filtering.

### 4. Get Session Details

**Endpoint**: `GET /v1/chat-plan/session/:sessionId`

Same as v1.

## Streaming Support (SSE)

The `/v1/chat-plan` endpoint supports Server-Sent Events for real-time streaming:

```javascript
const eventSource = new EventSource('/v1/chat-plan', {
  method: 'POST',
  headers: {
    'Accept': 'text/event-stream',
    'Content-Type': 'application/json',
    'x-sheen-signature': signature
  },
  body: JSON.stringify({
    userId: 'user-123',
    projectId: 'proj-456',
    message: 'Analyze my codebase for security issues'
  })
});

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  // Handle streaming response
});

eventSource.addEventListener('complete', () => {
  eventSource.close();
});
```

## Frontend Integration Examples

### React Hook Example

```typescript
// hooks/useChatPlan.ts
import { useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  mode?: string;
  timestamp: Date;
}

export function useChatPlan(projectId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (message: string) => {
    setIsLoading(true);
    
    // Add user message to UI immediately
    setMessages(prev => [...prev, {
      role: 'user',
      content: message,
      timestamp: new Date()
    }]);

    try {
      const response = await fetch('/v1/chat-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sheen-signature': generateHmacSignature(...)
        },
        body: JSON.stringify({
          userId: getCurrentUserId(),
          projectId,
          message,
          locale: navigator.language
        })
      });

      const data = await response.json();
      
      // Add AI response
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: formatResponseByMode(data.mode, data.data),
        mode: data.mode,
        timestamp: new Date(data.timestamp)
      }]);

      // Handle available actions
      if (data.availableActions?.some(a => a.type === 'convert_to_build')) {
        // Show "Execute Plan" button
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, sendMessage, isLoading };
}
```

### Simple Chat Component

```typescript
// components/ChatPlan.tsx
export function ChatPlan({ projectId }: { projectId: string }) {
  const { messages, sendMessage, isLoading } = useChatPlan(projectId);
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>
      
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your code..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

## AI Intent Classification

The backend uses a sophisticated prompt to classify user intent in a single pass:

- **Questions**: "How do I...", "What is...", "Where is..."
- **Features**: "Add...", "Implement...", "Create..."
- **Fixes**: "Fix...", "Not working", "Error when..."
- **Analysis**: "Analyze...", "Review...", "Check..."
- **Build**: "Build this", "Execute", "Deploy"
- **General**: Everything else

The AI response is automatically structured based on the detected intent.

## Error Handling

```typescript
// Check for specific error codes
const response = await fetch('/v1/chat-plan', {...});
const data = await response.json();

if (data.subtype === 'error') {
  switch (data.error.code) {
    case 'INSUFFICIENT_BALANCE':
      // Show purchase prompt
      break;
    case 'PROJECT_NOT_FOUND':
      // Redirect to project creation
      break;
    case 'RATE_LIMIT_EXCEEDED':
      // Show rate limit message
      break;
    default:
      // Generic error handling
  }
}
```

## Best Practices

1. **Don't store sessionId**: The backend manages all session state
2. **Always send locale**: Enables proper i18n responses
3. **Handle streaming for long operations**: Analysis and feature planning can take time
4. **Show mode in UI**: Let users know how the AI interpreted their message
5. **Use available actions**: Show contextual buttons based on response
6. **Implement retry logic**: Network failures should retry automatically

## Rate Limits

- 100 requests/hour per user
- 200 requests/hour per project
- 50 messages per session

## Billing

Approximate AI time consumption:
- Questions: ~30 seconds
- Features: ~120 seconds
- Fixes: ~90 seconds
- Analysis: ~180 seconds
- General: ~30 seconds

## Conclusion

The v2 API dramatically simplifies frontend integration while providing more intelligent responses through AI classification. The backend handles all complexity around session management, state tracking, and context preservation, allowing the frontend to focus on user experience.