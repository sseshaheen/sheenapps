# Project Versioning System Reference

**Last Updated**: August 2, 2025  
**Status**: Current Implementation  
**Target Audience**: Development Team

## Overview

The SheenApps project versioning system provides intelligent, Claude-powered version management with semantic versioning, automated classification, and rollback capabilities. This document describes the **current implementation** and how developers can interact with the versioning system.

## Architecture Summary

### Database Schema

The versioning system uses a dual-table approach:

#### 1. **`project_versions`** (Core Build Data)
Stores the actual build artifacts and deployment information:

```sql
CREATE TABLE public.project_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    project_id text NOT NULL,
    version_id text NOT NULL UNIQUE,
    prompt text NOT NULL,
    parent_version_id text,
    preview_url text,                -- 🔗 Live preview URL 
    artifact_url text,               -- R2 download URL
    framework text,
    status text CHECK (status IN ('building', 'deployed', 'failed')),
    created_at timestamp DEFAULT now(),
    -- Build performance metrics
    build_duration_ms integer,
    install_duration_ms integer,
    deploy_duration_ms integer,
    output_size_bytes integer,
    -- AI session tracking
    ai_session_id text,
    ai_session_created_at timestamp,
    ai_session_last_used_at timestamp,
    -- Artifact integrity
    artifact_size bigint,
    artifact_checksum varchar(64)    -- SHA256 hash
);
```

#### 2. **`project_versions_metadata`** (Smart Versioning)
Stores semantic versioning and Claude classification data:

```sql
CREATE TABLE public.project_versions_metadata (
    version_id char(26) PRIMARY KEY,        -- ULID from project_versions
    project_id varchar(255) NOT NULL,
    user_id varchar(255) NOT NULL,
    -- Semantic versioning
    major_version integer DEFAULT 1,
    minor_version integer DEFAULT 0,
    patch_version integer DEFAULT 0,
    prerelease varchar(50),                 -- 'rc1', 'beta2', etc.
    -- Human-readable metadata
    version_name varchar(100),              -- "Added Product Search"
    version_description text,               -- Detailed description
    change_type varchar(10) NOT NULL,       -- 'patch'|'minor'|'major'|'rollback'
    breaking_risk varchar(10),              -- 'none'|'low'|'medium'|'high'
    -- Claude classification
    auto_classified boolean DEFAULT true,
    classification_confidence numeric(3,2), -- 0.00 to 1.00
    classification_reasoning text,
    -- Relationships
    parent_version_id char(26),
    from_recommendation_id integer,
    -- Git integration
    git_commit_sha varchar(40),
    git_tag varchar(50),                    -- 'v2.1.7'
    -- Statistics
    files_changed integer DEFAULT 0,
    lines_added integer DEFAULT 0,
    lines_removed integer DEFAULT 0,
    build_duration_ms integer,
    -- Timestamps
    created_at timestamp DEFAULT now(),
    deployed_at timestamp
);
```

### Key Relationships

- `project_versions.version_id` ↔ `project_versions_metadata.version_id` (1:1)
- `projects.current_version_id` → `project_versions.version_id` (FK)
- Each version has a `preview_url` for instant viewing
- Each version creates git tags: `v1.2.3` and `checkpoint/{version_id}`

## Version Classification System

### Automatic Classification

Claude analyzes each build and assigns:

1. **Version Bump Type**:
   - `patch`: Bug fixes, style updates, minor tweaks
   - `minor`: New features, enhancements (non-breaking)
   - `major`: Breaking changes, API changes, major refactors

2. **Breaking Risk Assessment**:
   - `none`: Safe changes
   - `low`: Configuration changes
   - `medium`: Dependency updates
   - `high`: API/schema changes

3. **Human-Readable Names**: "Added Product Search", "Fixed Login Bug"

### Classification Logic

