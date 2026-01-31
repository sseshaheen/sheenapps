# Smart Versioning Implementation Plan

**Created**: July 24, 2025
**Status**: Ready for Implementation
**Estimated Time**: 2-3 hours
**Priority**: High - Essential for user experience and project management

## Executive Summary

Smart versioning provides an intelligent, layered approach to version management that works for both technical and non-technical users. It leverages Claude's understanding to automatically classify changes, supports instant rollback, and encourages iterative development through fast feedback loops.

## Current Architecture Context

### Recent Developments
1. **Stream-based Claude Integration**: Direct Claude CLI usage without separate plan/task workers
2. **Compound BuildIds**: Format like `01K0YWPJN8BERCA00DJ2BN2GSP-recommendations` (requires VARCHAR(64))
3. **Version-aware Recommendations**: Each version has its own set of AI-generated recommendations
4. **Metadata Generation**: Automatic documentation and recommendations after builds
5. **Update Optimization**: 30-45 second updates for small changes (skipping npm install when possible)

### Existing Infrastructure
- **Database**: PostgreSQL with project versions table
- **Git Integration**: Full commit history and tagging support
- **Build System**: Stream worker with checkpoint/recovery capabilities
- **API**: RESTful endpoints with HMAC authentication

## Versioning Architecture

### Four-Layer Version System

| Layer | Visibility | Creation Trigger | Example | Purpose |
|-------|-----------|-----------------|---------|---------|
| **Checkpoint** | System only | Every build | `01K1A4DP...` | Instant rollback, complete history |
| **Patch** | Power users | Small changes, auto-promoted | `v2.1.7` | Groups minor tweaks |
| **Minor** | Everyone | Features, recommendations | `v2.2.0` | Feature additions |
| **Major** | Everyone | User milestones, breaking changes | `v3.0.0` | Major releases |

### Version Identification Strategy

```typescript
interface VersionIdentifiers {
  // Primary identifier (always created)
  checkpointId: string;      // ULID: "01K0YWPJN8BERCA00DJ2BN2GSP"

  // Semantic version (created after classification)
  semver?: {
    major: number;           // 2
    minor: number;           // 1
    patch: number;           // 7
    prerelease?: string;     // "beta.1"
  };

  // Human-readable metadata
  name?: string;             // "Added Product Search"
  description?: string;      // "Implemented search with filters and sorting"

  // Classification metadata
  changeType: 'patch' | 'minor' | 'major';
  confidence: number;        // 0-1 score from Claude
  autoClassified: boolean;   // true if Claude classified, false if user overrode
}
```

## Implementation Plan

### Phase 1: Database Schema (30 minutes) ✅ COMPLETED

**Status**: Migration created at `migrations/004_add_versioning_system.sql`
- Includes backfill for existing versions
- Added proper indexes for performance
- Uses CHAR(26) for ULID storage
- Includes comprehensive comments

#### Create Versions Table
```sql
CREATE TABLE project_versions_metadata (
  -- Identifiers
  version_id CHAR(26) PRIMARY KEY,        -- ULID checkpoint (exactly 26 chars)
  project_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,

  -- Semantic versioning
  major_version INT NOT NULL DEFAULT 1,
  minor_version INT NOT NULL DEFAULT 0,
  patch_version INT NOT NULL DEFAULT 0,
  prerelease VARCHAR(50),                 -- For -rc1, -beta2, etc.

  -- Metadata
  version_name VARCHAR(100),              -- "Added Product Search"
  version_description TEXT,               -- Longer description
  change_type VARCHAR(10) NOT NULL,       -- patch/minor/major/rollback
  breaking_risk VARCHAR(10),              -- none/low/medium/high

  -- Classification
  auto_classified BOOLEAN DEFAULT true,
  classification_confidence DECIMAL(3,2), -- 0.00 to 1.00
  classification_reasoning TEXT,          -- Claude's explanation

  -- Relationships
  parent_version_id CHAR(26),
  base_version_id CHAR(26),               -- For updates/branches
  from_recommendation_id INT,             -- If created from recommendation

  -- Statistics
  files_changed INT DEFAULT 0,
  lines_added INT DEFAULT 0,
  lines_removed INT DEFAULT 0,
  build_duration_ms INT,
  total_files INT,

  -- Git metadata
  git_commit_sha VARCHAR(40),
  git_tag VARCHAR(50),                    -- "v2.1.7"

  -- Schema versioning
  schema_version INT DEFAULT 1,           -- For future migrations

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deployed_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (parent_version_id) REFERENCES project_versions_metadata(version_id)
);

-- Create indexes separately (PostgreSQL best practice)
CREATE INDEX idx_project_history ON project_versions_metadata(project_id, created_at DESC);
CREATE INDEX idx_version_semver ON project_versions_metadata(project_id, major_version, minor_version, patch_version);
CREATE INDEX idx_version_type ON project_versions_metadata(change_type);
CREATE INDEX idx_git_tag ON project_versions_metadata(git_tag);

-- Add version tracking to existing project_versions table
ALTER TABLE project_versions
  ADD COLUMN version_metadata_id CHAR(26),
  ADD FOREIGN KEY (version_metadata_id) REFERENCES project_versions_metadata(version_id);
```

### Phase 2: Claude Classification Integration (45 minutes) ✅ COMPLETED

**Status**: Version classification implemented in stream worker
- Created `VersionService` class with git integration
- Added `classifyVersion` function with Claude fallback
- Integrated deployment event listener
- Version metadata created after each deployment

#### 1. Add Classification to Stream Worker

```typescript
// In streamWorker.ts, after successful build
async function classifyVersion(
  buildId: string,
  projectPath: string,
  previousVersion?: VersionMetadata
): Promise<VersionClassification> {
  // Construct classification prompt
  const classificationPrompt = `You just completed a build for a project. Analyze the changes and classify the version.

