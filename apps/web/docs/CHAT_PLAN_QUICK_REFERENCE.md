# Chat Plan API - Quick Reference Card

## 🚀 Quick Start

```bash
npm install event-source-polyfill
```

## 📍 Endpoint
```
POST https://api.yourworker.com/v1/chat-plan
```

## 🔐 Authentication
```typescript
headers: {
  'X-HMAC-Signature': hmacSignature,
  'X-HMAC-Timestamp': timestamp,
  'Accept': 'text/event-stream',  // For streaming
  'Accept-Language': 'en-US'      // User locale
}
```

## 📤 Request
```typescript
{
  userId: string,
  projectId: string,
  message: string,
  locale?: string,
  context?: {
    includeVersionHistory?: boolean,
    includeProjectStructure?: boolean,
    includeBuildErrors?: boolean
  }
}
```

## 📥 Stream Events

| Event | Description | Key Data |
|-------|-------------|----------|
| `connection` | Session started | `sessionId`, `resumedFrom?` |
| `assistant_text` | Claude's response | `text`, `index`, `isPartial` |
| `tool_use` | Tool being used | `toolName`, `input`, `description` |
| `tool_result` | Tool output | `toolUseId`, `preview`, `size` |
| `progress_update` | Progress status | `stage`, `message` (template key) |
| `complete` | Response done | `fullResponse`, `duration`, `sessionId` |
| `error` | Error occurred | `code`, `params`, `recoverable` |

## 🎯 Response Modes

- `question` - Code Q&A with references
- `feature` - Feature planning with steps
- `fix` - Bug fix with solution approach
- `analysis` - Code analysis results
- `general` - General conversation
- `build` - Triggers actual build

## 💻 Minimal Implementation

```typescript
import { EventSourcePolyfill } from 'event-source-polyfill';

const eventSource = new EventSourcePolyfill('/v1/chat-plan', {
  method: 'POST',
  headers: {
    'Accept': 'text/event-stream',
    'Content-Type': 'application/json',
    'X-HMAC-Signature': signature,
    'X-HMAC-Timestamp': timestamp
  },
  body: JSON.stringify({
    userId: 'user123',
    projectId: 'proj456',
    message: 'How do I implement authentication?'
  })
});

eventSource.addEventListener('assistant_text', (e) => {
  const data = JSON.parse(e.data);
  console.log('Claude:', data.text);
});

eventSource.addEventListener('complete', (e) => {
  const data = JSON.parse(e.data);
  console.log('Done:', data.fullResponse);
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  console.error('Error:', JSON.parse(e.data));
  eventSource.close();
});
```

## 🌍 i18n Template Keys

### Tools
- `CHAT_TOOL_READ_FILE` - Reading {file}...
- `CHAT_TOOL_SEARCH_CODE` - Searching for '{pattern}'...
- `CHAT_TOOL_FIND_FILES` - Finding files matching '{pattern}'...
- `CHAT_TOOL_WRITE_FILE` - Writing to {file}...
- `CHAT_TOOL_EDIT_FILE` - Editing {file}...

### Errors
- `CHAT_ERROR_INSUFFICIENT_BALANCE` - Need {required} mins, have {available}
- `CHAT_ERROR_TIMEOUT` - Request timed out
- `CHAT_ERROR_GENERAL` - Error: {message}

### Status
- `CHAT_CONNECTION_ESTABLISHED` - Connected to AI
- `CHAT_ANALYZING` - Analyzing request
- `CHAT_PROCESSING` - Processing
- `CHAT_FINALIZING` - Finalizing response
- `CHAT_COMPLETE_SUCCESS` - Response complete

## ⚡ React Hook

```typescript
function useChatStream(projectId: string, userId: string) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const sendMessage = async (text: string) => {
    setIsStreaming(true);
    // ... EventSource setup
    // ... Event handlers
    setIsStreaming(false);
  };
  
  return { messages, isStreaming, sendMessage };
}
```

## 🔧 Common Patterns

### Retry with Backoff
```typescript
const delay = Math.pow(2, retryCount) * 1000;
await new Promise(r => setTimeout(r, delay));
```

### Keepalive Detection
```typescript
let lastEvent = Date.now();
setInterval(() => {
  if (Date.now() - lastEvent > 30000) {
    // Reconnect
  }
}, 10000);
```

### Message Accumulation
```typescript
let fullText = '';
eventSource.addEventListener('assistant_text', (e) => {
  fullText += JSON.parse(e.data).text;
});
```

## 🚨 Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| `INSUFFICIENT_BALANCE` | Not enough AI time | Purchase more |
| `TIMEOUT` | Request took too long | Retry |
| `PARSE_FAILED` | Invalid response | Report bug |
| `GENERAL` | Unknown error | Check logs |

## 📊 Metrics to Track

- Time to first byte (target: < 500ms)
- Stream completion rate
- Error rate by type
- Average response time
- Token usage per request

## 🎨 UI Best Practices

1. **Show streaming indicator** - Pulsing dots or typing animation
2. **Display tool usage** - Show what Claude is doing
3. **Progressive rendering** - Display text as it arrives
4. **Error recovery** - Offer retry button
5. **Session persistence** - Save conversation locally

## 🔗 Related Docs

- [Full API Reference](./CHAT_PLAN_API_REFERENCE.md)
- [i18n Examples](./CHAT_STREAMING_I18N_EXAMPLE.md)
- [Implementation Plan](./CHAT_PLAN_STREAMING_IMPLEMENTATION.md)

## 💡 Tips

- Use `event-source-polyfill` for POST support
- Close EventSource on component unmount
- Implement timeout (1-2 minutes)
- Cache HMAC signatures briefly
- Debounce user input (300ms)
- Virtual scroll for long chats
- Save drafts in localStorage