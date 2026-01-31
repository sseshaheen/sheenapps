import { ulid } from 'ulid';
import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import { 
  // getProjectVersionHistory,  // DEPRECATED: Use getProjectVersionHistoryWithPublication
  getProjectVersionMetadata, 
  // createVersionMetadata,      // DEPRECATED: Use updateProjectVersion directly
  // updateVersionMetadata,      // DEPRECATED: Use updateProjectVersion directly
  getLatestVersionMetadata,
  getVersionBySemver,
  getProjectVersionHistoryWithPublication
} from './databaseWrapper';
import { updateProjectVersion } from './database';
import { streamQueue } from '../queue/streamQueue';
import { emitBuildEvent } from './eventService';

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export interface CreateVersionParams {
  versionId?: string;
  projectId: string;
  userId: string;
  changeType: 'patch' | 'minor' | 'major' | 'rollback';
  versionName?: string;  // Optional - we don't want to overwrite display version
  versionDescription: string;
  breakingRisk: 'none' | 'low' | 'medium' | 'high';
  autoClassified: boolean;
  confidence?: number;
  reasoning?: string;
  fromRecommendationId?: number;
  commitSha: string;
  stats: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    buildDuration: number;
  };
}

export interface VersionMetadata {
  version_id: string;
  project_id: string;
  user_id: string;
  major_version: number;
  minor_version: number;
  patch_version: number;
  prerelease?: string;
  version_name: string;
  version_description: string;
  change_type: string;
  breaking_risk: string;
  auto_classified: boolean;
  classification_confidence?: number;
  classification_reasoning?: string;
  parent_version_id?: string;
  from_recommendation_id?: number;
  files_changed: number;
  lines_added: number;
  lines_removed: number;
  build_duration_ms: number;
  git_commit_sha: string;
  git_tag: string;
  created_at: Date;
  deployed_at?: Date;
}

export interface VersionHistoryOptions {
  includeCheckpoints?: boolean;
  limit?: number;
  offset?: number;
  minorAndMajorOnly?: boolean;
}

export interface RollbackResult {
  jobId: string;
  targetVersion: VersionMetadata;
  message: string;
}

export class VersionService {
  private git: SimpleGit;

  constructor(private projectPath: string) {
    this.git = simpleGit(projectPath);
  }

  async createVersion(params: CreateVersionParams): Promise<VersionMetadata> {
    const versionId = params.versionId || ulid();
    
    // Get previous version for semver calculation
    const previousVersion = await getLatestVersionMetadata(params.projectId);
    
    // Calculate new semver
    const newSemver = await this.calculateNextVersion(
      params.projectId,
      previousVersion,
      params.changeType
    );
    
    // Create git tag
    const gitTag = `v${newSemver.major}.${newSemver.minor}.${newSemver.patch}${newSemver.prerelease ? `-${newSemver.prerelease}` : ''}`;
    await this.createGitTag(gitTag, params.commitSha);
    
    // Also create checkpoint tag
    await this.createGitTag(`checkpoint/${versionId}`, params.commitSha);
    
    // Save to database using consolidated table approach
    const version = await updateProjectVersion(versionId, {
      majorVersion: newSemver.major,
      minorVersion: newSemver.minor,
      patchVersion: newSemver.patch,
      prerelease: newSemver.prerelease,
      // Only update versionName if provided (we don't want to overwrite display version)
      ...(params.versionName && { versionName: params.versionName }),
      versionDescription: params.versionDescription,
      changeType: params.changeType,
      breakingRisk: params.breakingRisk,
      autoClassified: params.autoClassified,
      classificationConfidence: params.confidence,
      classificationReasoning: params.reasoning
      // Note: git stats, commit info not stored in consolidated table yet
    });
    
    if (!version) {
      throw new Error(`Failed to create version metadata for ${versionId}`);
    }
    
    // Convert ProjectVersion to VersionMetadata format for compatibility
    return {
      version_id: version.versionId,
      project_id: version.projectId,
      user_id: version.userId,
      major_version: version.majorVersion!,
      minor_version: version.minorVersion!,
      patch_version: version.patchVersion!,
      prerelease: version.prerelease,
      version_name: version.versionName || '',  // May be empty if preserving display version
      version_description: version.versionDescription!,
      change_type: version.changeType!,
      breaking_risk: version.breakingRisk!,
      auto_classified: version.autoClassified!,
      classification_confidence: version.classificationConfidence,
      classification_reasoning: version.classificationReasoning,
      parent_version_id: previousVersion?.version_id,
      from_recommendation_id: params.fromRecommendationId,
      files_changed: params.stats.filesChanged,
      lines_added: params.stats.linesAdded,
      lines_removed: params.stats.linesRemoved,
      build_duration_ms: params.stats.buildDuration,
      git_commit_sha: params.commitSha,
      git_tag: gitTag,
      created_at: version.createdAt
    } as VersionMetadata;
  }

