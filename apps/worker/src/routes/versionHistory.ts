import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getLatestProjectVersion, getProjectVersionHistoryWithPublication } from '../services/databaseWrapper';
import { VersionService } from '../services/versionService';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { workingDirectorySecurityService } from '../services/workingDirectorySecurityService';

// Expert feedback: Artifact availability helpers for frontend UI decisions
function isArtifactExpired(createdAt: string): boolean {
  const RETENTION_DAYS = parseInt(process.env.ARTIFACT_RETENTION_DAYS || '120');
  const expirationDate = new Date(createdAt);
  expirationDate.setDate(expirationDate.getDate() + RETENTION_DAYS);
  return new Date() > expirationDate;
}

function getRollbackDisabledReason(version: any): string | null {
  if (!version.artifact_url) return 'artifact_missing';
  if (isArtifactExpired(version.created_at)) return 'artifact_expired';
  if (version.is_published) return 'already_published';
  if (version.deploy_status !== 'deployed') return 'deployment_failed';
  return null;
}

function getPreviewDisabledReason(version: any): string | null {
  if (!version.artifact_url) return 'artifact_missing';
  if (isArtifactExpired(version.created_at)) return 'artifact_expired';
  if (version.deploy_status !== 'deployed') return 'deployment_failed';
  return null;
}

function getArtifactExpirationDate(createdAt: string): string {
  const RETENTION_DAYS = parseInt(process.env.ARTIFACT_RETENTION_DAYS || '120');
  const expirationDate = new Date(createdAt);
  expirationDate.setDate(expirationDate.getDate() + RETENTION_DAYS);
  return expirationDate.toISOString();
}

