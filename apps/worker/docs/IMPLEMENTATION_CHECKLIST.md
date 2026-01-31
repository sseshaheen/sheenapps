# Implementation Checklist for Claude CLI Stream Migration

## Critical Items Before Starting

### 1. Authentication Strategy ✅
**Decision**: Use local Claude CLI auth
- [x] Continue using local auth (~/.claude/)
- [ ] Ensure Claude CLI is pre-authenticated on deployment servers
- [ ] Document authentication setup in deployment guide

### 2. Process Architecture Decision ✅
**Decision**: Direct process spawning
- [x] Direct spawning from workers (simpler)
- [x] Use PathGuard to ensure spawning only in project directories
- [ ] Implement simple semaphore-based rate limiting
- [ ] Add process timeout (5 minutes default)

### 3. Streaming Implementation Details 📊
**Need to handle**:
- [ ] Chunked JSON parsing (messages may span multiple lines)
- [ ] Process stdout buffering (use readline or similar)
- [ ] Timeout handling for long-running sessions
- [ ] Memory management for large outputs

### 4. Error Handling Scenarios 🚨
**Must handle**:
- [ ] Claude CLI not found
- [ ] Authentication failures
- [ ] Network timeouts
- [ ] Malformed JSON in stream
- [ ] Process crashes mid-stream
- [ ] Rate limit errors

### 5. Working Directory Management 📁
**Current**: Uses PathGuard to validate directories
- [ ] Keep PathGuard validation
- [ ] Ensure proper cleanup of temp directories
- [ ] Handle concurrent builds in same project

### 6. Cost Tracking Integration 💰
**Current**: Not implemented for CLI
- [ ] Parse token usage from stream messages
- [ ] Store costs per session
- [ ] Implement cost limits per build

### 7. Testing Strategy 🧪
**Need**:
- [ ] Mock stream generator for unit tests
- [ ] Integration tests with actual Claude CLI
- [ ] Load testing for concurrent sessions
- [ ] Error injection tests

## Implementation Order

### Phase 1: Core Stream Handler
```typescript
// 1. Create streaming process wrapper
class ClaudeStreamProcess {
  spawn(prompt: string, workDir: string): ReadableStream
  parseMessage(line: string): ClaudeStreamMessage
  handleError(error: Error): void
}

// 2. Session manager
class ClaudeSession {
  process: ClaudeStreamProcess
  messages: ClaudeStreamMessage[]
  async run(prompt: string): Promise<SessionResult>
}
```

### Phase 2: Integration Points
- [ ] Replace current provider calls in deployWorker
- [ ] Update webhook emissions based on stream events
- [ ] Connect to existing error recovery system

### Phase 3: Cleanup
- [ ] Remove old files as documented
- [ ] Update environment variables
- [ ] Update deployment scripts

## Environment Variables to Add/Update

```bash
# New/Updated
CLAUDE_CLI_PATH=/usr/local/bin/claude  # Explicit path
CLAUDE_AUTH_METHOD=api_key|local       # Choose auth method
ANTHROPIC_API_KEY=sk-...               # If using API key
CLAUDE_SESSION_TIMEOUT=300000          # 5 min default
CLAUDE_MAX_TOKENS=100000               # Cost control

# Keep existing
CLAUDE_MAX_CONCURRENT=5
MAIN_APP_WEBHOOK_URL=...
```

## Security Considerations

1. **Input Sanitization**: Ensure prompts are properly escaped
2. **Output Validation**: Verify generated code doesn't contain secrets
3. **Path Restrictions**: Keep PathGuard to prevent file system access
4. **Resource Limits**: Implement CPU/memory limits on processes

## Monitoring & Observability

- [ ] Log session starts/ends with IDs
- [ ] Track message types and counts
- [ ] Monitor process resource usage
- [ ] Alert on authentication failures
- [ ] Dashboard for cost tracking

## Decisions Made

1. **Authentication**: Local Claude CLI auth
2. **Architecture**: Direct process spawning 
3. **Session duration**: 5 minutes (configurable)
4. **Partial failures**: Log state, attempt cleanup, report error
5. **Session resume**: Skip for MVP, add later if needed

## Minimal MVP Approach

### Core Features Only
- [x] Spawn Claude CLI with stream-json output
- [x] Parse JSON messages line by line
- [x] Extract user-friendly updates from tool usage
- [x] Send webhooks for progress
- [x] Handle basic errors (timeout, crash, auth failure)

### Defer for Later
- [ ] Session resume capability
- [ ] Complex error recovery
- [ ] Cost tracking (parse from stream later)
- [ ] Redis-based rate limiting
- [ ] Advanced monitoring