  private async calculateNextVersion(
    projectId: string,
    previous: VersionMetadata | null,
    changeType: 'patch' | 'minor' | 'major' | 'rollback'
  ): Promise<SemVer> {
    if (!previous) {
      return { major: 1, minor: 0, patch: 0 };
    }
    
    let proposedVersion: SemVer;
    
    switch (changeType) {
      case 'major':
        proposedVersion = {
          major: previous.major_version + 1,
          minor: 0,
          patch: 0
        };
        break;
      case 'minor':
        proposedVersion = {
          major: previous.major_version,
          minor: previous.minor_version + 1,
          patch: 0
        };
        break;
      case 'patch':
      case 'rollback':
        proposedVersion = {
          major: previous.major_version,
          minor: previous.minor_version,
          patch: previous.patch_version + 1
        };
        break;
    }
    
    // Check for conflicts and resolve
    return await this.resolveVersionConflict(projectId, proposedVersion);
  }

  private async resolveVersionConflict(
    projectId: string,
    proposedVersion: SemVer
  ): Promise<SemVer> {
    // Check if version already exists
    const existing = await getVersionBySemver(
      projectId,
      proposedVersion.major,
      proposedVersion.minor,
      proposedVersion.patch
    );
    
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
        while (await getVersionBySemver(
          projectId,
          baseVersion.major,
          baseVersion.minor,
          baseVersion.patch,
          `rc${releaseNum}`
        )) {
          releaseNum++;
        }
        
        return {
          ...baseVersion,
          prerelease: `rc${releaseNum}`
        };
      }
      
      // Normal patch increment
      let patch = proposedVersion.patch;
      while (await getVersionBySemver(
        projectId,
        proposedVersion.major,
        proposedVersion.minor,
        ++patch
      )) {
        // Keep incrementing
      }
      
