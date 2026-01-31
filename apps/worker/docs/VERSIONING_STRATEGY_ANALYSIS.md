# Versioning Strategy Analysis & Implementation Plan

## Current State Analysis

### Problems with Current Approach
1. **Delayed Version Display**: Frontend can't show version name until recommendations.json is generated (~60-70 seconds)
2. **Failure Impact**: If metadata generation fails, version remains unnamed (shows as "Version 1.0.0")
3. **User Experience**: Users see loading state or placeholder text for too long
4. **Data Integrity**: Multiple records with NULL semantic versions when metadata fails

### Current Flow
```
Build Starts → Deploy → Metadata Generation (60s) → Version Name Available
                  ↑                        ↑
                  User sees preview       Version finally named
                  but no version name     (or fails completely)
```

## Proposed Solution: Dual Versioning

### 1. Display Version (User-Facing)
- **Format**: `v1`, `v2`, `v3`, etc.
- **Assignment**: Immediately upon successful deployment
- **Storage**: New column `display_version_number` (INTEGER)
- **Uniqueness**: Per project, auto-incrementing
- **Never fails**: Simple counter, no AI dependency

### 2. Semantic Version (Internal)
- **Format**: `1.0.0`, `1.1.0`, `1.1.1` (major.minor.patch)
- **Assignment**: During metadata generation (as now)
- **Storage**: Keep existing columns (major_version, minor_version, patch_version)
- **Purpose**: Internal analytics, change tracking, API compatibility
- **Can fail**: Doesn't affect user experience

## Implementation Plan

### Phase 1: Database Schema Changes

```sql
-- Add display version column
ALTER TABLE project_versions 
ADD COLUMN display_version_number INTEGER;

-- Add index for efficient queries
CREATE INDEX idx_project_display_version 
ON project_versions(project_id, display_version_number DESC);

-- Backfill existing data
WITH numbered_versions AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id 
      ORDER BY created_at ASC
    ) as version_num
  FROM project_versions
  WHERE status = 'deployed'
)
UPDATE project_versions pv
SET display_version_number = nv.version_num
FROM numbered_versions nv
WHERE pv.id = nv.id;
```

### Phase 2: Code Changes

#### 2.1 Version Assignment (deployWorker.ts or streamWorker.ts)
```typescript
// After successful deployment
async function assignDisplayVersion(projectId: string, versionId: string) {
  // Get next version number
  const result = await pool.query(`
    SELECT COALESCE(MAX(display_version_number), 0) + 1 as next_version
    FROM project_versions
    WHERE project_id = $1
  `, [projectId]);
  
  const nextVersion = result.rows[0].next_version;
  
  // Update immediately
  await pool.query(`
    UPDATE project_versions
    SET 
      display_version_number = $1,
      version_name = $2,
      updated_at = NOW()
    WHERE version_id = $3
  `, [nextVersion, `v${nextVersion}`, versionId]);
  
  return nextVersion;
}
```

#### 2.2 API Response Changes (versionHistory.ts)
```typescript
const formattedVersions = history.versions.map(v => ({
  id: v.version_id,
  // Use display version as primary, fall back to semantic
  displayVersion: v.display_version_number ? `v${v.display_version_number}` : null,
  semver: `${v.major_version || 1}.${v.minor_version || 0}.${v.patch_version || 0}`,
  // Show display version in name, with semantic as subtitle
  name: v.display_version_number 
    ? `v${v.display_version_number}`
    : v.version_name || 'Unnamed Version',
  semanticVersion: v.version_name, // Keep for backward compatibility
  description: v.version_description,
  // ... rest of fields
}));
```

#### 2.3 Sorting Logic Update
```sql
ORDER BY 
  display_version_number DESC NULLS LAST,
  created_at DESC
```

### Phase 3: Migration Strategy

#### Option A: Big Bang (Recommended for Speed)
1. Deploy schema changes
2. Run backfill script
3. Deploy code changes
4. Frontend switches to use displayVersion

#### Option B: Gradual Rollout
1. Add new column (nullable)
2. Start populating for new builds
3. Backfill old data in batches
4. Switch frontend after verification

### Phase 4: Frontend Changes

```typescript
// Before
<span>{version.name || 'Loading...'}</span>

// After  
<span>{version.displayVersion || version.name || 'Processing...'}</span>
<small>{version.semanticVersion && `(${version.semanticVersion})`}</small>
```

## Benefits

### Immediate
- ✅ Version visible immediately after deployment (2-15 seconds vs 60+ seconds)
- ✅ No more "Version 1.0.0" placeholders
- ✅ Metadata failures don't affect version display
- ✅ Simpler mental model for users

### Long-term
- ✅ Can still use semantic versioning for internal purposes
- ✅ Easier to implement version comparison (v25 > v24 is obvious)
- ✅ No dependency on AI for critical user-facing data
- ✅ Consistent version numbers across all projects

## Edge Cases & Considerations

### 1. Rollbacks
- Display version should NOT increment on rollback
- Rollback reactivates existing version with its original number

### 2. Failed Deployments
- Only increment counter on SUCCESSFUL deployment
- Failed builds get no display version

### 3. Concurrent Builds
- Use database transaction with SELECT FOR UPDATE to prevent race conditions
- Or use database sequence: `CREATE SEQUENCE project_{id}_version_seq`

### 4. Version Gaps
- If build fails after incrementing, accept the gap (v1, v2, v4)
- Similar to auto-increment IDs

### 5. Import/Export
- When importing project, reset display version counter
- Or maintain mapping table for version number translation

## Implementation Timeline

### Week 1
- [ ] Database schema changes
- [ ] Backfill script for existing data
- [ ] Update deployment flow to assign display versions

### Week 2  
- [ ] Update API endpoints to return displayVersion
- [ ] Update sorting logic
- [ ] Testing with various edge cases

### Week 3
- [ ] Frontend integration
- [ ] Backward compatibility testing
- [ ] Documentation updates

## Rollback Plan

If issues arise:
1. Frontend can immediately fall back to old version naming
2. Keep both systems running in parallel initially
3. Database changes are additive (no data loss)
4. Can revert code while keeping schema changes

## Success Metrics

- **Version Display Time**: From 60+ seconds → <5 seconds
- **Failed Version Names**: From ~10% → 0%
- **User Complaints**: Reduction in "version not showing" issues
- **System Complexity**: Simpler version management

## Alternative Approaches Considered

### 1. Timestamp-based Versions
- Format: `v20240813.1`, `v20240813.2`
- Pros: Sortable, meaningful
- Cons: Long, less user-friendly

### 2. Hash-based Versions
- Format: First 6 chars of version_id
- Pros: Unique, no counter needed
- Cons: Not human-friendly, not sortable

### 3. Hybrid Approach
- Format: `v1-patch`, `v2-minor`, `v3-major`
- Pros: Some semantic meaning
- Cons: Still depends on AI classification

## Recommendation

**Implement the dual versioning system** with simple incrementing display versions for users and keep semantic versioning for internal use. This provides the best balance of:
- User experience (immediate feedback)
- System reliability (no AI dependency)
- Future flexibility (semantic data preserved)
- Implementation simplicity (just a counter)

## Next Steps

1. Review and approve this plan
2. Create database migration script
3. Implement display version assignment
4. Update API responses
5. Coordinate with frontend team for integration