```typescript
const classificationPrompt = `
Based on the changes you made:
1. What type of version bump is appropriate? (patch/minor/major)
2. Provide a concise name (2-4 words) for this version
3. Write a brief description (1 sentence) of the changes
4. Assess the breaking change risk (none/low/medium/high)
5. Rate your confidence in this classification (0-1)

Consider:
- patch: Bug fixes, minor tweaks, style updates
- minor: New features, enhancements, non-breaking improvements  
- major: Breaking changes, major refactors, API changes
- If lockfile changed but package.json didn't: at least "medium" breaking risk
`;
```

## API Endpoints

### 1. Version History

**GET** `/projects/:projectId/versions`

```typescript
// Query parameters
interface VersionHistoryQuery {
  includePatches?: 'true' | 'false';  // Default: 'false'
  limit?: string;                     // Default: '20'
  offset?: string;                    // Default: '0'
}

// Response
interface VersionHistoryResponse {
  success: boolean;
  versions: Array<{
    id: string;              // version_id
    semver: string;          // "2.1.7" or "2.1.7-rc1"
    name: string;            // "Added Product Search"
    description: string;     // "Implemented search with filters..."
    type: string;            // "patch" | "minor" | "major"
    createdAt: string;       // ISO timestamp
    deployedAt: string | null;
    stats: {
      filesChanged: number;
      linesAdded: number;
      linesRemoved: number;
    };
    fromRecommendation: boolean;
    breakingRisk: string;    // "none" | "low" | "medium" | "high"
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

**Example Usage:**
```bash
curl "https://api.sheenapps.com/projects/my-project-id/versions?includePatches=true&limit=10"
```

### 2. Rollback to Version

**POST** `/projects/:projectId/versions/:versionId/rollback`

```typescript
// Request body
interface RollbackRequest {
  userId: string;
}

// Response
interface RollbackResponse {
  success: boolean;
  jobId: string;           // Track rollback progress
  message: string;         // "Rolling back to v2.1.0 - Added Login"
  targetVersion: {
    id: string;
    semver: string;
    name: string;
  };
}
```

**Example Usage:**
```bash
curl -X POST "https://api.sheenapps.com/projects/my-project-id/versions/01K1ABCD.../rollback" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123"}'
```

### 3. Create Milestone

**POST** `/projects/:projectId/versions/milestone`

Forces a major version bump with custom naming:

```typescript
// Request body
interface MilestoneRequest {
  userId: string;
  name: string;              // "V1 Launch"
  description: string;       // "First production release"
  currentVersionId: string;
}

// Response
interface MilestoneResponse {
  success: boolean;
  milestone: {
    id: string;              // new version_id
    semver: string;          // "3.0.0" (major bump)
    name: string;            // "V1 Launch"
    description: string;
  };
}
```

### 4. Legacy Version Operations

**GET** `/versions/:userId/:projectId` - List all versions (legacy format)  
**GET** `/versions/:versionId` - Get version details  
**POST** `/v1/versions/rollback` - Legacy rollback (with signature auth)  
**GET** `/versions/:id1/diff/:id2` - Git diff between versions  
**GET** `/v1/versions/:versionId/download` - Download version artifact

## User-Facing Operations

### 1. View Version Preview

Every version has a `preview_url` that provides instant access to the deployed version:

```typescript
// From version history API response
const version = {
  id: "01K1ABCDEFGHIJK",
  semver: "2.1.7",
  name: "Added Product Search",
  // ... other fields
};

// Access preview
const previewUrl = `https://abc123.sheenapps-preview.pages.dev`;
// This URL is stored in project_versions.preview_url
```

**Preview URL Structure:**
- Hosted on Cloudflare Pages
- Format: `https://{deployment-id}.sheenapps-preview.pages.dev`
- Always live and accessible
- No authentication required for previews

### 2. Revert to Any Version

**Web Interface Flow:**
1. User browses version history
2. Clicks "Restore" on desired version
3. System confirms rollback details
4. Creates rollback job in background
5. New version created with rollback content