      return {
        ...proposedVersion,
        patch
      };
    }
    
    return proposedVersion;
  }

  async createGitTag(tag: string, commitSha: string): Promise<void> {
    try {
      // Force update tag to handle retries cleanly
      await this.git.tag(['-f', tag, commitSha]);
      console.log(`[Version Service] Created/updated git tag: ${tag}`);
    } catch (error) {
      console.error(`[Version Service] Tag creation failed for ${tag}:`, error);
      throw error;
    }
  }

  async getVersionHistory(
    projectId: string,
    options: VersionHistoryOptions = {}
  ): Promise<{ versions: VersionMetadata[]; total: number; hasMore: boolean }> {
    const { 
      includeCheckpoints = false,
      limit = 50,
      offset = 0,
      minorAndMajorOnly = true 
    } = options;

    const result = await getProjectVersionHistoryWithPublication(projectId, {
      limit,
      offset,
      includeCheckpoints: !minorAndMajorOnly,
      state: 'all',
      showDeleted: false
    });

    return {
      versions: result.versions,
      total: result.total,
      hasMore: result.versions.length === limit
    };
  }

  async rollbackToVersion(
    projectId: string,
    targetVersionId: string,
    userId: string
  ): Promise<RollbackResult> {
    // Get target version details
    const targetVersion = await getProjectVersionMetadata(targetVersionId);
    if (!targetVersion) {
      throw new Error('Target version not found');
    }
    
    // Create rollback job
    const rollbackJob = await streamQueue.add('rollback-build', {
      projectId,
      targetVersionId,
      targetCommitSha: targetVersion.git_commit_sha,
      targetGitTag: targetVersion.git_tag,
      rollbackReason: 'user_requested',
      userId
    });

    return {
      jobId: rollbackJob.id as string,
      targetVersion,
      message: `Rolling back to ${targetVersion.git_tag} - ${targetVersion.version_name}`
    };
  }

  async collectBuildStats(projectPath: string): Promise<{
    commitSha: string;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    totalFiles: number;
  }> {
    try {
      // Get latest commit
      const log = await this.git.log(['-1']);
      const latest = log.latest;
      
      if (!latest) {
        console.warn('[Version Service] No commits found, using defaults');
        return {
          commitSha: 'initial',
          filesChanged: 0,
          linesAdded: 0,
          linesRemoved: 0,
          totalFiles: 0
        };
      }
      
      // Get diff stats - handle initial commit case
      let filesChanged = 0;
      let linesAdded = 0;
      let linesRemoved = 0;
      
      try {
        const diffSummary = await this.git.diffSummary([`${latest.hash}~1`, latest.hash]);
        filesChanged = diffSummary.files.length;
        linesAdded = diffSummary.insertions;
        linesRemoved = diffSummary.deletions;
      } catch (diffError) {
        // This might be the first commit
        console.log('[Version Service] Could not get diff (possibly first commit)');
        // Get stats for the entire commit
        const showResult = await this.git.raw(['show', '--stat', '--format=', latest.hash]);
        const lines = showResult.split('\n').filter((line: string) => line.trim());
        filesChanged = lines.length - 1; // Last line is summary
      }
      
      // Count total files
      const fileList = await this.git.raw(['ls-tree', '-r', 'HEAD', '--name-only']);
      const totalFiles = fileList.split('\n').filter((f: string) => f.trim()).length;
      
      return {
        commitSha: latest.hash,
        filesChanged,
        linesAdded,
        linesRemoved,
        totalFiles
      };
    } catch (error) {
      console.error('[Version Service] Failed to collect git stats:', error);
      return {
        commitSha: 'unknown',
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
        totalFiles: 0
      };
    }
  }
}

// Version classification function to be used in stream worker
export async function classifyVersion(
  buildId: string,
  projectPath: string,
  previousVersion: VersionMetadata | null,
  sessionId: string,
  userId?: string
): Promise<{
  versionBump: 'patch' | 'minor' | 'major';
  versionName: string;
  versionDescription: string;
  breakingRisk: 'none' | 'low' | 'medium' | 'high';
  confidence: number;
  reasoning: string;
}> {
  const { ClaudeSession } = await import('../stream');
  
  // Construct classification prompt
  const classificationPrompt = `You just completed a build for a project. Analyze the changes and classify the version.

${previousVersion ? `Previous version: v${previousVersion.major_version}.${previousVersion.minor_version}.${previousVersion.patch_version} - ${previousVersion.version_name}` : 'This is the first version.'}

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
      45000, // 45 second timeout with circuit breaker
      userId,
      undefined // projectId not available in this context
    );

    if (result.success && result.result) {
      const classification = JSON.parse(result.result);
      
      // Emit metrics event
      await emitBuildEvent(buildId, 'version_bump', {
        changeType: classification.versionBump,
        autoClassified: true,
        override: false,
        confidence: classification.confidence,
        breakingRisk: classification.breakingRisk,
        userId
      });
      
      return classification;
    }
  } catch (error) {
    console.error('[Version Classification] Failed:', error);
    
    // Circuit breaker: if Claude is slow, fallback immediately
    if (error instanceof Error && error.message?.includes('timeout')) {
      console.warn('[Version Classification] Claude timeout, using fallback');
    }
  }

  // Fallback to simple rules-based classification
  const fallback = {
    schemaVersion: 1,
    versionBump: 'patch' as const,
    versionName: 'Update',
    versionDescription: 'Project updated',
    breakingRisk: 'none' as const,
    confidence: 0.5,
    reasoning: 'Automatic classification failed, using safe default'
  };
  
  // Emit fallback metrics
  await emitBuildEvent(buildId, 'version_bump', {
    changeType: fallback.versionBump,
    autoClassified: false,
    override: true,
    confidence: fallback.confidence,
    breakingRisk: fallback.breakingRisk,
    userId
  });
  
  return fallback;
}