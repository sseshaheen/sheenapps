# Immediate Implementation Roadmap

## Priority 1: Complete the Build & Deploy Flow (This Week)

### Current Status
The modular worker successfully:
- ✅ Generates plan (3 tasks for landing page)
- ✅ Executes all tasks (HTML, CSS, JS files created)
- ✅ Triggers deploy worker after task completion
- ✅ Builds project (npm build with static file copy)
- ⚠️  Fails at Cloudflare deployment - project doesn't exist
- ❌ Missing: Cloudflare project creation logic
- ❌ Missing: Webhook events during deploy
- ❌ Missing: Preview URL in final response

### Implementation Steps

#### 1. Add Build & Deploy Queue/Worker
```typescript
// src/queue/modularQueues.ts
export const deployQueue = new Queue('deployments', { connection });

// src/workers/deployWorker.ts
export const deployWorker = new Worker(
  'deployments',
  async (job) => {
    const { buildId, projectPath, userId, projectId } = job.data;
    
    // 1. Install dependencies
    await execCommand('npm install', projectPath);
    
    // 2. Build project
    await execCommand('npm run build', projectPath);
    
    // 3. Deploy to Cloudflare
    const result = await deployToCloudflarePages(
      path.join(projectPath, 'dist'),
      `${userId}-${projectId}`
    );
    
    // 4. Update database
    await updateBuildRecord(buildId, {
      status: 'deployed',
      previewUrl: result.url
    });
    
    return result;
  }
);
```

#### 2. Trigger Deploy After Tasks Complete
```typescript
// In taskExecutor.ts - after all tasks complete
await deployQueue.add('deploy-project', {
  buildId: plan.buildId,
  projectPath: context.projectPath,
  userId: context.userId,
  projectId: context.projectId
});
```

## Priority 2: Basic Progress Communication (This Week)

### Quick Win: Webhook-Based Updates

#### 1. Enhance Webhook Service
```typescript
// Current webhook types to implement:
- build_started
- plan_generated (with task list)
- task_started (with task name)
- task_completed
- build_started
- deploy_started
- build_completed (with preview URL)
```

#### 2. Main App Webhook Endpoint
```typescript
// Main app needs endpoint like:
POST /api/worker-webhooks
{
  buildId: "xxx",
  type: "task_started",
  data: {
    taskName: "Creating Hero.tsx",
    taskId: "task-1"
  }
}
```

#### 3. Store Progress in Database
```typescript
// Worker side: Store events
await db.createBuildEvent({
  buildId,
  eventType: 'task_started',
  eventData: { taskName, taskId },
  timestamp: new Date()
});

// Main app side: Poll for updates
GET /api/builds/{buildId}/events?since={timestamp}
```

## Priority 3: WebSocket Enhancement (Next Week)

### Simple Socket.io Implementation

#### 1. Add Socket.io to Worker
```typescript
// src/services/socketService.ts
import { Server } from 'socket.io';

class SocketService {
  private io: Server;
  
  initialize(server: any) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.MAIN_APP_URL,
        credentials: true
      }
    });
    
    this.io.on('connection', (socket) => {
      socket.on('subscribe', ({ buildId }) => {
        socket.join(`build:${buildId}`);
      });
    });
  }
  
  emit(buildId: string, event: any) {
    this.io.to(`build:${buildId}`).emit('progress', event);
    
    // Also store in DB for recovery
    db.createBuildEvent({
      buildId,
      eventType: event.type,
      eventData: event,
      timestamp: new Date()
    });
  }
}

export const socketService = new SocketService();
```

#### 2. Emit Events Throughout Flow
```typescript
// In plan generator
socketService.emit(buildId, {
  type: 'status',
  message: 'Analyzing your requirements...'
});

// In task executor
socketService.emit(buildId, {
  type: 'task_started',
  task: task.name
});

// In deploy worker
socketService.emit(buildId, {
  type: 'deploy_started',
  message: 'Deploying to Cloudflare Pages...'
});
```

## Current Status (Updated: 2025-07-22)

### Completed
1. **Deploy Worker**: Created `deployWorker.ts` with full build/deploy logic
2. **Deploy Queue**: Added to `modularQueues.ts` 
3. **Worker Integration**: Deploy worker starts with modular workers
4. **Task → Deploy Flow**: Tasks trigger deployment on completion
5. **Database Updates**: Version records created and updated

### In Progress
1. **Cloudflare Pages Project Creation**: Wrangler needs project to exist before deploying
   - Error: "Project not found" when deploying
   - Need to add project creation step or use existing project

