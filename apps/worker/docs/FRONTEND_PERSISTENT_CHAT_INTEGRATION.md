# Frontend Persistent Chat Integration Guide

## Overview

This guide provides everything the Next.js frontend team needs to integrate with the new persistent chat system. The backend MVP implementation is complete and production-ready with sequence-based pagination, idempotency, real-time capabilities, i18n support, and advisor network future-proofing.

## 🎯 Key Benefits for Frontend

- **Reliable Messaging**: Idempotency prevents duplicate messages during network issues
- **Infinite Scroll**: Sequence-based pagination eliminates race conditions
- **Real-time Updates**: SSE streaming with automatic reconnection support
- **User Presence**: Live typing indicators and online status
- **Search Functionality**: Fast full-text search with highlighting
- **Read Receipts**: Unread counts and mark-as-read functionality
- **Multi-user Ready**: Actor types for client/assistant/advisor distinction
- **🌍 I18n Support**: Full internationalization with locale-aware APIs and system messages

---

## 📚 API Reference

### Base Configuration

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL; // e.g., https://api.sheenapps.com
const HMAC_SECRET = process.env.HMAC_SECRET;

// Required headers for all requests (with optional i18n support)
const getHeaders = (
  userId: string, 
  userType: 'client' | 'assistant' | 'advisor' = 'client',
  locale?: string // Optional BCP-47 locale (e.g., 'ar-EG', 'en-US', 'fr-FR')
) => ({
  'Content-Type': 'application/json',
  'X-User-Id': userId,
  'X-User-Type': userType,
  'X-HMAC-Signature': generateHmacSignature(payload), // Your existing HMAC implementation
  ...(locale && { 'X-Locale': locale }), // Include locale header if provided
});

// Helper for getting user's preferred locale
const getUserLocale = (): string => {
  // Get from Next.js router, user preferences, or browser
  return router.locale || navigator.language || 'en-US';
};
```

### 1. Chat History API

**Endpoint**: `GET /v1/projects/:projectId/chat/messages`

```typescript
interface ChatHistoryParams {
  limit?: number;        // Default 20, max 100
  before_seq?: number;   // For loading older messages
  after_seq?: number;    // For loading newer messages  
  includeSystem?: boolean; // Include system messages
  actorTypes?: ('client' | 'assistant' | 'advisor')[]; // Filter by user types
  mode?: 'all' | 'plan' | 'build'; // Filter by message mode
}

interface ChatMessage {
  id: string;
  seq: number;           // Monotonic sequence number - use for pagination
  client_msg_id?: string; // Client-generated ID for tracking
  projectId: string;
  user: {
    id: string;
    name: string;
    type: 'client' | 'assistant' | 'advisor';
    avatar?: string;
  };
  message: {
    text: string;
    type: 'user' | 'assistant' | 'system';
    mode: 'plan' | 'build' | 'unified';
    timestamp: string;
  };
  build?: {
    id: string;
    status: 'queued' | 'building' | 'completed' | 'failed';
    versionId?: string;
  };
  plan?: {
    sessionId: string;
    canBuild: boolean;
    buildPrompt?: string;
  };
  thread?: {
    parentId?: string;
  };
  metadata: {
    tokensUsed?: number;
    durationMs?: number;
  };
  // 🌍 I18n Support for System Messages
  response_data?: {
    systemMessage?: {
      code: string;           // Machine-readable code (e.g., 'presence.user_joined')
      params: Record<string, any>; // Parameters for localization
      timestamp: string;
    };
  };
  isDeleted?: boolean;
  editedAt?: string;
}

interface ChatHistoryResponse {
  messages: ChatMessage[];
  pagination: {
    start_seq: number;
    end_seq: number;
    has_more_older: boolean;
    has_more_newer: boolean;
  };
}