**Rollback Process:**
1. Downloads original artifact from R2 storage
2. Verifies artifact integrity (SHA256 checksum)
3. Deploys to new Cloudflare Pages deployment
4. Creates new version record (with incremented semver)
5. Updates project's current version pointer

**Rollback Safety:**
- Integrity checks prevent corrupted rollbacks
- Creates new version (preserves history)
- Non-destructive operation
- Can rollback to any previous version

### 3. Compare Versions

**Git Diff API:**
```bash
GET /versions/{version1_id}/diff/{version2_id}?mode=patch
GET /versions/{version1_id}/diff/{version2_id}?mode=stats
```

**Modes:**
- `patch`: Full git patch output
- `stats`: File change statistics only
- `visual`: Not yet implemented (planned for UI)

### 4. Download Version Artifacts

**Download Latest:**
```bash
GET /v1/projects/{projectId}/export?userId={userId}
```

**Download Specific Version:**
```bash
GET /v1/versions/{versionId}/download?userId={userId}
```

**Response:**
```json
{
  "success": true,
  "downloadUrl": "https://r2-signed-url...",
  "expiresAt": "2025-08-03T23:59:59Z",
  "filename": "my-project-v2.1.7.zip",
  "size": 1024000,
  "version": {
    "id": "01K1ABCDEFG",
    "prompt": "Added search functionality",
    "createdAt": "2025-08-02T10:30:00Z"
  }
}
```

## Version Lifecycle

### 1. Build Creation
```
User Request → Stream Worker → Build Process → Deploy Worker → Version Created
                    ↓
            Classification (Claude) → Metadata Saved → Git Tags Created
```

### 2. Classification Process
1. **Trigger**: After successful deployment
2. **Analysis**: Claude reviews changes made during build
3. **Output**: Semver bump + human names + risk assessment
4. **Fallback**: If Claude fails, defaults to "patch" with safe settings
5. **Storage**: Metadata saved to `project_versions_metadata`

### 3. Git Integration
- **Semantic Tags**: `v1.2.3` for releases
- **Checkpoint Tags**: `checkpoint/{version_id}` for rollbacks
- **Force Updates**: Tags can be recreated on retries
- **Cleanup**: Old checkpoint tags cleaned up automatically

## Development Integration

### Service Layer

**VersionService Class** (`src/services/versionService.ts`):
```typescript
const versionService = new VersionService(projectPath);

// Create new version
await versionService.createVersion({
  projectId,
  userId,
  changeType: 'minor',
  versionName: 'Added Dashboard',
  versionDescription: 'New analytics dashboard',
  commitSha: 'abc123',
  stats: { filesChanged: 5, linesAdded: 120, linesRemoved: 30 }
});

// Get version history
const history = await versionService.getVersionHistory(projectId, {
  limit: 20,
  minorAndMajorOnly: true
});

// Rollback
const rollback = await versionService.rollbackToVersion(
  projectId, 
  targetVersionId,
  userId
);
```

### Database Helpers

**Database Wrapper** (`src/services/databaseWrapper.ts`):
```typescript
// Version metadata operations
const version = await getProjectVersionMetadata(versionId);
const latest = await getLatestVersionMetadata(projectId);
const history = await getProjectVersionHistory(projectId, options);

// Conflict resolution
const existing = await getVersionBySemver(projectId, 2, 1, 7);
```

### Event Integration

**Build Events** (`src/services/eventService.ts`):
```typescript
// Emit version classification event
await emitBuildEvent(buildId, 'version_bump', {
  changeType: 'minor',
  autoClassified: true,
  confidence: 0.95,
  breakingRisk: 'none'
});

// Emit version creation event
await emitBuildEvent(buildId, 'version_created', {
  versionId: 'v2.1.7',
  semver: '2.1.7',
  name: 'Added Search',
  type: 'minor'
});
```

## Configuration

### Environment Variables

