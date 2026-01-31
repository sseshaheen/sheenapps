# File Architecture Status

## Current Production Files (DO NOT DELETE)

### Core Worker System
- **`/src/workers/buildWorker.ts`** - Main production build processor
  - Status: ACTIVE - Processing all production builds
  - Uses: Claude CLI directly via spawn
  - Called by: server.ts, directBuildService.ts

- **`/src/queue/buildQueue.ts`** - Production build queue
  - Status: ACTIVE - Receiving all build jobs
  - Used by: buildPreview.ts routes

### Production Routes
- **`/src/routes/buildPreview.ts`** - Main API endpoints
  - POST /api/preview/build - Creates new builds
  - POST /api/preview/rebuild - Rebuilds existing projects
  - All jobs go to buildQueue → buildWorker

## New Modular Architecture Files (NOT YET IN PRODUCTION)

### Phase 1: Foundation ✅
- `/src/services/webhookService.ts` - Webhook delivery with retry
- `/src/queue/modularQueues.ts` - New queue definitions (plan, task, webhook)
- `/src/types/modular.ts` - Type definitions for modular system
- `/src/db/migrations/001_create_task_tables.sql` - Database schema

### Phase 2: Task System ✅
- `/src/services/planGenerator.ts` - Generates task plans from prompts
- `/src/services/taskExecutor.ts` - Executes tasks with DAG support
- `/src/services/taskDatabase.ts` - Database operations for tasks

### Phase 3: AI Abstraction ✅
- `/src/providers/aiProvider.ts` - Provider interface
- `/src/providers/claudeCLIProvider.ts` - Claude CLI implementation (DEFAULT)
- `/src/providers/claudeProvider.ts` - Claude SDK implementation
- `/src/providers/mockProvider.ts` - Mock for testing
- `/src/providers/providerFactory.ts` - Provider selection logic

### Integration Files (NEW)
- `/src/workers/modularWorkers.ts` - Workers for modular system
- `/src/routes/buildPreviewModular.ts` - Hybrid routing logic
- `/docs/MIGRATION_TO_MODULAR.md` - Migration guide

## Architecture Comparison

### Current Flow (Production)
```
User Request
    ↓
buildPreview.ts routes
    ↓
buildQueue
    ↓
buildWorker.ts (monolithic)
    ↓
Claude CLI (direct spawn)
    ↓
Single Response
```

### New Modular Flow (Built, Not Integrated)
```
User Request
    ↓
buildPreviewModular.ts routes
    ↓
planQueue
    ↓
Plan Generation (streaming)
    ↓
taskQueue
    ↓
Individual Task Execution (parallel)
    ↓
Real-time Webhooks
```

## File Status Summary

### Keep Forever
- All configuration files
- All service files (database, cloudflare, etc.)
- All type definitions
- Server and route files

### Keep Until Migration Complete
- `buildWorker.ts` - Current production worker
- `buildQueue.ts` - Current production queue
- Old test files for existing system

### Already Modular-Ready
- All files in `/src/providers/`
- All files in `/src/services/` (planGenerator, taskExecutor, etc.)
- New test files in `/src/test/`

## Recommendations

1. **DO NOT DELETE buildWorker.ts** - It's the heart of production
2. **Complete Integration First** - The modular system needs to be wired into production routes
3. **Use Feature Flags** - Implement gradual rollout as described in MIGRATION_TO_MODULAR.md
4. **Monitor Both Systems** - Run old and new in parallel during transition
5. **Delete Only After Full Migration** - When 100% traffic is on modular system

## Missing Integration Steps

1. Update `server.ts` to start modular workers
2. Update routes to use hybrid routing
3. Add environment variables for feature flags
4. Create monitoring dashboard
5. Test rollback procedures

## Why Files Aren't Obsolete Yet

The modular architecture is like a new engine built beside the running car. We've built the new engine (75% complete), but we haven't:
- Connected it to the transmission (routes)
- Started it running (server.ts)
- Switched over from the old engine (migration)

Both systems will run in parallel during migration, then we can remove the old one.