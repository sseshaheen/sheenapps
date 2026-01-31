# Files to Delete for Stream-Based Migration

Since the product is not yet launched, we can perform a clean migration to the new Claude CLI stream-based approach.

## Files to Delete

### 1. AI Provider System (Complete Removal)
```
src/providers/
├── aiProvider.ts          # Abstract provider interface
├── claudeProvider.ts      # Claude API implementation
├── claudeCLIProvider.ts   # Current isolated CLI calls
├── providerFactory.ts     # Factory for provider creation
└── mockProvider.ts        # Mock implementation
```

### 2. Task Planning & Execution System
```
src/services/
├── planGenerator.ts       # Generates task plans from prompts
├── taskExecutor.ts        # Executes individual tasks
└── taskDatabase.ts        # Stores task state in PostgreSQL
```

### 3. Modular Worker System
```
src/workers/
└── modularWorkers.ts      # Plan and task workers
```

### 4. Modular Queue Definitions
```
src/queue/
└── modularQueues.ts       # Plan and task queue definitions
```

### 5. Modular Type Definitions
```
src/types/
└── modular.ts             # Task, TaskPlan, and related types
```

## Files to Keep/Modify

### 1. Core Infrastructure (Keep)
- `src/services/webhookService.ts` - Webhook delivery system
- `src/services/eventService.ts` - Event storage and retrieval
- `src/services/errorInterceptor.ts` - Error handling system
- `src/services/databaseWrapper.ts` - Database operations
- `src/services/cloudflarePages.ts` - Deployment service
- `src/services/cloudflareKV.ts` - KV storage

### 2. Workers to Modify
- `src/workers/deployWorker.ts` - Modify to use stream results instead of task results
- `src/workers/errorRecoveryWorker.ts` - Keep as-is, works with any error source

### 3. API Routes (Keep)
- All routes in `src/routes/` - They work with events, not implementation details

## Migration Steps

1. **Create New Stream Implementation**
   ```
   src/stream/
   ├── claudeSession.ts       # Core session management
   ├── streamProcessor.ts     # Process JSON stream
   ├── messageParser.ts       # Parse Claude messages
   ├── webhookAdapter.ts      # Convert to user-friendly updates
   └── types.ts              # Stream-specific types
   ```

2. **Update Entry Points**
   - Modify `src/server.ts` to use new stream processor
   - Update `scripts/test-claude-cli.ts` for testing
   - Adjust `scripts/manage-queues.ts` to remove old queues

3. **Database Cleanup**
   - Drop `tasks` table (no longer needed)
   - Keep `project_build_events`, `project_versions` tables

4. **Delete Old Files**
   ```bash
   rm -rf src/providers/
   rm src/services/planGenerator.ts
   rm src/services/taskExecutor.ts
   rm src/services/taskDatabase.ts
   rm src/workers/modularWorkers.ts
   rm src/queue/modularQueues.ts
   rm src/types/modular.ts
   ```

## Benefits of Clean Migration

1. **Simpler Codebase**: No legacy code to maintain
2. **Clear Architecture**: Single approach, no confusion
3. **Better Performance**: No overhead from abstraction layers
4. **Easier Debugging**: One path through the system

## Timeline

- Day 1-2: Build new stream implementation
- Day 3: Update integration points
- Day 4: Delete old files and test
- Day 5: Final cleanup and documentation