${previousVersion ? `Previous version: v${previousVersion.major}.${previousVersion.minor}.${previousVersion.patch} - ${previousVersion.name}` : 'This is the first version.'}

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

Output as JSON with schemaVersion:
{
  "schemaVersion": 1,
  "versionBump": "minor",
  "versionName": "Added Product Search",
  "versionDescription": "Implemented product search with filters and sorting options",
  "breakingRisk": "none",
  "confidence": 0.95,
  "reasoning": "New feature added without breaking existing functionality"
}`;

  try {
    // Use existing Claude session if available, or create new one
    const session = new ClaudeSession();
    const result = await session.run(
      classificationPrompt,
      projectPath,
      `${buildId}-classify`,
      45000 // 45 second timeout with circuit breaker
    );

    if (result.success && result.response) {
      const classification = JSON.parse(result.response);

      // Emit metrics event
      await emitBuildEvent(buildId, 'version_bump', {
        changeType: classification.versionBump,
        autoClassified: true,
        override: false,
        confidence: classification.confidence,
        breakingRisk: classification.breakingRisk
      });

      return classification;
    }
  } catch (error) {
    console.error('[Version Classification] Failed:', error);

    // Circuit breaker: if Claude is slow, fallback immediately
    if (error.message?.includes('timeout')) {
      console.warn('[Version Classification] Claude timeout, using fallback');
    }
  }

  // Fallback to simple rules-based classification
  const fallback = {
    schemaVersion: 1,
    versionBump: 'patch',
    versionName: 'Update',
    versionDescription: 'Project updated',
    breakingRisk: 'none',
    confidence: 0.5,
    reasoning: 'Automatic classification failed, using safe default'
  };

  // Emit fallback metrics
  await emitBuildEvent(buildId, 'version_bump', {
    changeType: fallback.versionBump,
    autoClassified: false,
    override: true,
    confidence: fallback.confidence,
    breakingRisk: fallback.breakingRisk
  });

  return fallback;
}
```

#### 2. Integrate with Recommendations

```typescript
// When processing recommendations
const recommendationWithVersionHint = {
  id: 1,
  title: "Add Product Search",
  description: "Users need to find products quickly",
  prompt: "Add search functionality with filters",
  complexity: "medium",
  impact: "high",
  category: "feature",
  versionHint: "minor"  // This drives version bump
};

// In stream worker, check if build came from recommendation
if (jobData.fromRecommendationId) {
  const recommendation = await getRecommendation(jobData.fromRecommendationId);
  classificationOverride = {
    versionBump: recommendation.versionHint,
    versionName: recommendation.title,
    fromRecommendation: true
  };
}
```

### Phase 3: Version Management Service (45 minutes) ✅ COMPLETED

**Status**: Full version service implementation
- `VersionService` class in `src/services/versionService.ts`
- Git tag creation with force update for retries
- Semver calculation with conflict resolution
- Build statistics collection from git
- Database wrapper functions added

#### Create Version Service

