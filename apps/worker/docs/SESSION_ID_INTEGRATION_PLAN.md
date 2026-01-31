# Session ID Integration Plan

## Current State Analysis

### How Session IDs Are Generated

1. **Claude CLI generates session IDs**: When Claude CLI spawns, it generates a unique session ID that appears in its stream messages
2. **ClaudeSession captures it**: The `ClaudeSession` class (src/stream/claudeSession.ts) captures the session ID from the Claude stream:
   - Line 217: `this.sessionId = message.session_id;`
3. **Stream Worker passes it along**: The stream worker returns the sessionId in the result
4. **Endpoints return it to frontend**: Both create-preview and update-project endpoints return the sessionId

### Current Endpoints That Generate Session IDs

1. **POST /v1/create-preview-for-new-project**
   - Returns sessionId in response
   - Session generated when Claude CLI spawns for initial build

2. **POST /v1/update-project**
   - Currently doesn't return sessionId (BUG - needs fix)
   - Session generated when Claude CLI spawns for updates

3. **POST /v1/chat-plan** (new Chat Plan Mode)
   - Needs to use stored sessionId from projects table for context continuity

## Integration Plan

### Goal
Store the latest Claude session ID in the projects table so:
- Chat Plan Mode can resume conversations with proper context
- We maintain a single source of truth for the latest session per project
- We can track session continuity across different operations

### Database Schema (Already Created)
```sql
-- Migration 034 already created:
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS last_ai_session_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_ai_session_updated_at TIMESTAMP WITH TIME ZONE;
```

### Implementation Steps

#### Step 1: Create Session Update Service
Create a centralized service to update project session IDs:

```typescript
// src/services/sessionManagementService.ts
export class SessionManagementService {
  static async updateProjectSession(
    projectId: string, 
    sessionId: string,
    source: 'create_preview' | 'update_project' | 'chat_plan' | 'metadata_generation'
  ): Promise<void> {
    const query = `
      UPDATE projects 
      SET 
        last_ai_session_id = $1,
        last_ai_session_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE project_id = $2
    `;
    
    await pool.query(query, [sessionId, projectId]);
    
    console.log(`[SessionManagement] Updated project ${projectId} with session ${sessionId} from ${source}`);
  }
  
  static async getProjectSession(projectId: string): Promise<string | null> {
    const query = `
      SELECT last_ai_session_id, last_ai_session_updated_at
      FROM projects
      WHERE project_id = $1
    `;
    
    const result = await pool.query(query, [projectId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].last_ai_session_id;
  }
}
```

#### Step 2: Update Stream Worker
Update the stream worker to save session IDs after successful Claude operations:

```typescript
// In src/workers/streamWorker.ts after line 545:
if (result.sessionId) {
  // Store in projects table
  await SessionManagementService.updateProjectSession(
    projectId,
    result.sessionId,
    'create_preview'
  );
}
```

#### Step 3: Update Create Preview Endpoint
Ensure create-preview endpoint updates projects table with sessionId:

```typescript
// In src/routes/createPreview.ts
// After receiving result with sessionId (line 585):
if (result.sessionId) {
  await SessionManagementService.updateProjectSession(
    actualProjectId,
    result.sessionId,
    'create_preview'
  );
}
```

#### Step 4: Fix Update Project Endpoint
Update the update-project endpoint to:
1. Return sessionId in response
2. Update projects table with new sessionId

```typescript
// In src/routes/updateProject.ts
// After job completion:
if (result.sessionId) {
  await SessionManagementService.updateProjectSession(
    projectId,
    result.sessionId,
    'update_project'
  );
  
  // Include sessionId in response
  return reply.send({
    success: true,
    jobId: job.id,
    buildId,
    sessionId: result.sessionId, // ADD THIS
    status: 'completed'
  });
}
```

#### Step 5: Update Metadata Generation
When metadata generation creates a session, update projects table:

```typescript
// In streamWorker.ts handleMetadataGeneration function:
if (recResult.sessionId) {
  await SessionManagementService.updateProjectSession(
    projectId,
    recResult.sessionId,
    'metadata_generation'
  );
}
```

#### Step 6: Update Chat Plan Service to Use Stored Session
The ChatPlanServiceV2 already reads from projects table - just ensure it uses the session:

```typescript
// In ChatPlanServiceV2.processChatPlan:
const projectContext = await this.getProjectContext(request.projectId);
const sessionId = projectContext.lastAiSessionId || ulid();

// When executing Claude:
if (sessionId && projectContext.lastAiSessionId === sessionId) {
  claudeArgs.push('--resume', sessionId);
}
```

## Testing Plan

1. **Test create-preview updates session**:
   - Create new project via create-preview
   - Verify projects.last_ai_session_id is populated
   
2. **Test update-project updates session**:
   - Update existing project
   - Verify projects.last_ai_session_id is updated
   
3. **Test chat plan uses stored session**:
   - Create project with create-preview
   - Use chat plan endpoint
   - Verify it resumes the same session
   
4. **Test session continuity**:
   - Create project
   - Update project
   - Use chat plan
   - Verify all use the same session context

## Rollback Plan

If issues arise:
1. The columns are nullable, so old code will continue to work
2. Can set last_ai_session_id to NULL to disable session resumption
3. Chat plan will fall back to creating new sessions if no stored session exists

## Success Metrics

- All build operations update projects.last_ai_session_id
- Chat plan successfully resumes sessions from builds
- Reduced token usage due to context preservation
- Improved chat plan response relevance

## Timeline

1. Hour 1: Implement SessionManagementService
2. Hour 2: Update stream worker and create-preview
3. Hour 3: Fix update-project endpoint
4. Hour 4: Test integration
5. Hour 5: Deploy and monitor