// Usage Example
const fetchChatHistory = async (
  projectId: string,
  userId: string, 
  params: ChatHistoryParams = {},
  locale?: string // Optional locale for i18n
): Promise<ChatHistoryResponse> => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(v => query.append(key, v));
      } else {
        query.append(key, value.toString());
      }
    }
  });

  const response = await fetch(
    `${API_BASE}/v1/projects/${projectId}/chat/messages?${query}`,
    {
      headers: getHeaders(userId, 'client', locale),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch chat history: ${response.statusText}`);
  }

  return response.json();
};
```

### 2. Send Message API

**Endpoint**: `POST /v1/projects/:projectId/chat/messages`

```typescript
interface SendMessageRequest {
  text: string;
  client_msg_id: string;  // REQUIRED - Use crypto.randomUUID()
  mode: 'plan' | 'build' | 'unified';
  actor_type?: 'client' | 'assistant' | 'advisor';
  thread?: { 
    parentId?: string; // For threaded replies
  };
}

interface SendMessageResponse {
  id: string;
  seq: number;           // Use this for optimistic update reconciliation
  client_msg_id: string;
  timestamp: string;
  duplicateOf?: string;  // Present if this was a duplicate request
}

// Usage Example - with Optimistic Updates
const sendMessage = async (
  projectId: string,
  messageText: string,
  mode: 'plan' | 'build' | 'unified' = 'unified'
): Promise<SendMessageResponse> => {
  const clientMsgId = crypto.randomUUID();
  
  // 1. Add optimistic message to UI immediately
  const optimisticMessage: ChatMessage = {
    id: 'temp-' + clientMsgId,
    seq: -1, // Temporary seq
    client_msg_id: clientMsgId,
    projectId,
    user: {
      id: userId,
      name: 'You',
      type: 'client'
    },
    message: {
      text: messageText,
      type: 'user',
      mode,
      timestamp: new Date().toISOString()
    },
    metadata: {},
    // Add loading/pending indicator
    _status: 'sending'
  };
  
  addOptimisticMessage(optimisticMessage);

  try {
    const response = await fetch(
      `${API_BASE}/v1/projects/${projectId}/chat/messages`,
      {
        method: 'POST',
        headers: getHeaders(userId, 'client', locale),
        body: JSON.stringify({
          text: messageText,
          client_msg_id: clientMsgId,
          mode
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    const result: SendMessageResponse = await response.json();
    
    // 2. Update optimistic message with server response
    updateOptimisticMessage(clientMsgId, {
      id: result.id,
      seq: result.seq,
      timestamp: result.timestamp,
      _status: 'sent'
    });

    return result;

  } catch (error) {
    // 3. Mark optimistic message as failed
    updateOptimisticMessage(clientMsgId, {
      _status: 'failed',
      _error: error.message
    });
    throw error;
  }
};
```

### 3. Real-time Streaming API

**Endpoint**: `GET /v1/projects/:projectId/chat/stream`

```typescript
// SSE Stream Events
interface StreamEvent {
  id: number;           // Sequence number for Last-Event-ID
  event: 'message.created' | 'message.updated' | 'build.updated' | 
         'presence.updated' | 'typing' | 'connection.established';
  data: any;
  timestamp: string;
}

// Usage Example - Production-Ready SSE
class ChatStreamManager {
  private eventSource: EventSource | null = null;
  private projectId: string;
  private userId: string;
  private lastSeq: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor(projectId: string, userId: string) {
    this.projectId = projectId;
    this.userId = userId;
  }

  connect(fromSeq: number = 0): void {
    if (this.eventSource) {
      this.disconnect();
    }

    this.lastSeq = fromSeq;
    const url = `${API_BASE}/v1/projects/${this.projectId}/chat/stream?from_seq=${fromSeq}`;
    
    this.eventSource = new EventSource(url, {
      withCredentials: true
    });

    // Connection established
    this.eventSource.addEventListener('connection.established', (event) => {
      console.log('Chat stream connected:', event.data);
      this.reconnectAttempts = 0;
    });

    // New message received
    this.eventSource.addEventListener('message.created', (event) => {
      const data = JSON.parse(event.data);
      this.lastSeq = Math.max(this.lastSeq, data.seq || 0);
      
      // Add message to chat UI
      this.onMessageReceived(data);
    });

    // Presence updates
    this.eventSource.addEventListener('presence.updated', (event) => {
      const data = JSON.parse(event.data);
      this.onPresenceUpdate(data);
    });

    // Typing indicators
    this.eventSource.addEventListener('typing', (event) => {
      const data = JSON.parse(event.data);
      this.onTypingUpdate(data);
    });

    // Error handling with exponential backoff
    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        setTimeout(() => {
          console.log(`Reconnecting SSE (attempt ${this.reconnectAttempts})...`);
          this.connect(this.lastSeq);
        }, delay);
      }
    };

    // Handle browser tab visibility for connection management
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.eventSource?.readyState !== EventSource.OPEN) {
        this.connect(this.lastSeq);
      }
    });
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  // Callbacks - implement these in your component
  private onMessageReceived(message: ChatMessage): void {
    // Add to your chat messages state
  }

  private onPresenceUpdate(presence: any): void {
    // Update user presence indicators
  }

  private onTypingUpdate(typing: any): void {
    // Update typing indicators
  }
}
```

### 4. Presence Management APIs

```typescript
// Update presence (heartbeat)
const updatePresence = async (
  projectId: string,
  isTyping: boolean = false
): Promise<void> => {
  await fetch(`${API_BASE}/v1/projects/${projectId}/chat/presence`, {
    method: 'POST',
    headers: getHeaders(userId, userType),
    body: JSON.stringify({
      is_typing: isTyping,
      user_agent: navigator.userAgent,
      metadata: {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    }),
  });
};

// Get active users
interface ActiveUser {
  userId: string;
  userType: 'client' | 'assistant' | 'advisor';
  isTyping: boolean;
  lastSeen: number;
  isOnline: boolean;
}

const getActiveUsers = async (projectId: string): Promise<ActiveUser[]> => {
  const response = await fetch(
    `${API_BASE}/v1/projects/${projectId}/chat/presence`,
    { headers: getHeaders(userId, 'client', locale) }
  );
  
  const result = await response.json();
  return result.active_users;
};

// Presence Hook Example
const usePresence = (projectId: string) => {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  
  // Send heartbeat every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      updatePresence(projectId, isTyping);
    }, 15000);
    
    return () => clearInterval(interval);
  }, [projectId, isTyping]);

  // Typing indicator with debounce
  const setTypingDebounced = useMemo(
    () => debounce((typing: boolean) => {
      setIsTyping(typing);
      updatePresence(projectId, typing);
    }, 500),
    [projectId]
  );

  return {
    activeUsers,
    setTyping: setTypingDebounced
  };
};
```

### 5. Read Receipts APIs

```typescript
// Mark messages as read
const markAsRead = async (
  projectId: string, 
  upToSeq: number
): Promise<void> => {
  await fetch(`${API_BASE}/v1/projects/${projectId}/chat/read`, {
    method: 'PUT',
    headers: getHeaders(userId, 'client', locale),
    body: JSON.stringify({
      up_to_seq: upToSeq
    }),
  });
};

// Get unread count
interface UnreadCountResponse {
  unread_count: number;
  last_message_seq: number;
  last_read_seq: number;
}

const getUnreadCount = async (projectId: string): Promise<UnreadCountResponse> => {
  const response = await fetch(
    `${API_BASE}/v1/projects/${projectId}/chat/unread`,
    { headers: getHeaders(userId, 'client', locale) }
  );
  
  return response.json();
};
```

### 6. Search API

```typescript
// Search messages
interface SearchParams {
  q: string;              // Search query
  from_seq?: number;      // Search from sequence
  to_seq?: number;        // Search to sequence
  actor_types?: string[]; // Filter by user types
  mode?: string;          // Filter by mode
  limit?: number;         // Max results (default 20)
}

const searchMessages = async (
  projectId: string,
  params: SearchParams
): Promise<ChatMessage[]> => {
  const query = new URLSearchParams(params as any);
  
  const response = await fetch(
    `${API_BASE}/v1/projects/${projectId}/chat/search?${query}`,
    { headers: getHeaders(userId, 'client', locale) }
  );

  const result = await response.json();
  return result.results;
};
```

---

## 🎨 React Components Architecture

### 1. Main Chat Component

```tsx
// components/PersistentChat.tsx
interface PersistentChatProps {
  projectId: string;
  currentUserId: string;
  initialMode: 'plan' | 'build';
}

export function PersistentChat({ 
  projectId, 
  currentUserId, 
  initialMode 
}: PersistentChatProps) {
  const { 
    messages, 
    loadMore, 
    sendMessage, 
    activeUsers,
    unreadCount,
    isLoading
  } = usePersistentChat(projectId);

  return (
    <div className="chat-container">
      <ChatHeader 
        activeUsers={activeUsers} 
        unreadCount={unreadCount}
      />
      
      <MessageList 
        messages={messages} 
        onLoadMore={loadMore}
        currentUserId={currentUserId}
        isLoading={isLoading}
      />
      
      <ChatInput 
        onSend={sendMessage}
        mode={initialMode}
      />
    </div>
  );
}
```

### 2. Custom Hooks

```tsx
// hooks/usePersistentChat.ts
export function usePersistentChat(projectId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const streamManager = useRef<ChatStreamManager>();

  // Initialize stream connection
  useEffect(() => {
    streamManager.current = new ChatStreamManager(projectId, userId);
    streamManager.current.connect();
    
    return () => streamManager.current?.disconnect();
  }, [projectId]);

  // Load more messages (infinite scroll)
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    
    setIsLoading(true);
    const oldestMessage = messages[messages.length - 1];
    
    try {
      const response = await fetchChatHistory(projectId, {
        before_seq: oldestMessage?.seq,
        limit: 20
      });
      
      setMessages(prev => [...prev, ...response.messages]);
      setHasMore(response.pagination.has_more_older);
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, messages, isLoading, hasMore]);

  // Send message with optimistic updates
  const sendMessage = useCallback(async (
    text: string, 
    mode: string = 'unified'
  ) => {
    try {
      await sendMessage(projectId, text, mode);
    } catch (error) {
      // Error handling is done in sendMessage function
      console.error('Failed to send message:', error);
    }
  }, [projectId]);

  return {
    messages,
    loadMore,
    sendMessage,
    hasMore,
    isLoading
  };
}
```

### 3. Infinite Scroll Component

```tsx
// components/MessageList.tsx
interface MessageListProps {
  messages: ChatMessage[];
  onLoadMore: () => void;
  currentUserId: string;
  isLoading: boolean;
}

export function MessageList({ 
  messages, 
  onLoadMore, 
  currentUserId,
  isLoading 
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Infinite scroll with Intersection Observer
  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    onChange: (inView) => {
      if (inView && !isLoading) {
        onLoadMore();
      }
    },
  });

  // Auto-scroll to bottom for new messages
  useEffect(() => {
    if (isAtBottom && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isAtBottom]);

  // Track if user is at bottom
  const handleScroll = useCallback((e: React.UIEvent) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const atBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsAtBottom(atBottom);
  }, []);

  return (
    <div 
      ref={listRef}
      className="message-list"
      onScroll={handleScroll}
    >
      {/* Load more trigger at top */}
      <div ref={loadMoreRef} className="load-more-trigger">
        {isLoading && <LoadingSpinner />}
      </div>

      {/* Messages */}
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isOwn={message.user.id === currentUserId}
        />
      ))}
      
      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <button
          className="scroll-to-bottom"
          onClick={() => {
            listRef.current?.scrollTo({ 
              top: listRef.current.scrollHeight,
              behavior: 'smooth' 
            });
          }}
        >
          ↓ New messages
        </button>
      )}
    </div>
  );
}
```

### 4. Message Components

```tsx
// components/MessageBubble.tsx
interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <div className={`message ${isOwn ? 'own' : ''} ${message.user.type}`}>
      {/* User info */}
      {!isOwn && (
        <div className="message-user">
          <Avatar userId={message.user.id} type={message.user.type} />
          <span className="user-name">{message.user.name}</span>
          {message.user.type === 'advisor' && (
            <span className="advisor-badge">Advisor</span>
          )}
        </div>
      )}

      {/* Message content */}
      <div className="message-content">
        <div className="message-text">
          {message.message.text}
        </div>

        {/* Build status */}
        {message.build && (
          <BuildStatusBadge 
            buildId={message.build.id}
            status={message.build.status}
          />
        )}

        {/* Message meta */}
        <div className="message-meta">
          <time dateTime={message.message.timestamp}>
            {formatTimeAgo(message.message.timestamp)}
          </time>
          {message.editedAt && <span className="edited">edited</span>}
          <span className={`mode-badge mode-${message.message.mode}`}>
            {message.message.mode}
          </span>
        </div>
      </div>

      {/* Thread replies */}
      {message.thread?.parentId && (
        <ThreadIndicator parentId={message.thread.parentId} />
      )}
    </div>
  );
}
```

### 5. Chat Input with Typing Indicators

```tsx
// components/ChatInput.tsx
interface ChatInputProps {
  onSend: (text: string, mode: string) => void;
  mode: 'plan' | 'build' | 'unified';
  disabled?: boolean;
}

export function ChatInput({ onSend, mode, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { setTyping } = usePresence(projectId);

  // Handle typing indicators
  const handleTyping = useMemo(
    () => debounce((typing: boolean) => {
      setIsTyping(typing);
      setTyping(typing);
    }, 300),
    [setTyping]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;

    onSend(text, mode);
    setText('');
    setIsTyping(false);
    setTyping(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    
    // Update typing indicator
    const isNowTyping = e.target.value.length > 0;
    if (isNowTyping !== isTyping) {
      handleTyping(isNowTyping);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="chat-input">
      <textarea
        value={text}
        onChange={handleChange}
        onBlur={() => handleTyping(false)}
        placeholder={`Type a message in ${mode} mode...`}
        disabled={disabled}
        maxLength={10000}
      />
      
      <div className="input-actions">
        <ModeSelector currentMode={mode} />
        
        <button 
          type="submit" 
          disabled={!text.trim() || disabled}
          className="send-button"
        >
          Send
        </button>
      </div>

      {/* Character count */}
      <div className="char-count">
        {text.length}/10000
      </div>
    </form>
  );
}
```

---

## 🎯 CSS Styling Guide

### Message Type Distinctions

```css
/* Base message styles */
.message {
  margin: 8px 0;
  padding: 12px;
  border-radius: 8px;
  max-width: 80%;
}

/* User type styling */
.message.client {
  background: var(--user-bg, #e3f2fd);
  align-self: flex-end;
  margin-left: auto;
}

.message.assistant {
  background: var(--assistant-bg, #f5f5f5);
  align-self: flex-start;
}

.message.advisor {
  background: var(--advisor-bg, #fff3e0);
  border-left: 4px solid var(--advisor-accent, #ff9800);
}

/* Mode indicators */
.message.mode-build {
  border-left: 4px solid var(--build-color, #4caf50);
}

.message.mode-plan {
  border-left: 4px solid var(--plan-color, #2196f3);
}

.message.mode-unified {
  border-left: 4px solid var(--unified-color, #9c27b0);
}

/* Status indicators */
.message[data-status="sending"] {
  opacity: 0.6;
}

.message[data-status="failed"] {
  background: var(--error-bg, #ffebee);
  border-color: var(--error-color, #f44336);
}

/* Typing indicators */
.typing-indicator {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  color: var(--text-secondary, #666);
  font-style: italic;
}

.typing-dots {
  display: inline-flex;
  margin-left: 8px;
}

.typing-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--primary-color, #2196f3);
  margin: 0 1px;
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-dot:nth-child(1) { animation-delay: -0.32s; }
.typing-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% {
    transform: scale(0);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Presence indicators */
.user-status {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 4px;
}

.user-status.online { background: #4caf50; }
.user-status.offline { background: #9e9e9e; }
.user-status.typing { 
  background: #ff9800; 
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}
```

---

## ⚠️ Important Implementation Notes

### 1. Idempotency Requirements

```typescript
// ALWAYS generate client_msg_id for messages
const clientMsgId = crypto.randomUUID(); // Use this, not Math.random()

// Handle duplicate responses gracefully
if (response.duplicateOf) {
  // This was a retry - update UI with existing message
  console.log('Message was already sent, updating with server data');
}
```

### 2. Sequence-Based Pagination

```typescript
// Use seq numbers, NOT message IDs for pagination
const loadOlder = (oldestSeq: number) => {
  return fetchChatHistory(projectId, { before_seq: oldestSeq });
};

// For gap detection in SSE
if (newMessage.seq > lastSeq + 1) {
  console.warn(`Gap detected: expected ${lastSeq + 1}, got ${newMessage.seq}`);
  // Fetch missed messages
}
```

### 3. Error Handling Patterns

```typescript
// Optimistic updates with rollback
try {
  addOptimisticMessage(message);
  const result = await sendMessage(message);
  updateOptimisticMessage(message.client_msg_id, result);
} catch (error) {
  markOptimisticMessageFailed(message.client_msg_id, error);
  
  // Provide retry option
  showRetryButton(message.client_msg_id);
}

// Network resilience
const retryWithExponentialBackoff = async (fn: () => Promise<any>, maxAttempts = 3) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
      
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};
```

### 4. Performance Optimizations

```typescript
// Message list virtualization for large chat histories
import { FixedSizeList as List } from 'react-window';

const MessageVirtualList = ({ messages }: { messages: ChatMessage[] }) => (
  <List
    height={600}
    itemCount={messages.length}
    itemSize={80}
    itemData={messages}
  >
    {({ index, data }) => <MessageBubble message={data[index]} />}
  </List>
);

// Debounce search input
const useSearchDebounced = (query: string, delay: number = 300) => {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), delay);
    return () => clearTimeout(timer);
  }, [query, delay]);

  return debouncedQuery;
};
```

### 5. Accessibility Considerations

```tsx
// Screen reader support
<div 
  role="log" 
  aria-live="polite" 
  aria-label="Chat messages"
  className="message-list"
>
  {messages.map(message => (
    <div
      key={message.id}
      role="article"
      aria-label={`Message from ${message.user.name} at ${message.message.timestamp}`}
    >
      {message.message.text}
    </div>
  ))}
</div>

// Keyboard navigation
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    handleSubmit();
  }
};
```

---

## 🚀 Production Deployment Checklist

### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://api.sheenapps.com
HMAC_SECRET=your-hmac-secret
REDIS_URL=redis://your-redis-instance

# Optional: Feature flags
NEXT_PUBLIC_ENABLE_SEARCH=true
NEXT_PUBLIC_ENABLE_PRESENCE=true  
NEXT_PUBLIC_ENABLE_TYPING_INDICATORS=true
```

### Bundle Optimization

```javascript
// next.config.js
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['ioredis']
  },
  webpack: (config) => {
    // Optimize SSE polyfill
    config.resolve.alias = {
      ...config.resolve.alias,
      'eventsource': 'eventsource/lib/eventsource-polyfill'
    };
    return config;
  }
};
```

### Monitoring Integration

```typescript
// Add performance monitoring
const trackChatMetrics = {
  messagesSent: (count: number) => analytics.track('chat.messages.sent', { count }),
  loadTime: (duration: number) => analytics.track('chat.load_time', { duration }),
  searchUsage: (query: string) => analytics.track('chat.search.used', { query_length: query.length }),
  presenceUpdates: (activeUsers: number) => analytics.track('chat.presence.active_users', { activeUsers })
};
```

---

## 🌍 Internationalization (I18n) Support

### Overview

The persistent chat system includes comprehensive i18n support with locale-aware APIs, system message localization, and session locale persistence. All features are **100% backwards compatible** and opt-in.

### Key I18n Features

- **Session Locale Persistence**: User locale preferences stored automatically
- **System Message Localization**: Machine-readable codes + parameters for dynamic translation
- **Optional Locale Headers**: All APIs accept `X-Locale` headers
- **Body-level Locale Override**: sendMessage supports locale in request body
- **Presence System I18n**: Typing indicators and user join/leave events are localizable

### Locale Support

```typescript
// BCP-47 format support
type SupportedLocale = 
  | 'en-US'    // English (US)
  | 'en-GB'    // English (UK)  
  | 'ar-EG'    // Arabic (Egypt)
  | 'ar-SA'    // Arabic (Saudi Arabia)
  | 'fr-FR'    // French (France)
  | 'fr-MA'    // French (Morocco)
  | 'es'       // Spanish
  | 'de'       // German
  | string;    // Any BCP-47 locale
