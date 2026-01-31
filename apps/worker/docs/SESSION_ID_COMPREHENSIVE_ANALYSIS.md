# Comprehensive Session ID Analysis & Synchronization Plan

## Critical Findings

You're absolutely right - the session ID management is more complex than initially thought. Claude CLI generates new session IDs with each resumption, creating a rolling chain of sessions that must be properly tracked across multiple storage locations.

## Session ID Flow & Storage Locations

### 1. **project_versions Table**
- **Column**: `ai_session_id`
- **Purpose**: Stores the LATEST session ID for a version
- **Updated**: After each Claude operation (build, metadata, compact)
- **Comment**: "Most recent Claude session ID for this version (changes with every Claude operation)"

### 2. **projects Table** (NEW - our addition)
- **Column**: `last_ai_session_id`
- **Purpose**: Store the ABSOLUTE LATEST session for the project
- **Updated**: Should be updated after EVERY Claude operation
- **Use**: Chat Plan Mode reads this for context continuity

### 3. **project_ai_session_metrics Table**
- **Column**: `session_id`
- **Purpose**: Track metrics for each Claude session
- **Updated**: After each Claude operation
- **Stores**: Token usage, costs, performance metrics

### 4. **project_chat_log_minimal Table**
- **Column**: `session_id`, `ai_session_id`
- **Purpose**: Link chat messages to Claude sessions
- **Updated**: When chat messages are logged

### 5. **chat_plan_sessions Table**
- **Column**: `session_id`
- **Purpose**: Track chat plan sessions
- **Updated**: During chat plan operations

### 6. **Redis (Session Recovery)**
- **Key**: `claude:session:{buildId}`
- **Purpose**: Temporary session checkpoint for recovery
- **TTL**: 1 hour
- **Stores**: sessionId, buildId, projectPath, filesCreated

### 7. **In-Memory (claudeSessions Map)**
- **Location**: `src/services/errorHandlers.ts`
- **Purpose**: Store session for error recovery
- **Scope**: Worker process lifetime

## The Session Rolling Problem

```
Initial Build:
  ClaudeSession.run() → sessionId: "abc123"
  ↓
Metadata Generation:
  ClaudeSession.resume("abc123") → NEW sessionId: "def456"
  ↓
Context Compaction:
  ClaudeSession.compact("def456") → NEW sessionId: "ghi789"
  ↓
Next Update:
  Should resume from "ghi789", not "abc123"!
```

## Current Issues

1. **Unsynchronized Updates**: 
   - `project_versions.ai_session_id` is updated
   - But `projects.last_ai_session_id` is NOT always updated
   - Metadata generation updates versions but not projects table

2. **Session Chain Breaking**:
   - Each operation generates a new session ID
   - If we don't track the latest, context is lost
   - Chat Plan Mode might use stale session

3. **Multiple Truth Sources**:
   - project_versions has one session
   - projects table has another
   - Redis has temporary checkpoints
   - No clear authoritative source

## Comprehensive Synchronization Plan

### Phase 1: Establish Single Source of Truth

**Principle**: The `projects.last_ai_session_id` should ALWAYS have the absolute latest session ID.

### Phase 2: Update All Session Generation Points

#### 2.1 Stream Worker - Main Build
```typescript
// After successful Claude session (line 545)
if (result.sessionId) {
  // Update BOTH tables
  await SessionManagementService.updateProjectSession(projectId, result.sessionId, 'build');
  await updateProjectVersionStatus(versionId, 'deployed', {
    aiSessionId: result.sessionId,
    aiSessionLastUsedAt: new Date()
  });
}
```

#### 2.2 Metadata Generation Handler
```typescript
// After recommendations generation (line 1502)
if (recResult.sessionId) {
  latestSessionId = recResult.sessionId;
  // Update projects table IMMEDIATELY
  await SessionManagementService.updateProjectSession(projectId, recResult.sessionId, 'metadata_generation');
}

// After documentation generation
if (docResult?.sessionId) {
  latestSessionId = docResult.sessionId;
  await SessionManagementService.updateProjectSession(projectId, docResult.sessionId, 'metadata_generation');
}
```

#### 2.3 Context Compaction
```typescript
// After successful compaction (line 1523)
if (newSessionId) {
  const finalSessionId = newSessionId;
  // Update BOTH tables with compacted session
  await SessionManagementService.updateProjectSession(projectId, finalSessionId, 'metadata_generation');
  await updateProjectVersionStatus(versionId, 'deployed', {
    aiSessionId: finalSessionId,
    aiSessionLastUsedAt: new Date()
  });
}
```

### Phase 3: Enhanced SessionManagementService

