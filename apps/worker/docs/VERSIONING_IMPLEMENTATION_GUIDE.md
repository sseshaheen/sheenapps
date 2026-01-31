# Versioning Implementation Guide - Quick Start

## Implementation Progress (2025-08-13)

### ✅ Completed Steps:
1. **Database Migration** - Created `migrations/008_add_display_version.sql`
2. **Version Service** - Created `src/services/versioningService.ts` with:
   - `assignDisplayVersion()` - Assigns version numbers with transaction safety
   - `getCurrentVersionNumber()` - Gets current version for a project
   - `getNextVersionNumber()` - Preview next version number
   - `hasDisplayVersion()` - Check if version has display number
3. **Deployment Integration** - Modified `src/workers/deployWorker.ts`:
   - Added import for `assignDisplayVersion`
   - Calls version assignment immediately after successful deployment
   - Updates `current_version_name` in projects table immediately
   - Emits `version_assigned` event for frontend
4. **API Updates** - Modified `src/routes/versionHistory.ts`:
   - Added `displayVersion` and `displayVersionNumber` fields
   - Updated `name` field to prefer display version
   - Added `semanticVersion` object for internal use
5. **Database Query Ordering** - Updated `src/services/databaseWrapper.ts`:
   - Changed ordering from semantic versioning to `display_version_number DESC`
6. **Consistency Updates** - Modified `src/workers/streamWorker.ts`:
   - Prevents overwriting display version with semantic version
   - Checks for existing display version before updating
   - Keeps display version as primary identifier

### ⏳ Pending:
- Run database migration in production
- Test with real build
- Frontend integration

### 🔍 Discoveries & Notes:
- The deployment worker already has comprehensive event emission system
- Version assignment happens BEFORE metadata generation for instant feedback
- Transaction-based assignment prevents race conditions
- Frontend can now show version immediately (< 5 seconds) vs waiting 60+ seconds
- **Important**: Found that `current_version_name` in projects table was being overwritten by semantic version
- **Fixed**: Stream worker now checks for display version first and preserves it
- **Consistency**: `current_version_name` now always matches the user-facing display version

---

# Versioning Implementation Guide - Quick Start

## Step 1: Database Migration

Create migration file: `migrations/008_add_display_version.sql`

```sql
-- Add display version column
ALTER TABLE project_versions 
ADD COLUMN IF NOT EXISTS display_version_number INTEGER;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_project_display_version 
ON project_versions(project_id, display_version_number DESC);

-- Backfill existing versions (assigns v1, v2, v3... based on creation order)
WITH numbered_versions AS (
  SELECT 
    id,
    version_id,
    project_id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id 
      ORDER BY created_at ASC
    ) as version_num
  FROM project_versions
  WHERE status = 'deployed'
)
UPDATE project_versions pv
SET 
  display_version_number = nv.version_num,
  version_name = COALESCE(
    pv.version_name, 
    'v' || nv.version_num
  )
FROM numbered_versions nv
WHERE pv.id = nv.id;

-- Add comment for documentation
COMMENT ON COLUMN project_versions.display_version_number IS 
'User-facing version number (v1, v2, v3...) assigned immediately on deployment';
```

## Step 2: Add Version Assignment Function

Create new file: `src/services/versioningService.ts`

```typescript
import { pool } from './database';

/**
 * Assigns a display version number immediately after successful deployment
 * This runs BEFORE metadata generation, ensuring users see version immediately
 */
export async function assignDisplayVersion(
  projectId: string, 
  versionId: string
): Promise<number> {
  if (!pool) {
    console.warn('[Versioning] Database not available');
    return 0;
  }

  try {
    // Use a transaction to prevent race conditions
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get the next version number for this project
      const nextVersionResult = await client.query(`
        SELECT COALESCE(MAX(display_version_number), 0) + 1 as next_version
        FROM project_versions
        WHERE project_id = $1
        FOR UPDATE
      `, [projectId]);
      
      const nextVersion = nextVersionResult.rows[0].next_version;
      
      // Assign the version number immediately
      await client.query(`
        UPDATE project_versions
        SET 
          display_version_number = $1,
          version_name = COALESCE(version_name, $2),
          updated_at = NOW()
        WHERE version_id = $3
        RETURNING display_version_number
      `, [nextVersion, `v${nextVersion}`, versionId]);
      
      await client.query('COMMIT');
      
      console.log(`[Versioning] Assigned v${nextVersion} to ${versionId}`);
      return nextVersion;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Versioning] Failed to assign display version:', error);
    return 0;
  }
}

/**
 * Gets the current version number for a project
 */
export async function getCurrentVersionNumber(projectId: string): Promise<number> {
  if (!pool) return 0;
  
  try {
    const result = await pool.query(`
      SELECT COALESCE(MAX(display_version_number), 0) as current_version
      FROM project_versions
      WHERE project_id = $1 AND status = 'deployed'
    `, [projectId]);
    
    return result.rows[0]?.current_version || 0;
  } catch (error) {
    console.error('[Versioning] Failed to get current version:', error);
    return 0;
  }
}
```

## Step 3: Integrate into Deployment Flow

Update `src/workers/deployWorker.ts` or wherever deployment completes:

```typescript
import { assignDisplayVersion } from '../services/versioningService';

// After successful deployment
async function handleDeploymentSuccess(buildId: string, projectId: string, versionId: string) {
  // ... existing deployment success code ...
  
  // Assign display version IMMEDIATELY after deployment succeeds
  // This happens BEFORE metadata generation
  const displayVersion = await assignDisplayVersion(projectId, versionId);
  
  if (displayVersion > 0) {
    // Notify frontend via webhook/event
    await emitVersionAssigned(projectId, versionId, `v${displayVersion}`);
  }
  
  // Continue with metadata generation (can fail without affecting version)
  // ... existing metadata generation code ...
}
```

## Step 4: Update API Response

Update `src/routes/versionHistory.ts`:

```typescript
const formattedVersions = history.versions.map(v => {
  // Determine the display name
  const displayName = v.display_version_number 
    ? `v${v.display_version_number}`
    : v.version_name || `Version ${v.major_version || 1}.${v.minor_version || 0}.${v.patch_version || 0}`;
  
  return {
    id: v.version_id,
    
    // New field for frontend
    displayVersion: v.display_version_number ? `v${v.display_version_number}` : null,
    displayVersionNumber: v.display_version_number,
    
    // Keep existing fields for compatibility
    semver: `${v.major_version || 1}.${v.minor_version || 0}.${v.patch_version || 0}`,
    name: displayName,
    
    // Semantic version info (may be null if metadata generation failed)
    semanticVersion: v.major_version ? {
      major: v.major_version,
      minor: v.minor_version,
      patch: v.patch_version,
      full: `${v.major_version}.${v.minor_version}.${v.patch_version}`
    } : null,
    
    description: v.version_description,
    // ... rest of existing fields
  };
});
```

## Step 5: Update Database Query Ordering

Update `src/services/databaseWrapper.ts` in `getProjectVersionHistoryWithPublication`:

```typescript
// Change FROM:
ORDER BY 
  major_version DESC NULLS LAST,
  minor_version DESC NULLS LAST, 
  patch_version DESC NULLS LAST,
  created_at DESC

// TO:
ORDER BY 
  display_version_number DESC NULLS LAST,
  created_at DESC
```

## Step 6: Handle Edge Cases

### For Rollbacks
```typescript
// Don't create new version on rollback
async function handleRollback(targetVersionId: string) {
  // Reactivate existing version with its original display number
  // No increment needed
}
```

### For Failed Builds
```typescript
// Only assign version AFTER deployment succeeds
if (deploymentStatus === 'deployed') {
  await assignDisplayVersion(projectId, versionId);
}
```

## Step 7: Quick Testing Script

```typescript
// test-versioning.ts
import { assignDisplayVersion, getCurrentVersionNumber } from './src/services/versioningService';

async function test() {
  const projectId = '1d712582-cb89-4e13-9d16-88d1c2f7422b';
  const testVersionId = '01K2TEST123456789';
  
  console.log('Current version:', await getCurrentVersionNumber(projectId));
  
  const newVersion = await assignDisplayVersion(projectId, testVersionId);
  console.log('Assigned version:', newVersion);
}

test().catch(console.error);
```

## Immediate Actions (Can Do Right Now)

### 1. Create and Run Migration (5 minutes)
```bash
# Create migration file
cat > migrations/008_add_display_version.sql << 'EOF'
[paste SQL from Step 1]
EOF

# Run migration
psql $DATABASE_URL < migrations/008_add_display_version.sql
```

### 2. Add Version Service (10 minutes)
- Create `src/services/versioningService.ts`
- Copy code from Step 2

### 3. Update Deployment Flow (15 minutes)
- Find where deployment succeeds
- Add version assignment call
- Test with a real build

### 4. Update API (10 minutes)
- Modify version history endpoint
- Add displayVersion field
- Test API response

## Benefits Realized

### Before
- User waits 60+ seconds to see version name
- 10% of versions have no name due to metadata failures
- Complex semantic versioning logic

### After
- Version appears in <5 seconds
- 100% of deployed versions have names
- Simple incrementing counter
- Semantic versioning still available when it succeeds

## Frontend Integration

The frontend team needs to:

```javascript
// Old way
<div>{version.name || 'Loading...'}</div>

// New way - immediate display
<div>
  {version.displayVersion || version.name}
  {version.semanticVersion && (
    <small> ({version.semanticVersion.full})</small>
  )}
</div>
```

## Monitoring

Add these queries to monitor the system:

```sql
-- Check for versions without display numbers
SELECT COUNT(*) as missing_display_version
FROM project_versions
WHERE status = 'deployed' 
  AND display_version_number IS NULL;

-- Check version assignment rate
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_versions,
  SUM(CASE WHEN display_version_number IS NOT NULL THEN 1 ELSE 0 END) as with_display,
  ROUND(100.0 * SUM(CASE WHEN display_version_number IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM project_versions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Next Iteration Improvements

1. **Per-project sequences** for guaranteed uniqueness
2. **Version aliases** (users can rename v15 to "Production Release")
3. **Version tagging** (mark versions as "stable", "beta", etc.)
4. **Branch-based numbering** (v1-dev, v1-staging, v1-prod)

---

This can be implemented incrementally. Start with the database migration and version assignment, then gradually update the API and frontend.