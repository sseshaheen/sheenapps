# Migration Tool: THIS WEEK Action Plan

**Goal**: Get migration jobs processing through BullMQ with real-time UI updates

**Time**: 3-4 days
**Priority**: ⭐⭐⭐ CRITICAL (Foundation for everything else)

---

## Day 1: Create Queue + Worker (Tuesday)

### Task 1.1: Create Migration Queue
**File**: `sheenapps-claude-worker/src/queue/migrationQueue.ts` (NEW)

```typescript
import { Queue, QueueEvents } from 'bullmq';

export interface MigrationJobData {
  migrationId: string;
  userId: string;
  sourceUrl: string;
  userPrompt?: string;
}

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

export const migrationQueue = new Queue<MigrationJobData>('migrations', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const migrationQueueEvents = new QueueEvents('migrations', { connection });

export async function enqueueMigration(data: MigrationJobData): Promise<string> {
  const job = await migrationQueue.add('migration.process', data, {
    jobId: `migration:${data.migrationId}`,
  });
  return job.id;
}
```

### Task 1.2: Create Migration Worker
**File**: `sheenapps-claude-worker/src/workers/migrationWorker.ts` (NEW)

```typescript
import { Worker, Job } from 'bullmq';
import { MigrationJobData } from '../queue/migrationQueue';
import { MigrationOrchestratorService } from '../services/migrationOrchestratorService';
import { unifiedLogger } from '../services/unifiedLogger';

const orchestrator = new MigrationOrchestratorService();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

export const migrationWorker = new Worker<MigrationJobData>(
  'migrations',
  async (job: Job<MigrationJobData>) => {
    const { migrationId, userId } = job.data;

    unifiedLogger.system('startup', 'info', 'Migration job started', {
      migrationId,
      jobId: job.id,
    });

    // Execute pipeline (mock for now)
    await orchestrator.executeAIPipeline(migrationId, userId);

    return { status: 'completed', migrationId };
  },
  {
    connection,
    concurrency: 2,
  }
);

migrationWorker.on('completed', (job) => {
  unifiedLogger.system('startup', 'info', 'Migration completed', {
    migrationId: job.data.migrationId,
    jobId: job.id,
  });
});

migrationWorker.on('failed', (job, error) => {
  unifiedLogger.system('error', 'error', 'Migration failed', {
    migrationId: job?.data.migrationId,
    error: error.message,
  });
});
```

**Test**: Run `npm run dev` and check console for "Worker migrations listening"

---

## Day 2: Add Mock Pipeline + Lease Locking

### Task 2.1: Add Migration Schema
**File**: `sheenapps-claude-worker/migrations/093_migration_lease_locking.sql` (NEW)

```sql
BEGIN;

ALTER TABLE migration_projects
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_migration_projects_lease
  ON migration_projects(locked_at, lease_expires_at)
  WHERE locked_at IS NOT NULL;

COMMIT;
```

**Run**: `psql -U postgres -d sheenapps -f migrations/093_migration_lease_locking.sql`

### Task 2.2: Add Lease Methods to Orchestrator
**File**: `sheenapps-claude-worker/src/services/migrationOrchestratorService.ts`

Add these methods:

```typescript
async claimMigrationLease(migrationId: string): Promise<boolean> {
  const workerId = `worker:${process.pid}`;

  const result = await this.pool.query(`
    UPDATE migration_projects
    SET locked_at = NOW(), locked_by = $2, lease_expires_at = NOW() + INTERVAL '30 minutes'
    WHERE id = $1 AND (locked_at IS NULL OR lease_expires_at < NOW())
    RETURNING id
  `, [migrationId, workerId]);

  return result.rowCount! > 0;
}

async releaseMigrationLease(migrationId: string): Promise<void> {
  await this.pool.query(`
    UPDATE migration_projects
    SET locked_at = NULL, locked_by = NULL, lease_expires_at = NULL
    WHERE id = $1
  `, [migrationId]);
}

// Make executeAIPipeline public (remove 'private')
async executeAIPipeline(migrationId: string, userId: string): Promise<void> {
  // MOCK IMPLEMENTATION (replace later)
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    // Phase 1: Analysis
    await this.broadcastProgress(migrationId, 'ANALYZE', 0, 'Starting analysis...');
    await sleep(3000);
    await this.broadcastProgress(migrationId, 'ANALYZE', 25, 'Analysis complete');

    // Phase 2: Planning
    await sleep(3000);
    await this.broadcastProgress(migrationId, 'PLAN', 40, 'Planning complete');

    // Phase 3: Transformation
    await sleep(3000);
    await this.broadcastProgress(migrationId, 'TRANSFORM', 75, 'Code generated');

    // Phase 4: Deployment
    await sleep(3000);
    await this.broadcastComplete(migrationId, 'mock-project-id-12345');

  } catch (error) {
    await this.broadcastFailed(migrationId, (error as Error).message);
    throw error;
  }
}

private async broadcastProgress(
  migrationId: string,
  phase: string,
  progress: number,
  message: string
): Promise<void> {
  const event = migrationSSEService.createPhaseUpdateEvent(
    migrationId,
    phase,
    progress,
    undefined,
    [],
    0
  );
  await migrationSSEService.broadcastMigrationUpdate(migrationId, event);
}

private async broadcastComplete(migrationId: string, projectId: string): Promise<void> {
  const event = migrationSSEService.createDoneEvent(
    migrationId,
    true,
    0,
    0,
    projectId,
    '',
    { message: 'Migration completed successfully!' }
  );
  await migrationSSEService.broadcastMigrationUpdate(migrationId, event);
}

private async broadcastFailed(migrationId: string, message: string): Promise<void> {
  const event = migrationSSEService.createErrorEvent(
    migrationId,
    'TRANSFORM',
    0,
    'MIGRATION_FAILED',
    message,
    false,
    {}
  );
  await migrationSSEService.broadcastMigrationUpdate(migrationId, event);
}
```

### Task 2.3: Update Worker to Use Lease
**File**: `sheenapps-claude-worker/src/workers/migrationWorker.ts`

```typescript
export const migrationWorker = new Worker<MigrationJobData>(
  'migrations',
  async (job: Job<MigrationJobData>) => {
    const { migrationId, userId } = job.data;

    try {
      // Claim lease
      const claimed = await orchestrator.claimMigrationLease(migrationId);
      if (!claimed) {
        return { status: 'already_claimed' };
      }

      // Execute
      await orchestrator.executeAIPipeline(migrationId, userId);

      return { status: 'completed', migrationId };

    } finally {
      // Always release
      await orchestrator.releaseMigrationLease(migrationId);
    }
  },
  { connection, concurrency: 2 }
);
```

---

## Day 3: Wire Up Route + Register Worker

### Task 3.1: Import Migration Queue in Routes
**File**: `sheenapps-claude-worker/src/routes/migration.ts`

Add to imports (top of file):
```typescript
import { enqueueMigration } from '../queue/migrationQueue';
```

### Task 3.2: Update POST /migration/start
**File**: `sheenapps-claude-worker/src/routes/migration.ts:100-120`

Replace the migration start handler:

```typescript
const migrationProject = await orchestrator.startMigration({
  sourceUrl,
  userId,
  userPrompt: typeof userBrief === 'string' ? userBrief : JSON.stringify(userBrief)
});

// Enqueue job
await enqueueMigration({
  migrationId: migrationProject.id,
  userId,
  sourceUrl,
  userPrompt: typeof userBrief === 'string' ? userBrief : undefined,
});

unifiedLogger.system('startup', 'info', 'Migration enqueued', {
  migrationId: migrationProject.id,
  userId
});

return reply.code(202).send({
  migrationId: migrationProject.id,
  status: 'queued',
  message: 'Migration queued successfully',
  correlationId: migrationProject.id,
});
```

### Task 3.3: Register Worker in Server
**File**: `sheenapps-claude-worker/src/server.ts`

Add imports (around line 100):
```typescript
import { migrationWorker } from './workers/migrationWorker';
import { migrationQueue, migrationQueueEvents } from './queue/migrationQueue';
```

Add to Bull Board (around line 700):
```typescript
const serverAdapter = new FastifyAdapter();
createBullBoard({
  queues: [
    new BullMQAdapter(buildQueue),
    new BullMQAdapter(deployQueue),
    new BullMQAdapter(planQueue),
    new BullMQAdapter(taskQueue),
    new BullMQAdapter(webhookQueue),
    new BullMQAdapter(streamQueue),
    new BullMQAdapter(migrationQueue), // ADD THIS
  ],
  serverAdapter,
});
```

---

## Day 4: End-to-End Testing