function getDaysUntilExpiration(createdAt: string): number {
  const expirationDate = new Date(getArtifactExpirationDate(createdAt));
  const now = new Date();
  const diffTime = expirationDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

interface VersionHistoryQuery {
  includePatches?: string;
  limit?: string;
  offset?: string;
  state?: 'published' | 'unpublished' | 'all';
  showDeleted?: string;
  userId?: string; // Added for working directory security and status
}

interface VersionHistoryParams {
  projectId: string;
}

// Removed RollbackParams and RollbackBody interfaces
// These were used by the deprecated async rollback endpoint

interface MilestoneParams {
  projectId: string;
}

interface MilestoneBody {
  userId: string;
  name: string;
  description: string;
  currentVersionId: string;
}

export async function versionHistoryRoutes(fastify: FastifyInstance) {
  // Apply HMAC validation middleware to all routes
  const hmacMiddleware = requireHmacSignature();
  
  // GET /projects/:projectId/versions - Get version history
  fastify.get<{
    Params: VersionHistoryParams;
    Querystring: VersionHistoryQuery;
  }>('/v1/projects/:projectId/versions', {
    preHandler: hmacMiddleware as any,
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      },
      querystring: {
        type: 'object',
        properties: {
          includePatches: { type: 'string' },
          limit: { type: 'string' },
          offset: { type: 'string' },
          state: { type: 'string', enum: ['published', 'unpublished', 'all'] },
          showDeleted: { type: 'string' },
          userId: { type: 'string' } // Added for working directory security
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            versions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  semver: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  type: { type: 'string' },
                  createdAt: { type: 'string' },
                  deployedAt: { type: ['string', 'null'] },
                  stats: {
                    type: 'object',
                    properties: {
                      filesChanged: { type: 'number' },
                      linesAdded: { type: 'number' },
                      linesRemoved: { type: 'number' }
                    }
                  },
                  fromRecommendation: { type: 'boolean' },
                  breakingRisk: { type: 'string' },
                  // Publication fields
                  isPublished: { type: 'boolean' },
                  publishedAt: { type: ['string', 'null'] },
                  publishedBy: { type: ['string', 'null'] },
                  userComment: { type: ['string', 'null'] },
                  previewUrl: { type: ['string', 'null'] },
                  // Artifact availability metadata
                  hasArtifact: { type: 'boolean' },
                  artifactSize: { type: 'number' },
                  // Action availability
                  canPreview: { type: 'boolean' },
                  canRollback: { type: 'boolean' },
                  canPublish: { type: 'boolean' },
                  canUnpublish: { type: 'boolean' },
                  // Accessibility metadata
                  accessibility: {
                    type: 'object',
                    properties: {
                      rollbackDisabledReason: { type: ['string', 'null'] },
                      previewDisabledReason: { type: ['string', 'null'] }
                    }
                  },
                  // Retention information
                  retention: {
                    type: 'object',
                    properties: {
                      expiresAt: { type: 'string' },
                      daysRemaining: { type: 'number' }
                    }
                  },
                  // Working directory sync
                  isInWorkingDirectory: { type: 'boolean' },
                  canSyncToWorkingDirectory: { type: 'boolean' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: VersionHistoryParams;
    Querystring: VersionHistoryQuery;
  }>, reply: FastifyReply) => {
    const { projectId } = request.params;
    const {
      includePatches = 'false',
      limit = '20',
      offset = '0',
      state = 'all',
      showDeleted = 'false',
      userId
    } = request.query;

    // Expert feedback: Enforce pagination upper bound to prevent abuse
    const parsedLimit = Math.min(parseInt(limit), 100); // MAX 100 versions per request
    const parsedOffset = Math.max(parseInt(offset), 0); // Ensure non-negative offset

    try {
      // Note: We're not verifying project ownership here since version history could be public
      // Add ownership check if needed:
      // const userId = request.userId;
      // const project = await getProject(userId, projectId);
      // if (!project) {
      //   return reply.code(404).send({ error: 'Project not found' });
      // }

      const history = await getProjectVersionHistoryWithPublication(projectId, {
        includeCheckpoints: includePatches === 'true',
        limit: parsedLimit,
        offset: parsedOffset,
        state,
        showDeleted: showDeleted === 'true'
      });

      // Format for UI with publication information
      // Get working directory status with security validation
      // Implements acceptance criteria: "Path traversal tests (.., absolute, UNC) pass"
      let workingDirStatus: {
        currentVersionId?: string;
        publishedVersionId?: string;
        isInSync: boolean;
        isDirty: boolean;
        uncommittedChanges: string[];
        syncRecommendation: string;
        securityValidated: boolean;
      } | null = null;

      if (userId) {
        try {
          // Validate path security and get working directory status
          const securityStatus = await workingDirectorySecurityService.getWorkingDirectoryStatus(userId, projectId);

          if (securityStatus.securityValidated) {
            workingDirStatus = {
              currentVersionId: history.versions[0]?.version_id,
              publishedVersionId: history.versions.find(v => v.is_published)?.version_id,
              isInSync: securityStatus.isInSync,
              isDirty: securityStatus.isDirty,
              uncommittedChanges: securityStatus.uncommittedChanges,
              syncRecommendation: securityStatus.syncRecommendation,
              securityValidated: securityStatus.securityValidated
            };
          }
        } catch (error) {
          console.warn(`Working directory security validation failed for user ${userId}:`, error);
          // Continue without working directory status for security
        }
      }

      const formattedVersions = history.versions.map(v => ({
        id: v.version_id,
        
        // New fields for display versioning
        displayVersion: v.display_version_number ? `v${v.display_version_number}` : null,
        displayVersionNumber: v.display_version_number,
        
        // Use version_name from database (which now contains display version)
        // This ensures consistency between what's stored and what's exposed
        name: v.version_name || `Version ${v.major_version || 1}.${v.minor_version || 0}.${v.patch_version || 0}`,
        
        // Keep semantic version info for compatibility and internal use
        semver: `${v.major_version || 1}.${v.minor_version || 0}.${v.patch_version || 0}${v.prerelease ? `-${v.prerelease}` : ''}`,
        semanticVersion: v.major_version ? {
          major: v.major_version,
          minor: v.minor_version,
          patch: v.patch_version,
          full: `${v.major_version}.${v.minor_version}.${v.patch_version}`
        } : null,
        
        description: v.version_description,
        type: v.change_type,
        createdAt: v.created_at,
        deployedAt: v.deployed_at || null,
        stats: {
          filesChanged: v.files_changed || 0,
          linesAdded: v.lines_added || 0,
          linesRemoved: v.lines_removed || 0
        },
        fromRecommendation: !!v.from_recommendation_id,
        breakingRisk: v.breaking_risk || 'none',
        // Publication information
        isPublished: v.is_published || false,
        publishedAt: v.published_at || null,
        publishedBy: v.published_by || null,
        userComment: v.user_comment || null,
        previewUrl: v.preview_url || null,

        // Expert feedback: Artifact availability metadata for frontend UI decisions
        hasArtifact: !!v.artifact_url && !isArtifactExpired(v.created_at),
        artifactSize: v.artifact_size || v.output_size_bytes || 0,

        // Action availability with business logic
        canPreview: !!v.artifact_url && !isArtifactExpired(v.created_at) && v.deploy_status === 'deployed',
        canRollback: !!v.artifact_url && !isArtifactExpired(v.created_at) && !v.is_published && v.deploy_status === 'deployed',
        canPublish: !v.is_published && !v.soft_deleted_at && v.deploy_status === 'deployed',
        canUnpublish: v.is_published,

        // Accessibility hints for disabled actions
        accessibility: {
          rollbackDisabledReason: getRollbackDisabledReason(v),
          previewDisabledReason: getPreviewDisabledReason(v)
        },

        // Retention information
        retention: {
          expiresAt: getArtifactExpirationDate(v.created_at),
          daysRemaining: getDaysUntilExpiration(v.created_at)
        },

        // Working directory sync status with security validation
        isInWorkingDirectory: workingDirStatus?.securityValidated && workingDirStatus.currentVersionId === v.version_id,
        canSyncToWorkingDirectory: v.deploy_status === 'deployed' && !!v.artifact_url && !isArtifactExpired(v.created_at) && (!userId || workingDirStatus?.securityValidated)
      }));

      return reply.send({
        success: true,
        versions: formattedVersions,
        workingDirectory: workingDirStatus, // Enabled with security validation
        pagination: {
          total: history.total,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: history.versions.length === parsedLimit
        }
      });
    } catch (error) {
      console.error('[Version History] Error:', error);
      return reply.code(500).send({
        error: 'Failed to fetch version history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // DEPRECATED: POST /projects/:projectId/versions/:versionId/rollback - Return 410 Gone
  // fastify.post('/projects/:projectId/versions/:versionId/rollback', async (request, reply) => {
  //   return reply.code(410).headers({
  //     'Retry-After': '0',
  //     'X-Deprecated-Endpoint': 'true',
  //     'X-Replacement-Endpoint': 'POST /v1/versions/rollback',
  //     'X-Migration-Guide': '/docs/API_REFERENCE_FOR_NEXTJS.md'
  //   }).send({
  //     error: 'endpoint_deprecated',
  //     message: 'This endpoint has been deprecated and removed',
  //     replacement: {
  //       endpoint: 'POST /v1/versions/rollback',
  //       documentation: '/docs/API_REFERENCE_FOR_NEXTJS.md',
  //       changes: [
  //         'Requires HMAC signature authentication',
  //         'Immediate response with background processing',
  //         'Enhanced error handling and idempotency'
  //       ]
  //     },
  //     deprecatedSince: '2025-08-03',
  //     removedSince: '2025-08-03'
  //   });
  // });

  // POST /projects/:projectId/versions/milestone - Create milestone version
  fastify.post<{
    Params: MilestoneParams;
    Body: MilestoneBody;
  }>('/v1/projects/:projectId/versions/milestone', {
    preHandler: hmacMiddleware as any,
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      },
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          currentVersionId: { type: 'string' }
        },
        required: ['userId', 'name', 'description', 'currentVersionId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            milestone: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                semver: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: MilestoneParams;
    Body: MilestoneBody;
  }>, reply: FastifyReply) => {
    const { projectId } = request.params;
    const { userId, name, description, currentVersionId } = request.body;

    try {
      // Verify ownership
      const project = await getLatestProjectVersion(userId, projectId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      // Get project path from current version
      const currentVersion = await getLatestProjectVersion(userId, projectId);
      if (!currentVersion) {
        return reply.code(404).send({ error: 'Current version not found' });
      }

      const projectPath = `/tmp/projects/${userId}/${projectId}`;
      const versionService = new VersionService(projectPath);

      // Force a major version bump
      const milestone = await versionService.createVersion({
        projectId,
        userId,
        versionId: currentVersionId,
        changeType: 'major',
        versionName: name,
        versionDescription: description,
        breakingRisk: 'none', // User-initiated milestones are safe
        autoClassified: false,  // User-initiated
        confidence: 1.0,
        reasoning: 'User marked as milestone',
        commitSha: 'milestone', // Will be updated by next build
        stats: {
          filesChanged: 0,
          linesAdded: 0,
          linesRemoved: 0,
          buildDuration: 0
        }
      });

      return reply.send({
        success: true,
        milestone: {
          id: milestone.version_id,
          semver: `${milestone.major_version || 1}.0.0`,
          name: milestone.version_name,
          description: milestone.version_description
        }
      });
    } catch (error) {
      console.error('[Create Milestone] Error:', error);
      return reply.code(500).send({
        error: 'Failed to create milestone',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Security testing endpoint for path validation
  // Implements acceptance criteria: "Cross-Platform Testing: Unit test matrix for POSIX/Windows edge cases"
  fastify.get('/v1/working-directory/security-test', {
    preHandler: hmacMiddleware as any,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          testMode: { type: 'string', enum: ['validation', 'security'] }
        },
        required: ['userId']
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { userId: string; testMode?: string };
  }>, reply: FastifyReply) => {
    try {
      const { userId, testMode = 'validation' } = request.query;

      if (testMode === 'security') {
        // Run comprehensive security tests
        const testResults = workingDirectorySecurityService.runSecurityTests();

        return reply.send({
          success: true,
          testResults: {
            passed: testResults.passed,
            failed: testResults.failed,
            total: testResults.passed + testResults.failed,
            details: testResults.results
          },
          message: `Security tests completed: ${testResults.passed} passed, ${testResults.failed} failed`
        });
      } else {
        // Run path validation test
        const testPaths = [
          'src/components/Button.tsx',
          '../../../etc/passwd',
          'C:\\Windows\\System32\\config',
          '.env.local',
          'public/images/logo.png'
        ];

        const validationResults = testPaths.map(path => {
          const result = workingDirectorySecurityService.validatePath(path, userId);
          return {
            path,
            isValid: result.isValid,
            normalizedPath: result.normalizedPath,
            reason: result.reason,
            securityIssue: result.securityIssue
          };
        });

        return reply.send({
          success: true,
          validationResults,
          message: 'Path validation tests completed'
        });
      }

    } catch (error) {
      console.error('[Security Test] Error:', error);
      return reply.code(500).send({
        error: 'Security test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