```

### API Integration with I18n

All APIs now accept an optional `X-Locale` header:

```typescript
// Updated header function with locale support
const getHeaders = (
  userId: string, 
  userType: 'client' | 'assistant' | 'advisor' = 'client',
  locale?: string
) => ({
  'Content-Type': 'application/json',
  'X-User-Id': userId,
  'X-User-Type': userType,
  'X-HMAC-Signature': generateHmacSignature(payload),
  ...(locale && { 'X-Locale': locale }), // Optional locale header
});

// Example usage with locale
const userLocale = getUserLocale(); // 'ar-EG', 'fr-FR', etc.
const response = await fetch('/v1/projects/123/chat/messages', {
  headers: getHeaders('user-123', 'client', userLocale)
});
```

### Send Message with Locale

```typescript
interface SendMessageRequest {
  text: string;
  client_msg_id: string;
  mode: 'plan' | 'build' | 'unified';
  actor_type?: 'client' | 'assistant' | 'advisor';
  locale?: string; // BCP-47 locale - takes precedence over X-Locale header
  thread?: {
    parentId?: string;
  };
}

const sendMessage = async (
  projectId: string,
  userId: string,
  message: SendMessageRequest,
  locale?: string
) => {
  const response = await fetch(`${API_BASE}/v1/projects/${projectId}/chat/messages`, {
    method: 'POST',
    headers: getHeaders(userId, 'client', locale),
    body: JSON.stringify({
      ...message,
      locale: message.locale || locale, // Body locale overrides header
    }),
  });
  
  return response.json();
};
```

### System Message Localization

System messages (user joined, typing indicators, etc.) include localization data:

```typescript
interface SystemMessage extends ChatMessage {
  message: {
    type: 'system';
    // ... other fields
  };
  // I18n system message data
  response_data?: {
    systemMessage?: {
      code: string;           // Machine-readable code
      params: Record<string, any>; // Parameters for localization
      timestamp: string;
    };
  };
}

