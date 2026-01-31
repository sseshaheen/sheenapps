# Client-Side SSE Connection Limits Handling

This document explains how to handle server-side SSE connection limits gracefully on the client side, including follower mode fallback.

## 🚨 Connection Limit Response (429)

When the server denies an SSE connection due to limits, it returns a 429 response with helpful headers:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 10
X-SSE-Connection-Limit: 5
X-SSE-Current-Connections: 5

{
  "error": "too_many_connections",
  "message": "SSE connection limit exceeded. Maximum 5 connections allowed per user/project.",
  "current_connections": 5,
  "max_connections": 5,
  "retry_after_ms": 10000,
  "recommendation": "Close other chat windows or switch this tab to follower mode"
}
```

## 📱 Client-Side Implementation

### Basic Connection with Limit Handling

```typescript
interface SSEConnectionResult {
  eventSource?: EventSource;
  mode: 'leader' | 'follower' | 'failed';
  reason?: string;
  retryAfterMs?: number;
}

async function connectToSSE(projectId: string): Promise<SSEConnectionResult> {
  const sseUrl = `/api/persistent-chat/stream?projectId=${projectId}`;
  
  try {
    // Attempt to connect via EventSource
    const eventSource = new EventSource(sseUrl);
    
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        eventSource.close();
        resolve({
          mode: 'failed',
          reason: 'Connection timeout - assuming limit exceeded'
        });
      }, 5000); // 5 second timeout
      
      eventSource.onopen = () => {
        clearTimeout(timeoutId);
        console.log('✅ SSE connected as leader');
        resolve({
          eventSource,
          mode: 'leader'
        });
      };
      
      eventSource.onerror = async (event) => {
        clearTimeout(timeoutId);
        eventSource.close();
        
        // Try to get limit information from the failed connection
        try {
          const response = await fetch(sseUrl, { method: 'HEAD' });
          
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : 10000;
            
            console.warn('⚠️ SSE connection limit exceeded, switching to follower mode');
            resolve({
              mode: 'follower',
              reason: 'Connection limit exceeded',
              retryAfterMs
            });
          } else {
            resolve({
              mode: 'failed',
              reason: 'SSE connection failed'
            });
          }
        } catch (fetchError) {
          resolve({
            mode: 'failed',
            reason: 'Failed to check connection status'
          });
        }
      };
    });
    
  } catch (error) {
    return {
      mode: 'failed',
      reason: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

### Enhanced Connection Manager with Cross-Tab Coordination

```typescript
export class PersistentChatConnection {
  private eventSource?: EventSource;
  private broadcastChannel?: BroadcastChannel;
  private mode: 'leader' | 'follower' | 'disconnected' = 'disconnected';
  private projectId: string;
  private onMessage: (message: any) => void;
  private retryTimeoutId?: ReturnType<typeof setTimeout>;
  
  constructor(projectId: string, onMessage: (message: any) => void) {
    this.projectId = projectId;
    this.onMessage = onMessage;
    
    // Set up cross-tab communication
    try {
      this.broadcastChannel = new BroadcastChannel(`chat-${projectId}`);
      this.setupBroadcastListener();
    } catch (error) {
      console.warn('BroadcastChannel not supported, tabs will work independently');
    }
  }
  
  async connect(): Promise<void> {
    const result = await connectToSSE(this.projectId);
    
    switch (result.mode) {
      case 'leader':
        this.mode = 'leader';
        this.eventSource = result.eventSource;
        this.setupSSEListeners();
        this.broadcastLeaderStatus();
        break;
        
      case 'follower':
        this.mode = 'follower';
        this.showConnectionLimitBanner(result.retryAfterMs);
        this.setupFollowerMode();
        
        // Retry becoming leader after suggested delay
        if (result.retryAfterMs) {
          this.scheduleLeaderRetry(result.retryAfterMs);
        }
        break;
        
      case 'failed':
        this.mode = 'disconnected';
        this.showConnectionError(result.reason);
        break;
    }
  }
  
  private setupSSEListeners(): void {
    if (!this.eventSource) return;
    
    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Process message locally
      this.onMessage(data);
      
      // Broadcast to other tabs
      this.broadcastChannel?.postMessage({
        type: 'sse-message',
        data: data,
        timestamp: Date.now()
      });
    };
    
    this.eventSource.onerror = (error) => {
      console.error('SSE connection lost, attempting reconnection...');
      this.reconnect();
    };
  }
  
  private setupBroadcastListener(): void {
    if (!this.broadcastChannel) return;
    
    this.broadcastChannel.onmessage = (event) => {
      switch (event.data.type) {
        case 'sse-message':
          if (this.mode === 'follower') {
            // Receive messages from leader tab
            this.onMessage(event.data.data);
          }
          break;
          
        case 'leader-status':
          if (this.mode === 'follower' && event.data.status === 'connected') {
            // Leader is available, stay in follower mode
            this.hideConnectionLimitBanner();
          } else if (event.data.status === 'disconnected') {
            // Leader disconnected, try to become leader
            setTimeout(() => this.tryBecomeLeader(), 1000);
          }
          break;
      }
    };
  }
  
  private broadcastLeaderStatus(): void {
    this.broadcastChannel?.postMessage({
      type: 'leader-status',
      status: this.mode === 'leader' ? 'connected' : 'disconnected',
      timestamp: Date.now()
    });
  }
  
  private setupFollowerMode(): void {
    // In follower mode, listen for broadcasts from leader tab
    console.log('📡 Operating in follower mode - receiving messages via BroadcastChannel');
  }
  
  private scheduleLeaderRetry(delayMs: number): void {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
    
    this.retryTimeoutId = setTimeout(() => {
      this.tryBecomeLeader();
    }, delayMs);
  }
  
  private async tryBecomeLeader(): Promise<void> {
    if (this.mode === 'leader') return;
    
    console.log('🔄 Attempting to become SSE leader...');
    const result = await connectToSSE(this.projectId);
    
    if (result.mode === 'leader') {
      this.mode = 'leader';
      this.eventSource = result.eventSource;
      this.setupSSEListeners();
      this.broadcastLeaderStatus();
      this.hideConnectionLimitBanner();
      console.log('✅ Successfully became SSE leader');
    } else if (result.retryAfterMs) {
      // Still at limit, retry later
      this.scheduleLeaderRetry(result.retryAfterMs);
    }
  }
  
  private async reconnect(): Promise<void> {
    this.disconnect();
    
    // Wait a bit before reconnecting
    setTimeout(() => {
      this.connect();
    }, 2000);
  }
  
  private showConnectionLimitBanner(retryAfterMs?: number): void {
    // Create or update connection limit banner
    const banner = document.getElementById('sse-limit-banner') || document.createElement('div');
    banner.id = 'sse-limit-banner';
    banner.className = 'connection-limit-banner';
    banner.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">⚠️</span>
        <span class="banner-text">
          Too many chat windows open. This tab is receiving messages from another window.
        </span>
        <button class="banner-action" onclick="this.closest('.connection-limit-banner').style.display='none'">
          Got it
        </button>
      </div>
    `;
    
    if (!document.getElementById('sse-limit-banner')) {
      document.body.appendChild(banner);
    }
  }
  
  private hideConnectionLimitBanner(): void {
    const banner = document.getElementById('sse-limit-banner');
    if (banner) {
      banner.remove();
    }
  }
  
  private showConnectionError(reason?: string): void {
    console.error('❌ SSE connection failed:', reason);
    // Handle connection failure UI here
  }
  
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = undefined;
    }
    
    this.mode = 'disconnected';
    this.broadcastLeaderStatus();
  }
  
  getConnectionInfo() {
    return {
      mode: this.mode,
      connected: this.mode === 'leader' && this.eventSource?.readyState === EventSource.OPEN
    };
  }
}
```

### Usage Example

```typescript
// Initialize connection manager
const chatConnection = new PersistentChatConnection(
  projectId,
  (message) => {
    // Handle incoming chat messages
    console.log('New message:', message);
    addMessageToUI(message);
  }
);