```bash
# Required for signature verification (legacy endpoints)
SHARED_SECRET=your-hmac-secret

# R2 storage for artifacts
R2_ACCOUNT_ID=your-cloudflare-account
R2_ACCESS_KEY_ID=your-r2-key
R2_SECRET_ACCESS_KEY=your-r2-secret

# Cloudflare Pages deployment
CLOUDFLARE_API_TOKEN=your-cf-token
CLOUDFLARE_ACCOUNT_ID=your-cf-account
```

### Database Indexes

Performance-critical indexes:
```sql
-- Version history queries
CREATE INDEX idx_project_history 
  ON project_versions_metadata(project_id, created_at DESC);

-- Semver lookups
CREATE INDEX idx_version_semver 
  ON project_versions_metadata(project_id, major_version, minor_version, patch_version);

-- Git tag lookups
CREATE INDEX idx_git_tag 
  ON project_versions_metadata(git_tag);

-- Project versions
CREATE INDEX idx_project_versions_user_project_created 
  ON project_versions(user_id, project_id, created_at DESC);
```

## Performance Characteristics

### Version History
- **Typical Response**: < 200ms for 20 versions
- **Pagination**: Efficient with proper indexing
- **Memory Usage**: ~1KB per version record

### Rollback Operations
- **Fast Rollback**: < 10 seconds (cached artifacts)
- **Standard Rollback**: 30-60 seconds (R2 download + deploy)
- **Large Projects**: Up to 2GB supported

### Classification
- **Claude Success**: ~5-15 seconds
- **Claude Timeout**: 45 second limit with fast fallback
- **Fallback**: Instant default classification

## Troubleshooting

### Common Issues

1. **Missing Preview URLs**
   - Check deployment worker logs
   - Verify Cloudflare Pages integration
   - Ensure `preview_url` is set in database

2. **Classification Failures**
   - Check Claude session timeouts
   - Verify fallback classification applied
   - Look for `version_bump` events in logs

3. **Rollback Errors**
   - Verify artifact exists in R2 storage
   - Check artifact integrity (SHA256)
   - Ensure sufficient R2 permissions

4. **Version Conflicts**
   - System auto-resolves with patch increments
   - Uses prerelease versions for high patch numbers
   - Check git tag creation logs

### Monitoring

**Key Metrics:**
- Classification success rate (target: >90%)
- Rollback success rate (target: >99%)
- Average version history response time
- Artifact download success rate

**Log Patterns:**
```bash
# Version creation
"[Version Service] Created/updated git tag: v2.1.7"

# Classification success
"[Version Classification] Claude classification completed"

# Rollback process
"Rolling back to version 01K1ABC... Found artifact at: artifacts/..."
```

## Migration Notes

This implementation evolved from the original `smart-versioning-implementation-plan.md`. Key differences:

### What Changed:
- **Dual-table approach**: Split core builds from metadata
- **Preview URLs**: Direct Cloudflare Pages integration
- **Event-driven**: Classification happens asynchronously
- **Legacy compatibility**: Maintains older API endpoints

### What Stayed:
- **Semantic versioning**: Major.Minor.Patch with prerelease
- **Claude classification**: AI-powered version analysis
- **Git integration**: Tags and commit tracking
- **Rollback safety**: Integrity checks and non-destructive

### Database Evolution:
The system maintains backward compatibility while adding new versioning features. Both table schemas coexist and are linked by `version_id`.

---

## Quick Reference

### View Any Version
```
https://{deployment-id}.sheenapps-preview.pages.dev
```

### Get Version History
```bash
GET /projects/:projectId/versions?limit=20&includePatches=false
```

### Rollback to Version
```bash
POST /projects/:projectId/versions/:versionId/rollback
Body: {"userId": "user-id"}
```

### Download Version
```bash
GET /v1/versions/:versionId/download?userId=user-id
```

### Create Milestone
```bash
POST /projects/:projectId/versions/milestone
Body: {
  "userId": "user-id",
  "name": "V1 Launch", 
  "description": "First production release",
  "currentVersionId": "version-id"
}
```

This reference covers the complete current implementation. For questions or issues, check the troubleshooting section or review the source code in the mentioned service files.