// Example system message codes
const SYSTEM_MESSAGE_CODES = {
  'presence.user_joined': 'User {{userName}} joined the chat',
  'presence.user_left': 'User {{userName}} left the chat', 
  'presence.typing_start': '{{userName}} is typing...',
  'presence.typing_stop': '{{userName}} stopped typing',
  'build.status_changed': 'Build status changed to {{status}}',
  'advisor.invited': 'Advisor {{advisorName}} was invited to this project',
} as const;
```

### Frontend Localization Integration

```typescript
// Localization hook for system messages
const useSystemMessageLocalization = (locale: string) => {
  const localizeSystemMessage = useCallback((message: ChatMessage): string => {
    const systemData = message.response_data?.systemMessage;
    if (!systemData) return message.message.text;
    
    // Get translation template using your i18n library
    const template = t(systemData.code, { lng: locale });
    
    // Replace parameters in template
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return systemData.params[key] || match;
    });
  }, [locale]);
  
  return { localizeSystemMessage };
};

// Usage in chat component
const ChatMessage = ({ message }: { message: ChatMessage }) => {
  const locale = getUserLocale();
  const { localizeSystemMessage } = useSystemMessageLocalization(locale);
  
  const displayText = message.message.type === 'system'
    ? localizeSystemMessage(message)
    : message.message.text;
    
  return (
    <div className={`message message-${message.message.type}`}>
      {displayText}
    </div>
  );
};
```

### Session Locale Management

The backend automatically stores user locale preferences:

```typescript
// Session API with locale support
const getOrCreateSession = async (
  projectId: string, 
  userId: string,
  locale?: string
) => {
  const response = await fetch(`${API_BASE}/v1/projects/${projectId}/chat/session`, {
    headers: getHeaders(userId, 'client', locale),
  });
  
  return response.json(); // Returns { sessionId, isActive, lastActive, preferredLocale }
};
```

### RTL Language Support

For RTL languages (Arabic, Hebrew), add CSS support:

```css
/* RTL support for Arabic, Hebrew */
.chat-container[dir="rtl"] {
  direction: rtl;
}