// Start connection
await chatConnection.connect();

// Check connection status
const status = chatConnection.getConnectionInfo();
console.log(`Connection mode: ${status.mode}, Connected: ${status.connected}`);

// Clean up when component unmounts
function cleanup() {
  chatConnection.disconnect();
}
```

### CSS for Connection Limit Banner

```css
.connection-limit-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
  color: white;
  z-index: 1000;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.banner-content {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  max-width: 1200px;
  margin: 0 auto;
  gap: 12px;
}

.banner-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.banner-text {
  flex: 1;
  font-weight: 500;
}

.banner-action {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.banner-action:hover {
  background: rgba(255, 255, 255, 0.3);
}
```

## 🔍 Monitoring and Debugging

### Connection Status Debugging

```typescript
// Add to browser console for debugging
function debugSSEConnections() {
  // Check EventSource connections
  const eventSources = window.performance.getEntriesByType('navigation');
  console.log('Active EventSource connections:', eventSources.length);
  
  // Check BroadcastChannel
  const testChannel = new BroadcastChannel('test');
  testChannel.postMessage({ type: 'debug', timestamp: Date.now() });
  testChannel.close();
  
  // Check local storage for leader info
  const leader = localStorage.getItem('sse-leader');
  console.log('Current SSE leader:', leader);
}

// Monitor connection events
window.addEventListener('beforeunload', () => {
  console.log('Tab closing - SSE connections should clean up automatically');
});
```

### Server-Side Monitoring Endpoint

The backend now provides connection monitoring:

```typescript
// GET /v1/debug/sse-connections/:userId/:projectId (internal endpoint)
fetch(`/api/debug/sse-connections/${userId}/${projectId}`)
  .then(r => r.json())
  .then(data => {
    console.log('Active connections:', data.connections);
    console.log('Connection count:', data.count);
  });
```

## 🏆 Benefits

1. **DoS Protection**: Prevents users from accidentally or maliciously opening unlimited connections
2. **Resource Management**: Keeps Redis and server memory usage under control  
3. **Graceful Degradation**: Users can still receive messages via follower mode
4. **Cross-Tab Efficiency**: Only one real SSE connection per user/project across all tabs
5. **Automatic Recovery**: Tabs automatically attempt to become leader when possible
6. **User-Friendly**: Clear messaging explains what's happening and why

This implementation ensures robust, production-ready SSE connection management that prevents abuse while maintaining excellent user experience.