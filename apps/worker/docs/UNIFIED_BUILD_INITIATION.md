# Unified Build Initiation System

## Overview

The Unified Build Initiation System ensures consistent lifecycle management for all build operations, regardless of the entry point. This solves the problem of inconsistent project state updates and missing lifecycle events when builds are initiated through different endpoints.

## Problem Statement

Previously, builds initiated through different endpoints had inconsistent behavior:
- `/v1/update-project` ✅ Updated project status correctly
- `/v1/chat-plan/convert-to-build` ❌ Missing status updates
- `/v1/create-preview` ❌ Inconsistent updates
- `/v1/build-preview` ❌ Inconsistent updates

This caused:
- Projects appearing "stuck" with no visible build progress
- Missing buildId in projects table
- Inconsistent database state
- Difficult to maintain code with duplicated logic

## Solution

### Core Service: `buildInitiationService.ts`

A single, unified service that handles ALL build initiations with consistent lifecycle management.

### Key Features

1. **Consistent Status Updates**
   - Sets project status to 'queued' immediately
   - Updates buildId in projects table
   - Sets lastBuildStarted timestamp
   - Clears lastBuildCompleted to avoid timing constraints

2. **Architecture Agnostic**
   - Works with stream, modular, and monolith architectures
   - Automatically routes to correct queue based on ARCH_MODE

3. **Plan Conversion Tracking**
   - Tracks plan-to-build conversions in database
   - Updates project_chat_plan_sessions table
   - Maintains audit trail

4. **Error Handling**
   - Graceful degradation if status updates fail
   - Returns queue_failed status on errors
   - Updates project status to 'failed' on critical errors

## Usage

### For New Code

Always use the `initiateBuild` function directly:

```typescript
import { initiateBuild } from '../services/buildInitiationService';

const result = await initiateBuild({
  userId: 'user-123',
  projectId: 'project-456',
  prompt: 'Build a landing page',
  framework: 'react',
  isInitialBuild: false,
  metadata: {
    source: 'update-project', // or 'convert-plan', 'create-preview', etc.
    // Additional metadata
  }
});

// Result contains:
// - buildId: The generated build ID
// - versionId: The version ID
// - jobId: The queue job ID
// - status: 'queued' or 'queue_failed'
// - projectPath: The project directory path
// - error?: Error message if failed
```

### For Legacy Code

The `enqueueBuild` function has been updated to use the unified service internally, maintaining backward compatibility:

```typescript
// Still works but deprecated
const job = await enqueueBuild(jobData);
```

## Lifecycle Flow

1. **Request Received** (any endpoint)
2. **initiateBuild Called**
   - Generates buildId and versionId
   - Updates project status to 'queued'
   - Sets buildId in projects table
   - Updates timestamps
3. **Plan Conversion Tracking** (if applicable)
   - Updates project_chat_plan_sessions
   - Creates tracking record
4. **Queue Job**
   - Routes to appropriate queue (stream/modular/monolith)
   - Includes all metadata
5. **Status Update**
   - Updates project status to 'building'
   - Non-critical if fails (worker will update)
6. **Return Result**
   - Returns consistent result structure
   - Includes all IDs for tracking

## Database Updates

The service ensures these database updates happen consistently:

### projects table
- `status` → 'queued' then 'building'
- `build_id` → Current build ID
- `framework` → Build framework
- `last_build_started` → Current timestamp
- `last_build_completed` → NULL (cleared)

### project_chat_plan_sessions table (if converting from plan)
- `status` → 'converted'
- `converted_to_build_id` → Build ID
- `last_active` → Current timestamp

## Entry Points

All these endpoints now use the unified service:
- `/v1/update-project` - Updates existing projects
- `/v1/chat-plan/convert-to-build` - Converts plans to builds
- `/v1/create-preview` - Creates new projects (future)
- `/v1/build-preview` - Builds preview versions (future)

## Monitoring

Look for these log entries to track build initiation:
- `[BuildInitiation] Starting build initiation`
- `[BuildInitiation] Project status updated`
- `[BuildInitiation] Stream/Modular/Monolith job queued`
- `[BuildInitiation] Updated plan session as converted` (for conversions)

## Migration Notes

1. All new build initiation code should use `initiateBuild` directly
2. Legacy `enqueueBuild` calls will continue to work but are deprecated
3. Direct queue additions should be avoided - always go through the unified service
4. Project status updates are now automatic - no need to update manually

## Benefits

1. **Consistency**: All builds follow the same lifecycle
2. **Reliability**: Proper error handling and fallbacks
3. **Maintainability**: Single source of truth for build initiation
4. **Observability**: Consistent logging and tracking
5. **Flexibility**: Easy to add new features to all build paths

## Future Enhancements

- Add build priority management
- Implement rate limiting at initiation level
- Add webhook notifications for status changes
- Implement build cancellation support
- Add cost estimation before initiation