.chat-container[dir="rtl"] .message.user-client {
  align-self: flex-start; /* Reverse alignment for RTL */
}

.chat-container[dir="rtl"] .message.user-assistant {
  align-self: flex-end;
}

.chat-container[dir="rtl"] .typing-indicator {
  text-align: right;
}
```

### Complete I18n Integration Example

```typescript
const usePersistentChatI18n = (projectId: string, userId: string) => {
  const locale = getUserLocale(); // Get from Next.js router or user preferences
  const { localizeSystemMessage } = useSystemMessageLocalization(locale);
  
  const sendMessage = useCallback(async (text: string, mode: string) => {
    const clientMsgId = crypto.randomUUID();
    
    const response = await fetch(`${API_BASE}/v1/projects/${projectId}/chat/messages`, {
      method: 'POST',
      headers: getHeaders(userId, 'client', locale),
      body: JSON.stringify({
        text,
        client_msg_id: clientMsgId,
        mode,
        locale, // Include locale in body for session persistence
      }),
    });
    
    return response.json();
  }, [projectId, userId, locale]);
  
  const fetchHistory = useCallback(async (params: ChatHistoryParams = {}) => {
    return fetchChatHistory(projectId, userId, params, locale);
  }, [projectId, userId, locale]);
  
  return {
    sendMessage,
    fetchHistory,
    localizeSystemMessage,
    locale,
  };
};
```

### Translation File Structure

Suggested translation structure for frontend:

```json
{
  "en-US": {
    "presence.user_joined": "{{userName}} joined the chat",
    "presence.user_left": "{{userName}} left the chat",
    "presence.typing_start": "{{userName}} is typing...",
    "presence.typing_stop": "{{userName}} stopped typing",
    "build.status_changed": "Build status: {{status}}"
  },
  "ar-EG": {
    "presence.user_joined": "انضم {{userName}} إلى المحادثة",
    "presence.user_left": "غادر {{userName}} المحادثة", 
    "presence.typing_start": "{{userName}} يكتب...",
    "presence.typing_stop": "توقف {{userName}} عن الكتابة",
    "build.status_changed": "حالة البناء: {{status}}"
  },
  "fr-FR": {
    "presence.user_joined": "{{userName}} a rejoint la conversation",
    "presence.user_left": "{{userName}} a quitté la conversation",
    "presence.typing_start": "{{userName}} écrit...",
    "presence.typing_stop": "{{userName}} a arrêté d'écrire",
    "build.status_changed": "Statut de construction: {{status}}"
  }
}
```

---

## 📞 Support & Questions

For implementation questions or issues:

1. **API Errors**: Check HMAC signature generation and request headers
2. **Real-time Issues**: Verify SSE connection and Last-Event-ID handling
3. **Performance**: Consider message virtualization for large chat histories
4. **Search Problems**: Ensure queries are properly URL-encoded
5. **I18n Issues**: Verify locale headers are in BCP-47 format and system message codes are properly mapped

The backend team has implemented comprehensive error logging and monitoring. All API endpoints return detailed error messages for debugging.

---

This integration guide provides everything needed for a production-ready persistent chat implementation with real-time capabilities, search functionality, and future advisor network support. The backend MVP is complete and ready for frontend integration!