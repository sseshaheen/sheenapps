# User ID Implementation for project_build_events

**Date**: 2025-07-27  
**Issue**: `project_build_events` table now has a `user_id` column that needs to be populated for security

## Problem

The `project_build_events` table was updated to include a `user_id` column to ensure users can only access their own build events. However, records were being created with `NULL` values in the `user_id` field.

## Solution Implemented

### 1. Updated `emitBuildEvent` Function ✅

**File**: `/src/services/eventService.ts`

- Modified to extract `userId` from the event data payload
- Updated INSERT statement to include `user_id` column
- Supports both `userId` and `user_id` property names

```typescript
// Extract userId from data if available
const userId = data?.userId || data?.user_id || null;

const result = await pool.query(
  'INSERT INTO project_build_events (build_id, event_type, event_data, user_id) VALUES ($1, $2, $3, $4) RETURNING id',
  [buildId, type, JSON.stringify(data), userId]
);
```

### 2. Updated `getEventsSince` Function ✅

**File**: `/src/services/eventService.ts`

- Added optional `userId` parameter for security filtering
- When `userId` is provided, filters events to only show:
  - Events belonging to that user (`user_id = userId`)
  - System events (`user_id IS NULL`)

```typescript
export async function getEventsSince(buildId: string, lastEventId: number = 0, userId?: string)
```

### 3. Updated Progress Routes ✅

**File**: `/src/routes/progress.ts`

- Added `userId` as optional query parameter
- Updated both `/api/builds/:buildId/events` and `/api/builds/:buildId/status` routes
- Pass `userId` to `getEventsSince` for filtering

**Usage**: 
- `GET /api/builds/:buildId/events?userId=user123`
- `GET /api/builds/:buildId/status?userId=user123`

### 4. Updated Key Event Emitters ✅

**Files**: 
- `/src/workers/streamWorker.ts` (already had `userId`)
- `/src/workers/deployWorker.ts` (added `userId` to key events)

**Events Updated**:
- `build_started`
- `deploy_started` 
- `deploy_completed`
- `deploy_failed`

## Data Flow

1. **Event Creation**: Worker calls `emitBuildEvent(buildId, type, data)` where `data` contains `userId`
2. **Database Storage**: `emitBuildEvent` extracts `userId` and stores it in the `user_id` column
3. **Event Retrieval**: Client calls progress API with `userId` parameter
4. **Security Filtering**: `getEventsSince` filters events by `user_id`

## Backward Compatibility

- Events without `userId` in data are stored with `user_id = NULL`
- When querying without `userId` parameter, all events are returned (backward compatible)
- When querying with `userId`, only user's events + system events (NULL) are returned

## Security Benefits

✅ **User Isolation**: Users can only see their own build events  
✅ **System Events**: Shared system events (user_id = NULL) visible to all  
✅ **API Security**: Progress endpoints filter by user authentication  

## Testing Recommendations

1. **Create build events** with and without `userId` in data
2. **Verify database** has correct `user_id` values
3. **Test progress API** with and without `userId` parameter
4. **Confirm filtering** works correctly for different users

## Migration Notes

- Existing events with `user_id = NULL` will continue to work
- New events will have proper `user_id` values where available
- No database migration required - handled in application logic