```typescript
export class SessionManagementService {
  /**
   * Update project session and optionally version session
   */
  static async updateProjectSession(
    projectId: string, 
    sessionId: string,
    source: string,
    versionId?: string
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update projects table (always)
      await client.query(
        `UPDATE projects 
         SET last_ai_session_id = $1, 
             last_ai_session_updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $2`,
        [sessionId, projectId]
      );
      
      // Update project_versions if versionId provided
      if (versionId) {
        await client.query(
          `UPDATE project_versions
           SET ai_session_id = $1,
               ai_session_last_used_at = CURRENT_TIMESTAMP
           WHERE version_id = $2`,
          [sessionId, versionId]
        );
      }
      
      // Log session transition for debugging
      await client.query(
        `INSERT INTO session_transitions 
         (project_id, version_id, old_session_id, new_session_id, source, created_at)
         SELECT project_id, $3, last_ai_session_id, $1, $4, CURRENT_TIMESTAMP
         FROM projects WHERE project_id = $2`,
        [sessionId, projectId, versionId, source]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get the chain of sessions for a project
   */
  static async getSessionChain(projectId: string): Promise<string[]> {
    const query = `
      SELECT DISTINCT ai_session_id, ai_session_last_used_at
      FROM project_versions
      WHERE project_id = $1 AND ai_session_id IS NOT NULL
      ORDER BY ai_session_last_used_at DESC
    `;
    const result = await pool.query(query, [projectId]);
    return result.rows.map(r => r.ai_session_id);
  }
}
```

### Phase 4: Create Session Transition Tracking Table

```sql
-- Migration 035_add_session_transitions.sql
CREATE TABLE IF NOT EXISTS public.session_transitions (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  version_id VARCHAR(255),
  old_session_id VARCHAR(255),
  new_session_id VARCHAR(255) NOT NULL,
  source VARCHAR(50) NOT NULL, -- 'build', 'metadata', 'compact', 'chat_plan'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_session_transitions_project (project_id),
  INDEX idx_session_transitions_new_session (new_session_id)
);

COMMENT ON TABLE public.session_transitions IS 'Audit trail of Claude session ID changes';
```

### Phase 5: Update All Consumers

1. **Chat Plan Service**: Already reads from projects.last_ai_session_id ✓
2. **Update Project**: Pass last session to stream worker
3. **Error Handlers**: Use projects.last_ai_session_id instead of in-memory map

### Phase 6: Session Validation & Recovery

```typescript
class SessionValidator {
  static async validateAndRecover(projectId: string, sessionId: string): Promise<string> {
    // Check if session is still valid
    const isValid = await this.checkSessionValidity(sessionId);
    
    if (!isValid) {
      // Get the latest valid session
      const latestSession = await SessionManagementService.getProjectSession(projectId);
      
      if (latestSession && latestSession !== sessionId) {
        console.log(`[Session] Recovering from ${sessionId} to ${latestSession}`);
        return latestSession;
      }
      
      // No valid session found - start fresh
      console.log(`[Session] No valid session found, starting fresh`);
      return '';
    }
    
    return sessionId;
  }
}
```

## Implementation Priority

1. **CRITICAL**: Update metadata generation to sync projects table
2. **CRITICAL**: Update compaction to sync projects table  
3. **HIGH**: Add session transition tracking
4. **MEDIUM**: Update error recovery to use projects table
5. **LOW**: Add monitoring dashboard for session chains

## Testing Scenarios

1. **Build → Metadata → Compact Chain**
   - Verify projects.last_ai_session_id updates at each step
   - Verify final session is the compacted one

2. **Build → Update → Chat Plan**
   - Verify chat plan uses latest session from update
   - Verify context is maintained

3. **Error Recovery**
   - Trigger build error
   - Verify recovery uses latest session
   - Verify new session updates projects table

4. **Concurrent Operations**
   - Start metadata while build running
   - Verify session updates don't conflict

## Monitoring Queries

```sql
-- Check session synchronization
SELECT 
  p.project_id,
  p.last_ai_session_id as project_session,
  pv.ai_session_id as version_session,
  pv.version_id,
  CASE 
    WHEN p.last_ai_session_id = pv.ai_session_id THEN 'SYNCED'
    ELSE 'OUT_OF_SYNC'
  END as sync_status
FROM projects p
JOIN project_versions pv ON p.project_id = pv.project_id
WHERE pv.id = (
  SELECT id FROM project_versions 
  WHERE project_id = p.project_id 
  ORDER BY created_at DESC 
  LIMIT 1
);

-- View session chain for a project
SELECT 
  source,
  old_session_id,
  new_session_id,
  created_at
FROM session_transitions
WHERE project_id = $1
ORDER BY created_at DESC;
```

## Risks & Mitigations

1. **Risk**: Race conditions during concurrent updates
   - **Mitigation**: Use transactions, row-level locks

2. **Risk**: Session chain becomes too long
   - **Mitigation**: Periodic full context reset after N operations

3. **Risk**: Lost sessions during failures
   - **Mitigation**: Redis checkpoints, session recovery logic

4. **Risk**: Storage growth from transition tracking
   - **Mitigation**: Archive old transitions after 30 days

## Success Criteria

- [ ] All Claude operations update projects.last_ai_session_id
- [ ] Chat Plan Mode always uses latest session
- [ ] No context loss between operations
- [ ] Session chain is auditable
- [ ] Recovery from invalid sessions works
- [ ] Monitoring shows 95%+ sync rate