### Issues Encountered
1. **TypeScript Errors**: Fixed missing `needsRebuild` and `cfDeploymentId` fields
2. **Worker Startup**: Fixed deploy worker integration in startup sequence
3. **Signature Validation**: Fixed - was using wrong signature generation in bash
4. **Task ID Duplicates**: Fixed - now generating unique ULIDs for each task
5. **Cloudflare Deployment**: Project must exist before deploying with wrangler

## Implementation Checklist

### Week 1: Core Functionality
- [x] Create deploy worker
- [x] Add deploy queue
- [x] Integrate with existing flow
- [x] Fix signature verification for test requests
- [x] Test flow: request → plan → execute → build
- [ ] Fix Cloudflare Pages project creation
- [ ] Complete deploy phase successfully
- [ ] Update database with preview URLs
- [ ] Return preview URL in API response

### Week 2: Basic Communication
- [ ] Extend webhook service with new event types
- [ ] Add build events table to database
- [ ] Create progress tracking endpoints
- [ ] Test with main app integration

### Week 3: Real-time Updates
- [ ] Add Socket.io server
- [ ] Create socket service
- [ ] Add event emissions throughout
- [ ] Test WebSocket connection with main app
- [ ] Add connection recovery

## Quick Start Commands

```bash
# 1. Install new dependencies
npm install socket.io
npm install @types/socket.io -D

# 2. Create new database tables
psql $DATABASE_URL < migrations/add_build_events.sql

# 3. Test deploy functionality
npm run test:deploy

# 4. Test full flow
curl -X POST http://localhost:3000/build-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -d '{"userId":"test","projectId":"test-app","prompt":"Create a simple landing page"}'
```

## Configuration Needed

```env
# Add to .env
MAIN_APP_URL=https://sheenapps.com
MAIN_APP_WEBHOOK_ENDPOINT=https://sheenapps.com/api/worker-webhooks
SOCKET_IO_PORT=3001

# Cloudflare Pages config (if not already set)
CF_PAGES_PROJECT_NAME=sheenapps-preview
CF_API_TOKEN=xxx
CF_ACCOUNT_ID=xxx
```

## Testing Plan

### 1. Deploy Worker Test
```typescript
// Create test project
// Run deploy worker
// Verify Cloudflare Pages deployment
// Check preview URL works
```

### 2. End-to-End Test
```typescript
// Submit build request
// Verify plan generation
// Verify task execution
// Verify build & deploy
// Check all webhooks fired
// Verify preview URL in response
```

### 3. Socket Test
```typescript
// Connect to socket
// Subscribe to build
// Trigger build
// Verify all events received
// Test disconnection recovery
```

## Success Criteria

1. **Full Flow Works**: Request → Plan → Execute → Build → Deploy → Preview URL
2. **Progress Visible**: Main app receives real-time updates
3. **Reliability**: 95% success rate for builds
4. **Performance**: <5 min for typical project build
5. **User Experience**: Clear progress indicators throughout

## Test Results Summary (2025-07-22)

### Successful Flow Test
1. **Request**: Successfully authenticated and queued
2. **Plan Generation**: Generated 3 tasks for landing page
   - Create HTML Structure 
   - Create CSS Styles
   - Add Form Validation Script
3. **Task Execution**: All 3 tasks completed successfully
   - Files created: index.html (4.9KB), styles.css, script.js
4. **Build Phase**: Successfully built with npm
   - Created minimal package.json
   - Copied files to dist directory
5. **Deploy Phase**: Failed - Cloudflare Pages project doesn't exist

### Key Metrics
- Total time from request to build: ~1 minute
- Files generated: 3 (HTML, CSS, JS)
- Claude API calls: 4 (1 plan + 3 tasks)

### Next Immediate Actions

1. **Option A**: Use a single shared Cloudflare Pages project
   - Pros: Simple, no project creation needed
   - Cons: All previews in same project
   
2. **Option B**: Add project creation to wrangler deploy
   - Use `wrangler pages project create` before deploy
   - Handle project name conflicts

3. **Option C**: Pre-create projects in database
   - Maintain pool of available projects
   - Assign projects to users as needed

## Next Actions

1. **Today**: Fix Cloudflare deployment issue
2. **Tomorrow**: Add webhook events and progress tracking
3. **This Week**: Complete full flow with preview URL
4. **Next Week**: Integrate with main app
5. **Week 3**: Polish and optimize