```typescript
// src/services/versionService.ts
import { ulid } from 'ulid';
import { simpleGit } from 'simple-git';

export class VersionService {
  private git = simpleGit();

  async createVersion(params: CreateVersionParams): Promise<VersionMetadata> {
    const versionId = params.versionId || ulid();

    // Get previous version for semver calculation
    const previousVersion = await this.getLatestVersion(params.projectId);

    // Calculate new semver
    const newSemver = this.calculateNextVersion(
      previousVersion,
      params.changeType
    );

    // Create git tag
    const gitTag = `v${newSemver.major}.${newSemver.minor}.${newSemver.patch}`;
    await this.createGitTag(gitTag, params.commitSha);

    // Also create checkpoint tag
    await this.createGitTag(`checkpoint/${versionId}`, params.commitSha);

    // Save to database
    const version = await saveVersionMetadata({
      version_id: versionId,
      project_id: params.projectId,
      user_id: params.userId,
      major_version: newSemver.major,
      minor_version: newSemver.minor,
      patch_version: newSemver.patch,
      version_name: params.versionName,
      version_description: params.versionDescription,
      change_type: params.changeType,
      breaking_risk: params.breakingRisk,
      auto_classified: params.autoClassified,
      classification_confidence: params.confidence,
      classification_reasoning: params.reasoning,
      parent_version_id: previousVersion?.version_id,
      from_recommendation_id: params.fromRecommendationId,
      files_changed: params.stats.filesChanged,
      lines_added: params.stats.linesAdded,
      lines_removed: params.stats.linesRemoved,
      build_duration_ms: params.stats.buildDuration,
      git_commit_sha: params.commitSha,
      git_tag: gitTag
    });

    // Update project_versions table
    await linkVersionMetadata(params.versionId, version.version_id);

    return version;
  }

  private calculateNextVersion(
    previous: VersionMetadata | null,
    changeType: 'patch' | 'minor' | 'major'
  ): SemVer {
    if (!previous) {
      return { major: 1, minor: 0, patch: 0 };
    }

    switch (changeType) {
      case 'major':
        return {
          major: previous.major_version + 1,
          minor: 0,
          patch: 0
        };
      case 'minor':
        return {
          major: previous.major_version,
          minor: previous.minor_version + 1,
          patch: 0
        };
      case 'patch':
        return {
          major: previous.major_version,
          minor: previous.minor_version,
          patch: previous.patch_version + 1
        };
    }
  }

  async createGitTag(tag: string, commitSha: string): Promise<void> {
    try {
      // Force update tag to handle retries cleanly
      await this.git.tag(['-f', tag, commitSha]);
      console.log(`[Version Service] Created/updated git tag: ${tag}`);
    } catch (error) {
      console.error(`[Version Service] Tag creation failed for ${tag}:`, error);
      throw error; // Re-throw to handle upstream
    }
  }

  async getVersionHistory(
    projectId: string,
    options: VersionHistoryOptions = {}
  ): Promise<VersionHistory> {
    const {
      includeCheckpoints = false,
      limit = 50,
      offset = 0,
      minorAndMajorOnly = true
    } = options;

    const query = `
      SELECT * FROM project_versions_metadata
      WHERE project_id = $1
      ${minorAndMajorOnly ? "AND change_type IN ('minor', 'major')" : ''}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const versions = await db.query(query, [projectId, limit, offset]);

    return {
      versions: versions.rows,
      total: versions.rowCount,
      hasMore: versions.rowCount === limit
    };
  }

  async rollbackToVersion(
    projectId: string,
    targetVersionId: string
  ): Promise<RollbackResult> {
    // Get target version details
    const targetVersion = await this.getVersion(targetVersionId);

    // Create rollback job
    const rollbackJob = await streamQueue.add('rollback-build', {
      projectId,
      targetVersionId,
      targetCommitSha: targetVersion.git_commit_sha,
      targetGitTag: targetVersion.git_tag,
      rollbackReason: 'user_requested'
    });

    return {
      jobId: rollbackJob.id,
      targetVersion,
      message: `Rolling back to ${targetVersion.git_tag} - ${targetVersion.version_name}`
    };
  }
}
```

### Phase 4: API Endpoints (30 minutes) ✅ COMPLETED

**Status**: All API endpoints implemented
- Created `src/routes/versionHistory.ts`
- GET /projects/:projectId/versions - Version history with pagination
- POST /projects/:projectId/versions/:versionId/rollback - Rollback to version
- POST /projects/:projectId/versions/milestone - Create milestone
- Integrated with main server routes

#### 1. Version History Endpoint

```typescript
// GET /projects/:projectId/versions
app.get('/projects/:projectId/versions', async (request, reply) => {
  const { projectId } = request.params;
  const {
    includePatches = false,
    limit = 20,
    offset = 0
  } = request.query;

  const versionService = new VersionService();
  const history = await versionService.getVersionHistory(projectId, {
    minorAndMajorOnly: !includePatches,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  // Format for UI
  const formattedVersions = history.versions.map(v => ({
    id: v.version_id,
    semver: `${v.major_version}.${v.minor_version}.${v.patch_version}`,
    name: v.version_name,
    description: v.version_description,
    type: v.change_type,
    createdAt: v.created_at,
    deployedAt: v.deployed_at,
    stats: {
      filesChanged: v.files_changed,
      linesAdded: v.lines_added,
      linesRemoved: v.lines_removed
    },
    fromRecommendation: !!v.from_recommendation_id,
    breakingRisk: v.breaking_risk
  }));

  return reply.send({
    success: true,
    versions: formattedVersions,
    pagination: {
      total: history.total,
      limit,
      offset,
      hasMore: history.hasMore
    }
  });
});
```

#### 2. Rollback Endpoint

```typescript
// POST /projects/:projectId/versions/:versionId/rollback
app.post('/projects/:projectId/versions/:versionId/rollback', async (request, reply) => {
  const { projectId, versionId } = request.params;
  const { userId } = request.body;

  // Verify ownership
  const project = await getProject(userId, projectId);
  if (!project) {
    return reply.code(404).send({ error: 'Project not found' });
  }

  const versionService = new VersionService();
  const result = await versionService.rollbackToVersion(projectId, versionId);

  return reply.send({
    success: true,
    jobId: result.jobId,
    message: result.message,
    targetVersion: {
      id: result.targetVersion.version_id,
      semver: `${result.targetVersion.major_version}.${result.targetVersion.minor_version}.${result.targetVersion.patch_version}`,
      name: result.targetVersion.version_name
    }
  });
});
```

#### 3. Create Milestone Endpoint

```typescript
// POST /projects/:projectId/versions/milestone
app.post('/projects/:projectId/versions/milestone', async (request, reply) => {
  const { projectId } = request.params;
  const {
    userId,
    name,
    description,
    currentVersionId
  } = request.body;

  const versionService = new VersionService();

  // Force a major version bump
  const milestone = await versionService.createVersion({
    projectId,
    userId,
    versionId: currentVersionId,
    changeType: 'major',
    versionName: name,
    versionDescription: description,
    autoClassified: false,  // User-initiated
    confidence: 1.0,
    reasoning: 'User marked as milestone'
  });

  return reply.send({
    success: true,
    milestone: {
      id: milestone.version_id,
      semver: `${milestone.major_version}.0.0`,
      name: milestone.version_name,
      description: milestone.version_description
    }
  });
});
```

### Phase 5: Integration with Existing Systems (30 minutes) ✅ COMPLETED

**Status**: Fully integrated with build pipeline
- Deployment event listener triggers version classification
- Version metadata created after each successful deployment
- Git statistics collected automatically
- Event-driven architecture ensures loose coupling

#### 1. Update Stream Worker

```typescript
// In streamWorker.ts, after successful build and deployment
async function handleVersioning(job: Job<StreamJobData>, result: BuildResult) {
  const { buildId, userId, projectId, versionId, fromRecommendationId } = job.data;

  // Get classification from Claude
  const classification = await classifyVersion(
    buildId,
    result.projectPath,
    await getLatestVersion(projectId)
  );

  // Override if from recommendation
  if (fromRecommendationId) {
    const recommendation = await getRecommendation(fromRecommendationId);
    classification.versionBump = recommendation.versionHint || classification.versionBump;
    classification.versionName = recommendation.title;
  }

  // Create version record
  const versionService = new VersionService();
  const version = await versionService.createVersion({
    versionId,
    projectId,
    userId,
    changeType: classification.versionBump,
    versionName: classification.versionName,
    versionDescription: classification.versionDescription,
    breakingRisk: classification.breakingRisk,
    autoClassified: !fromRecommendationId,
    confidence: classification.confidence,
    reasoning: classification.reasoning,
    fromRecommendationId,
    commitSha: result.commitSha,
    stats: {
      filesChanged: result.filesChanged || 0,
      linesAdded: result.linesAdded || 0,
      linesRemoved: result.linesRemoved || 0,
      buildDuration: result.duration
    }
  });

  // Emit version created event
  await emitBuildEvent(buildId, 'version_created', {
    versionId: version.version_id,
    semver: `${version.major_version}.${version.minor_version}.${version.patch_version}`,
    name: version.version_name,
    type: version.change_type
  });
}
```

#### 2. Update Deploy Worker

```typescript
// In deployWorker.ts, collect git statistics
async function collectBuildStats(projectPath: string): Promise<BuildStats> {
  const git = simpleGit(projectPath);

  try {
    // Get latest commit
    const log = await git.log(['-1']);
    const latest = log.latest;

    // Get diff stats
    const diffSummary = await git.diffSummary([`${latest.hash}~1`, latest.hash]);

    return {
      commitSha: latest.hash,
      filesChanged: diffSummary.files.length,
      linesAdded: diffSummary.insertions,
      linesRemoved: diffSummary.deletions,
      totalFiles: await countProjectFiles(projectPath)
    };
  } catch (error) {
    console.error('[Deploy Worker] Failed to collect git stats:', error);
    return {
      commitSha: 'unknown',
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      totalFiles: 0
    };
  }
}
```

## Safety Measures

### 1. Breaking Change Detection

```typescript
const breakingChangePatterns = [
  // Package changes
  { pattern: /package\.json/, risk: 'medium' },
  { pattern: /package-lock\.json|yarn\.lock|pnpm-lock\.yaml/, risk: 'high' },

  // API changes
  { pattern: /api\/.*\.(ts|js)/, risk: 'high' },
  { pattern: /schema\.(graphql|sql)/, risk: 'high' },

  // Config changes
  { pattern: /tsconfig\.json|webpack\.config/, risk: 'medium' },
  { pattern: /\.env\.example/, risk: 'low' },

  // Major file restructuring
  { threshold: 0.3, metric: 'filesMovedRatio', risk: 'high' }
];

function detectBreakingChanges(changes: FileChanges): BreakingRisk {
  let maxRisk = 'none';

  for (const change of changes.files) {
    for (const pattern of breakingChangePatterns) {
      if (pattern.pattern && pattern.pattern.test(change.path)) {
        maxRisk = compareRisk(maxRisk, pattern.risk);
      }
    }
  }

  // Check file movement ratio
  const moveRatio = changes.movedFiles / changes.totalFiles;
  if (moveRatio > 0.3) {
    maxRisk = 'high';
  }

  return maxRisk;
}
```

### 2. Version Conflict Resolution

```typescript
async function resolveVersionConflict(
  projectId: string,
  proposedVersion: SemVer & { prerelease?: string }
): Promise<SemVer & { prerelease?: string }> {
  // Check if version already exists
  const existing = await getVersionBySemver(projectId, proposedVersion);

  if (existing) {
    // If patch is getting too high, use prerelease
    if (proposedVersion.patch > 99) {
      // Reset to base version with prerelease
      const baseVersion = {
        major: proposedVersion.major,
        minor: proposedVersion.minor,
        patch: 0,
        prerelease: 'rc1'
      };

      // Find next available prerelease
      let releaseNum = 1;
      while (await getVersionBySemver(projectId, {
        ...baseVersion,
        prerelease: `rc${releaseNum}`
      })) {
        releaseNum++;
      }

      return {
        ...baseVersion,
        prerelease: `rc${releaseNum}`
      };
    }

    // Normal patch increment
    let patch = proposedVersion.patch;
    while (await getVersionBySemver(projectId, {
      ...proposedVersion,
      patch: ++patch
    })) {
      // Keep incrementing
    }

    return {
      ...proposedVersion,
      patch
    };
  }

  return proposedVersion;
}
```

## UI/UX Considerations

### Version Display

```tsx
// React component for version display to be used in the main app (not this worker app)
function VersionBadge({ version }) {
  const getVersionColor = (type) => {
    switch(type) {
      case 'major': return 'red';
      case 'minor': return 'blue';
      case 'patch': return 'gray';
      default: return 'gray';
    }
  };

  const getBreakingRiskIcon = (risk) => {
    switch(risk) {
      case 'high': return '⚠️';
      case 'medium': return '⚡';
      case 'low': return '📌';
      default: return '';
    }
  };

  return (
    <Badge color={getVersionColor(version.type)}>
      v{version.semver}
      {version.name && ` - ${version.name}`}
      {version.breakingRisk !== 'none' &&
        <span>{getBreakingRiskIcon(version.breakingRisk)}</span>
      }
    </Badge>
  );
}
```

### Version Timeline

```tsx
function VersionTimeline({ versions }) {
  return (
    <Timeline>
      {versions.map((version, index) => (
        <Timeline.Item
          key={version.id}
          color={version.type === 'major' ? 'red' : 'blue'}
        >
          <VersionCard version={version}>
            <Stats>
              <Stat icon="📝" value={version.stats.filesChanged} />
              <Stat icon="➕" value={version.stats.linesAdded} />
              <Stat icon="➖" value={version.stats.linesRemoved} />
            </Stats>
            {version.fromRecommendation &&
              <Badge>From Recommendation</Badge>
            }
            <Actions>
              <Button onClick={() => viewDiff(version)}>
                View Changes
              </Button>
              <Button onClick={() => rollback(version)}>
                Restore
              </Button>
            </Actions>
          </VersionCard>
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
```

## Version Viewing and Rollback Experience

### Quick View Options

#### 1. Instant Preview Modal
```tsx
function VersionPreview({ versionId, projectId }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch preview from CDN cache or generate
    fetchVersionPreview(projectId, versionId).then(setPreview);
  }, [versionId]);

  return (
    <Modal size="xl">
      <iframe
        src={preview?.url || `/api/preview/${projectId}/${versionId}`}
        className="version-preview-iframe"
        onLoad={() => setLoading(false)}
      />
      <Actions>
        <Button variant="primary" onClick={() => rollbackToVersion(versionId)}>
          Restore This Version
        </Button>
        <Button onClick={() => compareWithCurrent(versionId)}>
          Compare with Current
        </Button>
      </Actions>
    </Modal>
  );
}
```

#### 2. Side-by-Side Comparison
```tsx
function VersionComparison({ currentVersion, compareVersion }) {
  return (
    <SplitView>
      <Panel title={`Current (v${currentVersion.semver})`}>
        <iframe src={currentVersion.previewUrl} />
      </Panel>
      <Panel title={`v${compareVersion.semver} - ${compareVersion.name}`}>
        <iframe src={compareVersion.previewUrl} />
      </Panel>
      <DiffPanel>
        <FileDiff
          before={compareVersion.files}
          after={currentVersion.files}
        />
      </DiffPanel>
    </SplitView>
  );
}
```

### Rollback Strategies

#### 1. Instant Rollback (< 5 seconds)
```typescript
// For recent versions still in cache
async function instantRollback(projectId: string, versionId: string) {
  // 1. Check if build artifacts are cached
  const cached = await checkBuildCache(projectId, versionId);

  if (cached) {
    // 2. Simply switch the deployment pointer
    await updateDeployment(projectId, cached.deploymentId);

    // 3. Update database
    await markAsCurrentVersion(projectId, versionId);

    return {
      success: true,
      duration: '3 seconds',
      method: 'cache'
    };
  }

  // Fall back to rebuild
  return await fullRollback(projectId, versionId);
}
```

#### 2. Smart Rollback with Git (10-30 seconds)
```typescript
async function smartGitRollback(projectId: string, versionId: string) {
  const version = await getVersion(versionId);

  // 1. Git checkout to specific tag
  await git.checkout(version.git_tag);

  // 2. Check if dependencies match current
  const depsChanged = await checkDependencyChanges(
    version.git_commit_sha,
    'HEAD'
  );

  if (!depsChanged) {
    // 3. Skip npm install, just build and deploy
    await quickBuild(projectPath);
    return { duration: '10-15 seconds' };
  }

  // 4. Full rebuild needed
  return await fullBuild(projectPath);
}
```

#### 3. Progressive Rollback (User-Friendly)
```typescript
async function progressiveRollback(projectId: string, targetVersionId: string) {
  // 1. Snapshot current database state
  const dbSnapshot = await snapshotProjectData(projectId);

  // 2. Check for database schema changes
  const schemaChanges = await checkSchemaChangesBetweenVersions(
    getCurrentVersion(projectId),
    targetVersionId
  );

  if (schemaChanges.length > 0) {
    // Warn user about potential data incompatibility
    const confirmed = await confirmSchemaRollback(schemaChanges);
    if (!confirmed) return null;
  }

  // 3. Create a new "rollback" version
  const rollbackVersion = await createVersion({
    projectId,
    changeType: 'rollback',
    versionName: `Rollback to ${targetVersion.semver}`,
    fromVersionId: targetVersionId,
    metadata: {
      dbSnapshot: dbSnapshot.id,
      schemaWarnings: schemaChanges
    }
  });

  // 4. Use existing Claude integration to rebuild
  await streamQueue.add('rollback-build', {
    projectId,
    targetVersionId,
    rollbackVersionId: rollbackVersion.versionId,
    // This creates a new version that's identical to the target
    preserveHistory: true,
    dbSnapshot: dbSnapshot.id
  });

  return rollbackVersion;
}

async function snapshotProjectData(projectId: string): Promise<DatabaseSnapshot> {
  // Snapshot project-specific data (settings, config, etc.)
  const snapshot = {
    id: ulid(),
    projectId,
    timestamp: new Date(),
    data: await exportProjectData(projectId),
    schema_version: await getCurrentSchemaVersion()
  };

  await saveSnapshot(snapshot);
  return snapshot;
}
```

### Version Navigation UI

#### 1. Keyboard Shortcuts
```tsx
function VersionNavigator({ versions, currentVersion }) {
  useKeyboardShortcuts({
    'cmd+[': () => navigateToPreviousVersion(),
    'cmd+]': () => navigateToNextVersion(),
    'cmd+shift+r': () => openRollbackModal(),
    'v': () => toggleVersionPanel()
  });

  return (
    <VersionPanel>
      <Search
        placeholder="Search versions by name or date..."
        onSearch={filterVersions}
      />
      <VersionList
        versions={versions}
        renderItem={(version) => (
          <VersionItem
            active={version.id === currentVersion.id}
            onClick={() => previewVersion(version)}
            onDoubleClick={() => rollbackToVersion(version)}
          />
        )}
      />
    </VersionPanel>
  );
}
```

#### 2. Visual Timeline
```tsx
function VersionTimeline({ versions }) {
  return (
    <Timeline orientation="horizontal">
      {versions.map((version, i) => (
        <TimelineNode
          key={version.id}
          size={version.type === 'major' ? 'large' : 'small'}
          color={getVersionColor(version.type)}
          label={version.semver}
          tooltip={
            <VersionTooltip>
              <h4>{version.name}</h4>
              <p>{version.description}</p>
              <Stats compact {...version.stats} />
              <Button size="sm" onClick={() => rollback(version)}>
                Restore
              </Button>
            </VersionTooltip>
          }
        />
      ))}
    </Timeline>
  );
}
```

### Rollback Safety Features

#### 1. Pre-Rollback Validation
```typescript
async function validateRollback(
  projectId: string,
  targetVersionId: string
): Promise<RollbackValidation> {
  const current = await getCurrentVersion(projectId);
  const target = await getVersion(targetVersionId);

  const warnings = [];

  // Check for data migrations
  if (current.major_version > target.major_version) {
    warnings.push({
      level: 'warning',
      message: 'Rolling back across major versions may lose features'
    });
  }

  // Check for dependency downgrades
  const depDowngrades = await checkDependencyDowngrades(
    current.version_id,
    target.version_id
  );

  if (depDowngrades.length > 0) {
    warnings.push({
      level: 'caution',
      message: `${depDowngrades.length} dependencies will be downgraded`,
      details: depDowngrades
    });
  }

  return {
    safe: warnings.filter(w => w.level === 'error').length === 0,
    warnings,
    estimatedDuration: calculateRollbackTime(current, target)
  };
}
```

#### 2. Rollback Confirmation Dialog
```tsx
function RollbackConfirmation({ validation, targetVersion, onConfirm }) {
  return (
    <Modal>
      <h3>Rollback to v{targetVersion.semver}?</h3>

      {validation.warnings.length > 0 && (
        <WarningList warnings={validation.warnings} />
      )}

      <Timeline>
        <CurrentVersion />
        <Arrow direction="down" />
        <TargetVersion version={targetVersion} />
      </Timeline>

      <EstimatedTime duration={validation.estimatedDuration} />

      <Actions>
        <Button variant="danger" onClick={onConfirm}>
          Rollback Now
        </Button>
        <Button variant="ghost">Cancel</Button>
      </Actions>
    </Modal>
  );
}
```

### Performance Optimizations

#### 1. Preview Caching Strategy
```typescript
class VersionPreviewCache {
  // Keep last 10 versions in hot cache
  private hotCache = new LRUCache<string, DeploymentUrl>(10);

  // Keep major versions in CDN
  private cdnStrategy = {
    major: 'permanent',
    minor: '30days',
    patch: '7days'
  };

  async getPreview(versionId: string): Promise<string> {
    // 1. Check hot cache
    if (this.hotCache.has(versionId)) {
      return this.hotCache.get(versionId);
    }

    // 2. Check CDN
    const cdnUrl = await this.checkCDN(versionId);
    if (cdnUrl) return cdnUrl;

    // 3. Generate preview on demand
    return this.generatePreview(versionId);
  }
}
```

#### 2. Incremental Loading
```typescript
// Load versions progressively
async function* loadVersionHistory(projectId: string) {
  // First: Load major/minor versions only
  yield await loadVersions(projectId, { types: ['major', 'minor'] });

  // Second: Load recent patches
  yield await loadVersions(projectId, {
    types: ['patch'],
    limit: 20,
    order: 'desc'
  });

  // Third: Load remaining on scroll
  while (hasMore) {
    yield await loadNextBatch();
  }
}
```

### 3. Index Performance Monitoring
```typescript
// Nightly job to monitor query performance
async function monitorVersionIndexHealth() {
  const criticalQueries = [
    // History query
    {
      name: 'version_history',
      sql: `SELECT * FROM project_versions_metadata
            WHERE project_id = $1
            ORDER BY created_at DESC
            LIMIT 50`,
      expectedPlan: 'Index Scan using idx_project_history'
    },
    // Semver lookup
    {
      name: 'version_by_semver',
      sql: `SELECT * FROM project_versions_metadata
            WHERE project_id = $1
            AND major_version = $2
            AND minor_version = $3
            AND patch_version = $4`,
      expectedPlan: 'Index Scan using idx_version_semver'
    },
    // Type filter
    {
      name: 'versions_by_type',
      sql: `SELECT * FROM project_versions_metadata
            WHERE change_type = $1
            ORDER BY created_at DESC
            LIMIT 100`,
      expectedPlan: 'Index Scan using idx_version_type'
    }
  ];

  for (const query of criticalQueries) {
    const plan = await db.query(`EXPLAIN (ANALYZE, BUFFERS) ${query.sql}`,
      ['test-project', 1, 0, 0]
    );

    const seqScanRatio = calculateSeqScanRatio(plan);
    if (seqScanRatio > 0.05) {
      await alertOps({
        severity: 'warning',
        message: `Query ${query.name} showing ${seqScanRatio * 100}% sequential scans`,
        expectedPlan: query.expectedPlan,
        actualPlan: plan
      });
    }

    // Log metrics
    await logQueryMetrics({
      query: query.name,
      indexHitRate: 1 - seqScanRatio,
      executionTime: plan.execution_time,
      bufferHits: plan.shared_hit_blocks
    });
  }
}

// Schedule nightly
cron.schedule('0 3 * * *', monitorVersionIndexHealth);
```

### 4. Git Tag Cleanup
```typescript
// Periodic cleanup of old checkpoint tags
async function cleanupOldCheckpoints() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7); // 7 days old

  // Find old checkpoints without semver tags
  const oldCheckpoints = await db.query(`
    SELECT version_id, git_tag
    FROM project_versions_metadata
    WHERE created_at < $1
    AND change_type = 'checkpoint'
    AND git_tag NOT LIKE 'v%'
  `, [cutoffDate]);

  const git = simpleGit();

  for (const checkpoint of oldCheckpoints.rows) {
    try {
      // Delete local tag
      await git.tag(['-d', `checkpoint/${checkpoint.version_id}`]);

      // Mark as cleaned in DB
      await db.query(
        'UPDATE project_versions_metadata SET git_tag = NULL WHERE version_id = $1',
        [checkpoint.version_id]
      );
    } catch (error) {
      console.warn(`Failed to clean tag for ${checkpoint.version_id}:`, error);
    }
  }

  // Run git garbage collection
  await git.raw(['gc', '--prune=now', '--aggressive']);

  console.log(`[Git Cleanup] Removed ${oldCheckpoints.rowCount} old checkpoint tags`);
}

// Schedule weekly
cron.schedule('0 4 * * 0', cleanupOldCheckpoints);
```

## Testing Strategy

### 1. Classification Accuracy Test
```typescript
describe('Version Classification', () => {
  it('should classify style changes as patch', async () => {
    const result = await classifyVersion({
      changes: ['Updated button colors', 'Fixed spacing'],
      filesChanged: ['src/styles.css']
    });
    expect(result.versionBump).toBe('patch');
  });

  it('should classify new features as minor', async () => {
    const result = await classifyVersion({
      changes: ['Added user authentication'],
      filesChanged: ['src/auth/*']
    });
    expect(result.versionBump).toBe('minor');
  });

  it('should detect breaking changes', async () => {
    const result = await classifyVersion({
      changes: ['Updated API endpoints'],
      filesChanged: ['api/v1/*', 'package.json']
    });
    expect(result.breakingRisk).not.toBe('none');
  });

  it('should escalate risk for lockfile changes without package.json changes', async () => {
    const result = await classifyVersion({
      changes: ['Updated dependencies'],
      filesChanged: ['package-lock.json'],
      filesUnchanged: ['package.json']
    });
    expect(result.breakingRisk).toBeOneOf(['medium', 'high']);
  });
});
```

### 2. Version Progression Test
```typescript
describe('Version Progression', () => {
  it('should increment versions correctly', async () => {
    const v1 = await createVersion({ changeType: 'minor' }); // 1.0.0 -> 1.1.0
    const v2 = await createVersion({ changeType: 'patch' }); // 1.1.0 -> 1.1.1
    const v3 = await createVersion({ changeType: 'major' }); // 1.1.1 -> 2.0.0

    expect(v3.semver).toBe('2.0.0');
  });
});
```

## Migration Path

### For Existing Projects
1. Run migration to create version metadata table
2. Backfill version data from existing project_versions
3. Generate initial version tags in git
4. Start tracking new versions with classification

### Database Migration
```sql
-- Backfill existing versions
INSERT INTO project_versions_metadata (
  version_id,
  project_id,
  user_id,
  major_version,
  minor_version,
  patch_version,
  version_name,
  change_type,
  created_at
)
SELECT
  version_id,
  project_id,
  user_id,
  1, -- Default major
  0, -- Default minor
  ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) - 1, -- Sequential patches
  'Legacy Version',
  'patch',
  created_at
FROM project_versions
WHERE NOT EXISTS (
  SELECT 1 FROM project_versions_metadata
  WHERE project_versions_metadata.version_id = project_versions.version_id
);
```

## Success Metrics

1. **Version Classification Accuracy**: >90% agreement with manual classification
2. **Rollback Success Rate**: >99% successful rollbacks
3. **User Engagement**: >50% of users use version history
4. **Performance**: Version operations complete in <2 seconds

## Next Steps

1. **Immediate** (Week 1):
   - Create database schema
   - Implement basic version tracking
   - Add classification to build process

2. **Short-term** (Week 2-3):
   - Build API endpoints
   - Create UI components
   - Add rollback functionality

3. **Long-term** (Month 2+):
   - Advanced analytics on version patterns
   - Predictive version suggestions
   - Integration with CI/CD pipelines

## Implementation Feedback Notes

### Incorporated Improvements
The following feedback has been integrated into the plan above:

1. **PostgreSQL Index Syntax**: Fixed to use separate CREATE INDEX statements
2. **ULID Storage**: Changed from VARCHAR(32) to CHAR(26) for proper length validation
3. **Git Tag Idempotency**: Added `-f` flag for force updates on retries
4. **Classification Timeout**: Increased to 45s with circuit breaker fallback
5. **Schema Version**: Added schemaVersion field to all JSON outputs
6. **Version Conflicts**: Added prerelease handling when patch > 99
7. **Rollback Safety**: Added database snapshot before rollback with schema change warnings
8. **Metrics Events**: Added version_bump event emission for classification tracking
9. **Lockfile Test**: Added unit test for lockfile changes without package.json changes

### Future Considerations (Not Yet Implemented)

While the feedback was valuable, some suggestions may be better suited for future iterations:

1. **Extended Prerelease Patterns**: The current implementation handles basic `-rc1` patterns. More complex prerelease schemes (alpha, beta, nightly) could be added based on user needs.

2. **Advanced Circuit Breaker**: The current timeout fallback is simple. A full circuit breaker pattern with half-open states could be overkill for initial implementation.

3. **Cross-Service Schema Tracking**: Database schema migration tracking between versions would require deeper integration with the application layer, which is beyond the scope of this worker service.

## GitHub Sync Compatibility

The versioning system is designed to be fully compatible with future two-way GitHub synchronization. Here's how it will integrate:

### Current Design Decisions Supporting GitHub Sync

1. **Git-First Architecture**: All versions are already tracked as git tags
2. **Clean Commit History**: Each build creates atomic commits
3. **Metadata Separation**: `.sheenapps/` folder is gitignored, keeping repos clean
4. **Standard Semver**: Version tags follow GitHub's expected format

### Future GitHub Sync Implementation Plan

#### 1. Tag & Commit Synchronization
```typescript
// After creating tags locally, push to GitHub
async function syncVersionToGitHub(version: VersionMetadata) {
  const git = simpleGit();

  // Push tags
  await git.push('origin', version.git_tag);
  await git.push('origin', `checkpoint/${version.version_id}`);

  // For feature branches
  if (version.change_type !== 'patch') {
    await git.push('origin', `sheenapps/${version.version_name.toLowerCase().replace(/\s+/g, '-')}`);
  }
}
```

#### 2. Branch Strategy
```typescript
// Options for GitHub integration
interface GitHubBranchStrategy {
  // Option A: Dedicated sheenapps branch
  dedicatedBranch: {
    name: 'sheenapps-updates',
    protectionRules: 'none',
    mergeStrategy: 'user-initiated'
  };

  // Option B: Feature branches with PRs
  featureBranches: {
    pattern: 'sheenapps/{version-name}',
    baseBranch: 'main',
    autoCreatePR: true,
    prTemplate: '.github/SHEENAPPS_PR_TEMPLATE.md'
  };
}
```

#### 3. Metadata Sync Strategy
```typescript
// Move visible metadata to committed file
interface VisibleMetadata {
  path: 'sheenapps-meta/version.json',
  content: {
    version: string;
    name: string;
    description: string;
    generatedAt: string;
    recommendations: Array<{
      title: string;
      complexity: string;
      impact: string;
    }>;
  }
}

// Keep sensitive data in .sheenapps/
interface HiddenMetadata {
  path: '.sheenapps/internal.json',
  content: {
    buildId: string;
    cost: number;
    tokenUsage: object;
    sessionId: string;
  }
}
```

#### 4. Conflict Resolution
```typescript
async function handleGitHubUpdates(projectId: string) {
  const git = simpleGit();

  // Pull latest changes
  const pullResult = await git.pull('origin', 'main');

  if (pullResult.files.length > 0) {
    // Re-analyze project with new changes
    const stats = await collectBuildStats(projectPath);

    // Update Claude's context
    const contextUpdate = {
      externalChanges: pullResult.files,
      mergeCommit: pullResult.summary.changes,
      needsReview: pullResult.conflicts.length > 0
    };

    // If conflicts, notify user
    if (pullResult.conflicts.length > 0) {
      await emitBuildEvent(buildId, 'github_conflict', {
        conflicts: pullResult.conflicts,
        message: 'Please resolve conflicts before next update'
      });
      throw new ConflictError('GitHub conflicts must be resolved');
    }

    // Update version metadata with external changes
    await updateVersionMetadata(versionId, {
      external_changes: pullResult.files,
      merge_commit: pullResult.summary.changes
    });
  }
}
```

#### 5. Webhook Integration
```typescript
// Handle GitHub webhook events
app.post('/webhooks/github', async (req, reply) => {
  const event = req.headers['x-github-event'];

  switch (event) {
    case 'push':
      // Trigger metadata regeneration
      await regenerateProjectMetadata(req.body.repository.name);
      break;

    case 'pull_request':
      // Add status check
      await createGitHubStatus({
        context: 'sheenapps/version-check',
        state: 'success',
        description: `Version ${getNextVersion()} ready`
      });
      break;
  }
});
```

#### 6. Permission Model
```yaml
# GitHub App permissions needed
permissions:
  contents: write        # Push commits and tags
  pull_requests: write   # Create PRs
  statuses: write       # Add status checks

restrictions:
  - Cannot force-push to protected branches
  - Must create PRs for main branch updates
  - Respects branch protection rules
```

#### 7. Tag Cleanup Coordination
```typescript
// Enhanced cleanup to sync with GitHub
async function cleanupOldCheckpointsWithGitHub() {
  const oldTags = await getOldCheckpointTags();

  for (const tag of oldTags) {
    // Delete locally
    await git.tag(['-d', tag]);

    // Delete on GitHub
    await git.push('origin', `:refs/tags/${tag}`);
  }

  // Garbage collect both local and remote
  await git.raw(['gc', '--prune=now', '--aggressive']);
  await git.push('origin', '--prune');
}
```

### Migration Path for Existing Projects

1. **Phase 1**: Push existing tags to GitHub
2. **Phase 2**: Create sheenapps-meta/ directory for visible metadata
3. **Phase 3**: Enable webhook listeners
4. **Phase 4**: Implement bidirectional sync

This architecture ensures the versioning system will seamlessly integrate with GitHub while maintaining all current functionality.

## Implementation Summary

### ✅ COMPLETED IMPLEMENTATION (July 24, 2025)

The smart versioning system has been fully implemented with all planned features:

#### Key Components Delivered:
1. **Database Schema** (`migrations/004_add_versioning_system.sql`)
   - Project versions metadata table with proper indexes
   - CHAR(26) for ULID storage
   - Backfill for existing versions

2. **Version Service** (`src/services/versionService.ts`)
   - Git integration with tag management
   - Semver calculation with conflict resolution
   - Claude-powered classification with fallback
   - Build statistics collection

3. **Event-Driven Classification**
   - Deployment event listener (`src/workers/deploymentEventListener.ts`)
   - Automatic version classification after deployment
   - Non-blocking, resilient architecture

4. **API Endpoints** (`src/routes/versionHistory.ts`)
   - Version history with pagination
   - Rollback functionality
   - Milestone creation

5. **Database Integration** (`src/services/databaseWrapper.ts`)
   - Full CRUD operations for version metadata
   - Efficient queries with proper indexes

#### Architecture Highlights:
- **Loose Coupling**: Event-driven design allows versioning without modifying core build pipeline
- **Resilience**: Classification failures don't block deployments
- **Performance**: 45-second timeout with circuit breaker for Claude classification
- **Scalability**: Prepared for GitHub sync with tag management

#### Next Steps for Production:
1. Run database migration: `psql $DATABASE_URL < migrations/004_add_versioning_system.sql`
2. Monitor index performance with the built-in health checks
3. Configure git tag cleanup schedule
4. Test rollback functionality thoroughly
5. Consider implementing the GitHub sync features

## Conclusion

Smart versioning transforms the update process from a technical necessity into a user-friendly feature that encourages iterative development. By leveraging Claude's understanding and our existing infrastructure, we can provide intelligent version management that works for everyone.

The system is designed to be implemented incrementally, with each phase providing immediate value while building toward the complete solution.