### Test 4.1: Check Bull Board
1. Start worker: `npm run dev` (in worker directory)
2. Open Bull Board: http://localhost:8081/admin/queues
3. Should see "migrations" queue

### Test 4.2: Trigger Migration
1. Open frontend: http://localhost:3000/ar-eg/migrate
2. Enter URL: https://example.com
3. Click "Start Migration"
4. Should redirect to progress page

### Test 4.3: Verify Queue Processing
1. Check Bull Board: Should see job in "active" queue
2. Watch console logs: Should see "Migration job started"
3. Watch frontend: Progress bar should update every 3 seconds
4. After ~12 seconds: Should see green success card

### Test 4.4: Verify Database
```sql
-- Check migration created
SELECT id, status, locked_at, locked_by FROM migration_projects ORDER BY created_at DESC LIMIT 1;

-- Should see: locked_at = NULL (lease released), status = completed

-- Check events
SELECT type, payload->>'message', created_at
FROM migration_events
WHERE migration_project_id = 'YOUR_MIGRATION_ID'
ORDER BY created_at;

-- Should see: migration_progress events with increasing progress
```

### Test 4.5: Test Retry Logic
1. Add `throw new Error('Test failure')` in executeAIPipeline
2. Start new migration
3. Check Bull Board: Job should retry 3 times
4. Check frontend: Should show error state

---

## Success Criteria (End of Week)

### ✅ You Should Have:
1. Migration queue visible in Bull Board
2. Worker processing jobs (console logs)
3. Frontend shows real-time progress (SSE updates)
4. Progress bar animates from 0% → 100%
5. Success card appears with mock project ID
6. Lease locking prevents duplicate execution
7. Retries work (3 attempts with exponential backoff)

### ✅ What Works:
- Queue infrastructure (durable, retryable)
- Real-time UI updates (SSE)
- Lease locking (no duplicates)
- Error handling (retries, failure states)

### ❌ What's Still Mock:
- Website crawling (mock data)
- AI analysis (mock data)
- Code generation (mock project ID)
- Actual project creation (no files written)

**Next Week**: Replace mock pipeline with real website crawler + AI analysis.

---

## Troubleshooting

### Issue: Worker not starting
**Check**: Redis running? `redis-cli ping` should return `PONG`
**Fix**: Start Redis: `brew services start redis` (Mac) or `sudo systemctl start redis` (Linux)

### Issue: SSE not connecting
**Check**: Event route registered? `GET /api/events/stream` in logs
**Fix**: Ensure `registerUnifiedChatRoutes` is called in server.ts

### Issue: Progress not updating
**Check**: `broadcastMigrationUpdate` being called?
**Fix**: Add console.log in migrationSSEService to verify events sent

### Issue: Job stuck in "active"
**Check**: Worker crashed? Check console for errors
**Fix**: Restart worker, job will auto-retry

---

## Files Created This Week

### New Files (5 total)
1. `sheenapps-claude-worker/src/queue/migrationQueue.ts`
2. `sheenapps-claude-worker/src/workers/migrationWorker.ts`
3. `sheenapps-claude-worker/migrations/093_migration_lease_locking.sql`
4. This file: `MIGRATION_THIS_WEEK.md`
5. Previous file: `MIGRATION_IMPLEMENTATION_CORRECTED.md`

### Modified Files (3 total)
1. `sheenapps-claude-worker/src/routes/migration.ts` (enqueue instead of in-process)
2. `sheenapps-claude-worker/src/services/migrationOrchestratorService.ts` (lease + mock pipeline)
3. `sheenapps-claude-worker/src/server.ts` (register worker + Bull Board)

**Total Changes**: 8 files, ~300 lines of code

---

## Next Week Preview

Once the queue infrastructure works, Week 2 will add:
1. Real website crawler (cheerio + axios)
2. SSRF protection (block private IPs)
3. Shallow vs deep analysis (pre/post verification)
4. Store analysis results in DB
5. Replace mock pipeline with real analysis

But first: **Get the queue working!** 🚀

---

**Questions? Stuck?**
- Check Bull Board dashboard for job status
- Check worker console logs for errors
- Check Redis: `redis-cli` → `KEYS migration:*`
- Check database: `SELECT * FROM migration_projects ORDER BY created_at DESC LIMIT 1`

**End of Week Goal**: Migration jobs processing end-to-end with real-time UI updates! ✅
