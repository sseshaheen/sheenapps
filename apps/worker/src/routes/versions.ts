import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Redis from 'ioredis';
import { ulid } from 'ulid';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { addBuildJob } from '../queue/buildQueue';
import { streamQueue } from '../queue/streamQueue';
import { setLatestVersion } from '../services/cloudflareKV';
import { createProjectVersion, getLatestProjectVersion, getProjectVersion, listProjectVersions, updateProjectVersion } from '../services/database';
import { getDiff } from '../services/gitDiff';
import { getProjectConfig, updateProjectConfig } from '../services/projectConfigService';
import { formatFileSize } from '../utils/checksums';
import { validateTimestamp, verifyHMACv1 } from '../utils/hmacHelpers';
import { ProjectPaths } from '../utils/projectPaths';
import { generateR2SignedUrl } from '../utils/r2SignedUrls';

// Environment variable validation with explicit error handling
const SHARED_SECRET = process.env.SHARED_SECRET;
if (!SHARED_SECRET) {
  console.error('FATAL: SHARED_SECRET environment variable is not set');
  process.exit(1);
}
// TypeScript assertion - we know SHARED_SECRET is defined after the check above
const VALIDATED_SHARED_SECRET: string = SHARED_SECRET;

// Redis connection for rollback locking and idempotency
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

// Artifact size limits for download safety
const MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB for downloads (higher than upload)
const WARN_DOWNLOAD_SIZE = 500 * 1024 * 1024; // 500 MB warning

// Use correct HMAC v1 validation from hmacHelpers

interface RollbackBody {
  userId?: string; // Optional - can be extracted from auth
  projectId: string;
  targetVersionId?: string; // Legacy field name
  sourceVersionId?: string; // New field name from frontend
  skipWorkingDirectory?: boolean; // Expert feedback: CI-only rollbacks
  comment?: string; // Optional user comment for the rollback version
  createBackup?: boolean; // Frontend sends this but we don't use it yet
}

interface VersionListParams {
  userId: string;
  projectId: string;
}

export async function registerVersionRoutes(app: FastifyInstance) {
  // Apply HMAC validation to all version endpoints
  const hmacMiddleware = requireHmacSignature();

  // GET /versions/:userId/:projectId
  // List all versions for a project
  app.get<{ Params: VersionListParams }>('/v1/versions/list/:userId/:projectId', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Params: VersionListParams }>,
    reply: FastifyReply
  ) => {
    const { userId, projectId } = request.params;

    try {
      // Expert feedback: Client-supplied limit with hard cap 200
      const query = request.query as { limit?: string };
      const requestedLimit = parseInt(query.limit || '100') || 100;
      const maxVersions = Math.min(requestedLimit, 200);
      const versions = await listProjectVersions(userId, projectId, maxVersions);

      return reply.send({
        success: true,
        versions: versions.map(v => ({
          versionId: v.versionId,
          prompt: v.prompt,
          previewUrl: v.previewUrl,
          status: v.status,
          createdAt: v.createdAt,
          parentVersionId: v.parentVersionId,
          framework: v.framework,
        })),
        total: versions.length,
      });
    } catch (error: any) {
      console.error('Error listing versions:', error);
      return reply.code(500).send({
        error: 'Failed to list versions',
        details: error.message
      });
    }
  });

  // GET /versions/:versionId
  // Get detailed info about a specific version
  app.get<{ Params: { versionId: string } }>('/v1/versions/detail/:versionId', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Params: { versionId: string } }>,
    reply: FastifyReply
  ) => {
    const { versionId } = request.params;

    try {
      const version = await getProjectVersion(versionId);

      if (!version) {
        return reply.code(404).send({ error: 'Version not found' });
      }

      return reply.send({
        success: true,
        version: {
          ...version,
          claudeJson: undefined, // Don't expose raw Claude response
        },
      });
    } catch (error: any) {
      console.error('Error getting version:', error);
      return reply.code(500).send({
        error: 'Failed to get version',
        details: error.message
      });
    }
  });

  // POST /v1/versions/rollback
  // Production-ready rollback with immediate response and background processing
  app.post<{ Body: RollbackBody }>('/v1/versions/rollback', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Body: RollbackBody }>,
    reply: FastifyReply
  ) => {
    // Verify signature - Expert feedback: handle header case and missing values
    const sig = request.headers['x-sheen-signature']?.toString() ?? '';
    const timestamp = request.headers['x-sheen-timestamp']?.toString() ?? '';
    const body = JSON.stringify(request.body);

    if (!sig || !timestamp || !validateTimestamp(timestamp) || !verifyHMACv1(body, timestamp, sig, VALIDATED_SHARED_SECRET)) {
      return reply.code(401).send({
        error: 'Invalid signature',
        serverTime: new Date().toISOString() // Expert feedback: Help debug clock skew
      });
    }

    // Log the raw request body to debug
    console.log('[Rollback] Raw request body:', JSON.stringify(request.body));
    console.log('[Rollback] Headers:', {
      'x-user-id': request.headers['x-user-id'],
      'content-type': request.headers['content-type']
    });

    const { userId, projectId, targetVersionId, sourceVersionId, skipWorkingDirectory = false, comment, createBackup } = request.body;

    // Support both targetVersionId (legacy) and sourceVersionId (new frontend)
    const versionToRestore = sourceVersionId || targetVersionId;

    // Extract userId from headers or body
    const userIdHeader = request.headers['x-user-id'] as string;
    const effectiveUserId = userId || userIdHeader || (request as any).userId || (request as any).user?.id;

    if (!effectiveUserId || !projectId || !versionToRestore) {
      return reply.code(400).send({ error: 'userId, projectId, and sourceVersionId/targetVersionId are required' });
    }

    // console.log('[Rollback] Extracted values:', {
    //   effectiveUserId,
    //   projectId,
    //   versionToRestore,
    //   comment: comment || '(not provided)',
    //   commentType: typeof comment,
    //   createBackup,
    //   skipWorkingDirectory
    // });

    // Performance timing
    const startTime = Date.now();

    // Final expert feedback: Idempotency for client retries
    const idempotencyKey = request.headers['idempotency-key'] as string;
    if (idempotencyKey) {
      const existingResult = await redis.get(`rollback-idempotency:${idempotencyKey}`);
      if (existingResult) {
        return reply.send(JSON.parse(existingResult));
      }
    }

    // Final expert feedback: Configurable lock TTL for large artifacts
    const MAX_ROLLBACK_DURATION = parseInt(process.env.MAX_ROLLBACK_DURATION_SECONDS || '300'); // 5 min default
    const lockTTL = MAX_ROLLBACK_DURATION + 60; // Add 1-minute buffer
    const lockKey = `rollback-lock:${projectId}`;

    const lockAcquired = await redis.set(lockKey, '1', 'EX', lockTTL, 'NX');
    if (!lockAcquired) {
      return reply.code(409).send({
        error: 'rollback_in_progress',
        message: 'Another rollback is already in progress for this project'
      });
    }

    try {
      // Get the target version with proper field mapping
      const targetVersion = await getProjectVersion(versionToRestore);
      if (!targetVersion) {
        return reply.code(404).send({ error: 'Target version not found' });
      }

      // Ensure we have the version name for the target
      const targetVersionName = targetVersion.versionName ||
        (targetVersion.majorVersion ? `v${targetVersion.majorVersion}.${targetVersion.minorVersion || 0}.${targetVersion.patchVersion || 0}` : versionToRestore);

      // Verify it belongs to the same project
      console.log('[Rollback] Version ownership check:', {
        versionToRestore,
        targetVersion_userId: targetVersion.userId,
        targetVersion_projectId: targetVersion.projectId,
        targetVersion_artifactUrl: targetVersion.artifactUrl,
        targetVersion_previewUrl: targetVersion.previewUrl,
        request_userId: effectiveUserId,
        request_projectId: projectId,
        userIdMatch: targetVersion.userId === effectiveUserId,
        projectIdMatch: targetVersion.projectId === projectId
      });

      if (targetVersion.userId !== effectiveUserId || targetVersion.projectId !== projectId) {
        console.error('[Rollback] Version ownership mismatch:', {
          expected: { userId: effectiveUserId, projectId },
          actual: { userId: targetVersion.userId, projectId: targetVersion.projectId }
        });
        return reply.code(403).send({ error: 'Version does not belong to this project' });
      }

      // Check if artifact exists
      if (!targetVersion.artifactUrl) {
        return reply.code(400).send({ error: 'Target version has no artifact to rollback to' });
      }

      // Check if target version has a preview URL (should exist if it was ever deployed)
      if (!targetVersion.previewUrl) {
        return reply.code(400).send({ error: 'Target version has no preview URL - it may never have been successfully deployed' });
      }

      // Store pre-rollback state for potential reversion
      const preRollbackState = await getProjectConfig(projectId);

      // Create rollback version record directly as 'deployed' (following principle: only successful deployments get version records)
      const rollbackVersionId = ulid();

      // Generate a descriptive prompt for the rollback
      const rollbackPrompt = comment
        ? `${comment} (Rollback to ${targetVersionName})`
        : `Rollback to ${targetVersionName}`;

      console.log('[Rollback] Creating rollback version with artifact URL:', targetVersion.artifactUrl);
      console.log('[Rollback] Rollback prompt:', rollbackPrompt);

      // Get the latest version to calculate next semantic version
      const latestVersion = await getLatestProjectVersion(effectiveUserId, projectId);

      // Get all versions to find the highest version numbers
      const allVersions = await listProjectVersions(effectiveUserId, projectId, 1000);

      // Calculate next version (rollbacks are patch increments)
      let majorVersion: number = 1;
      let minorVersion: number = 0;
      let patchVersion: number = 0;
      let displayVersionNumber: number = 1;

      // Find the highest major.minor.patch from all versions
      for (const v of allVersions) {
        if (v.majorVersion !== null && v.majorVersion !== undefined) {
          if (v.majorVersion > majorVersion ||
              (v.majorVersion === majorVersion && (v.minorVersion || 0) > minorVersion) ||
              (v.majorVersion === majorVersion && (v.minorVersion || 0) === minorVersion && (v.patchVersion || 0) >= patchVersion)) {
            majorVersion = v.majorVersion;
            minorVersion = v.minorVersion || 0;
            patchVersion = (v.patchVersion || 0);
          }
        }
      }

      // Increment patch version for rollback
      patchVersion = patchVersion + 1;

      // Calculate display version number - find the highest one
      for (const v of allVersions) {
        if (v.displayVersionNumber) {
          const vNum = parseInt(v.displayVersionNumber);
          if (vNum >= displayVersionNumber) {
            displayVersionNumber = vNum + 1;
          }
        }
      }

      // If still 1, use total count + 1
      if (displayVersionNumber === 1) {
        displayVersionNumber = allVersions.length + 1;
      }

      // Use display version number for the version name (e.g., v43)
      const versionName = `v${displayVersionNumber}`;
      const versionDescription = `Rollback to ${targetVersionName}`;

      // Keep semantic version for internal versioning (major.minor.patch)
      const semanticVersion = `${majorVersion}.${minorVersion}.${patchVersion}`;



      // Run database operations in parallel where possible
      const [createVersionResult] = await Promise.all([
        createProjectVersion({
          userId: effectiveUserId,
          projectId,
          versionId: rollbackVersionId,
          prompt: rollbackPrompt,
          parentVersionId: versionToRestore,
          status: 'deployed', // Create directly as deployed since rollback reuses existing successful deployment
          needsRebuild: false,
          framework: targetVersion.framework,
          nodeVersion: process.version,
          pnpmVersion: targetVersion.pnpmVersion || undefined,
          // Include all deployment details directly
          previewUrl: targetVersion.previewUrl,
          artifactUrl: targetVersion.artifactUrl,
          cfDeploymentId: targetVersion.cfDeploymentId,
          buildDurationMs: 0, // Rollback has no build time
          installDurationMs: 0,
          deployDurationMs: 0,
          outputSizeBytes: targetVersion.outputSizeBytes,
          artifactChecksum: targetVersion.artifactChecksum,
          // Copy AI session info from target version
          aiSessionId: targetVersion.aiSessionId,
          aiSessionCreatedAt: targetVersion.aiSessionCreatedAt,
          aiSessionLastUsedAt: targetVersion.aiSessionLastUsedAt,
          // Add semantic versioning metadata
          majorVersion,
          minorVersion,
          patchVersion,
          versionName,
          versionDescription,
          changeType: 'rollback',
          displayVersionNumber: displayVersionNumber.toString(),
          // Store the user's comment if provided
          userComment: comment || undefined
        }),
        // Can add more parallel operations here if needed
      ]);

      // Immediate phase: Update project status and preview URL
      await updateProjectConfig(projectId, {
        status: 'rollingBack',
        previewUrl: targetVersion.previewUrl,
        versionId: rollbackVersionId
      });

      // Fire-and-forget KV update - don't block response on this slow operation
      setLatestVersion(effectiveUserId, projectId, {
        latestVersionId: rollbackVersionId,
        previewUrl: targetVersion.previewUrl, // Reuse existing preview URL
        timestamp: Date.now(),
      }).catch(err => {
        console.error('[Rollback] KV update failed (non-critical):', err);
        // KV update failure is non-critical - rollback still succeeds
      });

      let job: any = null;

      // Queue background sync job if working directory sync is needed
      if (!skipWorkingDirectory) {
        job = await streamQueue.add('stream', {
          type: 'rollback',
          userId: effectiveUserId,
          projectId,
          rollbackVersionId,
          targetVersionId: versionToRestore,
          preRollbackState,
          selectiveFiles: undefined, // Future: selective file rollback
          prompt: `Rollback to ${targetVersionName}`, // Required field
          isInitialBuild: false // Required field
        }, {
          priority: 10,
          removeOnComplete: 10,
          removeOnFail: 50
        });
      } else {
        // If skipping working directory, mark rollback as complete immediately
        await updateProjectConfig(projectId, {
          status: 'deployed'
        });
      }

      const response = {
        success: true,
        message: 'Rollback initiated - preview updated immediately',
        rollbackVersionId,
        targetVersionId: versionToRestore,
        sourceVersionId: versionToRestore, // Include both for compatibility
        previewUrl: targetVersion.previewUrl,
        status: skipWorkingDirectory ? 'deployed' : 'rollingBack',
        jobId: job?.id,
        workingDirectory: {
          synced: skipWorkingDirectory,
          message: skipWorkingDirectory ? 'Working directory sync skipped' : 'Background sync queued',
          extractedFiles: 0
        },
        publishInfo: {
          isPublished: false,
          canPublish: true,
          publishEndpoint: `/projects/${projectId}/publish/${rollbackVersionId}`,
          notice: 'This rollback version is available for preview but not published. Use the publish endpoint to make it live.'
        }
      };

      // Fire-and-forget idempotency cache - don't block response on Redis
      if (idempotencyKey && response.success) {
        redis.setex(`rollback-idempotency:${idempotencyKey}`, 86400, JSON.stringify(response))
          .catch(err => console.error('[Rollback] Idempotency cache failed (non-critical):', err));
      }

      const endTime = Date.now();
      console.log(`[Rollback] Response sent in ${endTime - startTime}ms for ${projectId}`);

      return reply.send(response);

    } catch (error: any) {
      console.error('Error during rollback:', error);
      return reply.code(500).send({
        error: 'Rollback failed',
        details: error.message
      });
    } finally {
      // Release lock after queueing (not after completion)
      await redis.del(lockKey);
    }
  });

  // POST /v1/versions/:versionId/rebuild
  // Trigger a rebuild of a specific version
  app.post<{ Params: { versionId: string } }>('/v1/versions/:versionId/rebuild', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Params: { versionId: string } }>,
    reply: FastifyReply
  ) => {
    const { versionId } = request.params;

    // Verify signature - Expert feedback: handle header case and missing values
    const sig = request.headers['x-sheen-signature']?.toString() ?? '';
    const timestamp = request.headers['x-sheen-timestamp']?.toString() ?? '';
    const body = '';

    if (!sig || !timestamp || !validateTimestamp(timestamp) || !verifyHMACv1(body, timestamp, sig, VALIDATED_SHARED_SECRET)) {
      return reply.code(401).send({
        error: 'Invalid signature',
        serverTime: new Date().toISOString() // Expert feedback: Help debug clock skew
      });
    }

    try {
      const version = await getProjectVersion(versionId);
      if (!version) {
        return reply.code(404).send({ error: 'Version not found' });
      }

      // Mark version as needs rebuild
      await updateProjectVersion(versionId, {
        needsRebuild: true,
      });

      // Queue a rebuild job
      const job = await addBuildJob({
        userId: version.userId,
        projectId: version.projectId,
        prompt: version.prompt,
        baseVersionId: version.parentVersionId || undefined,
        framework: version.framework as any,
        isInitialBuild: false,
      });

      return reply.send({
        success: true,
        message: 'Rebuild queued',
        jobId: job.id,
        versionId,
      });
    } catch (error: any) {
      console.error('Error queueing rebuild:', error);
      return reply.code(500).send({
        error: 'Failed to queue rebuild',
        details: error.message
      });
    }
  });

  // GET /versions/:id1/diff/:id2
  // Get diff between two versions
  app.get<{ Params: { id1: string; id2: string }; Querystring: { mode?: 'patch' | 'stats' | 'visual' } }>('/v1/versions/:id1/diff/:id2', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{
      Params: { id1: string; id2: string };
      Querystring: { mode?: 'patch' | 'stats' | 'visual' };
    }>,
    reply: FastifyReply
  ) => {
    const { id1, id2 } = request.params;
    const { mode = 'patch' } = request.query;

    try {
      // Get both versions
      const version1 = await getProjectVersion(id1);
      const version2 = await getProjectVersion(id2);

      if (!version1 || !version2) {
        return reply.code(404).send({ error: 'One or both versions not found' });
      }

      // Verify they belong to the same project
      if (version1.userId !== version2.userId || version1.projectId !== version2.projectId) {
        return reply.code(400).send({ error: 'Versions belong to different projects' });
      }

      // Get project directory using centralized helper
      const projectDir = ProjectPaths.getProjectPath(version1.userId, version1.projectId);

      if (mode === 'visual') {
        // Visual diff would require screenshots - stub for now
        return reply.code(501).send({
          error: 'Visual diff not yet implemented',
          message: 'Visual diff will be available in a future update'
        });
      }

      // Get git diff
      const diffResult = await getDiff(projectDir, id1, id2);

      if (mode === 'stats') {
        return reply.send({
          success: true,
          fromVersion: id1,
          toVersion: id2,
          stats: diffResult.stats,
        });
      }

      // Default mode: patch
      reply.type('text/plain');
      return reply.send(diffResult.patch);
    } catch (error: any) {
      console.error('Error generating diff:', error);
      return reply.code(500).send({
        error: 'Failed to generate diff',
        details: error.message
      });
    }
  });

  // GET /v1/projects/:projectId/export
  // Export latest version of a project with signed URL redirect
  app.get<{ Params: { projectId: string }; Querystring: { userId: string } }>('/v1/projects/:projectId/export', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Querystring: { userId: string };
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;

    // Verify signature - Expert feedback: handle header case and missing values
    const sig = request.headers['x-sheen-signature']?.toString() ?? '';
    const timestamp = request.headers['x-sheen-timestamp']?.toString() ?? '';
    const body = '';

    if (!sig || !timestamp || !validateTimestamp(timestamp) || !verifyHMACv1(body, timestamp, sig, VALIDATED_SHARED_SECRET)) {
      return reply.code(401).send({
        error: 'Invalid signature',
        serverTime: new Date().toISOString() // Expert feedback: Help debug clock skew
      });
    }
    const { userId } = request.query;

    if (!userId || !projectId) {
      return reply.code(400).send({ error: 'userId and projectId are required' });
    }

    try {
      // Get latest version with artifact
      const latestVersion = await getLatestProjectVersion(userId, projectId);
      if (!latestVersion?.artifactUrl) {
        return reply.code(404).send({
          error: 'No artifact available',
          message: 'The latest version of this project has no downloadable artifact'
        });
      }

      // Check artifact size for download safety
      const artifactSize = latestVersion.artifactSize || latestVersion.outputSizeBytes || 0;

      if (artifactSize > MAX_DOWNLOAD_SIZE) {
        return reply.code(413).send({
          error: 'Artifact too large for download',
          message: `Artifact size (${formatFileSize(artifactSize)}) exceeds download limit (${formatFileSize(MAX_DOWNLOAD_SIZE)})`,
          size: artifactSize,
          limit: MAX_DOWNLOAD_SIZE,
          suggestion: 'Please rebuild the project with smaller assets or contact support for large project downloads'
        });
      }

      // Generate signed URL (24hr expiry)
      const downloadUrl = await generateR2SignedUrl(latestVersion.artifactUrl, '24h');

      // Add rate limit headers for intelligent client backoff
      reply.header('x-ratelimit-remaining', '45'); // Example: 45 requests remaining
      reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + 3600); // Reset in 1 hour

      return reply.send({
        success: true,
        downloadUrl,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        filename: `${projectId}-latest.zip`,
        size: artifactSize,
        version: {
          id: latestVersion.versionId,
          prompt: latestVersion.prompt,
          createdAt: latestVersion.createdAt
        }
      });
    } catch (error: any) {
      console.error('Error exporting project:', error);
      return reply.code(500).send({
        error: 'Failed to generate export URL',
        details: error.message
      });
    }
  });

  // GET /v1/versions/:versionId/download
  // Download specific version with signed URL redirect
  app.get<{ Params: { versionId: string }; Querystring: { userId: string } }>('/v1/versions/:versionId/download', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{
      Params: { versionId: string };
      Querystring: { userId: string };
    }>,
    reply: FastifyReply
  ) => {
    const { versionId } = request.params;

    // Verify signature - Expert feedback: handle header case and missing values
    const sig = request.headers['x-sheen-signature']?.toString() ?? '';
    const timestamp = request.headers['x-sheen-timestamp']?.toString() ?? '';
    const body = '';

    if (!sig || !timestamp || !validateTimestamp(timestamp) || !verifyHMACv1(body, timestamp, sig, VALIDATED_SHARED_SECRET)) {
      return reply.code(401).send({
        error: 'Invalid signature',
        serverTime: new Date().toISOString() // Expert feedback: Help debug clock skew
      });
    }
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      // Verify ownership and get version
      const version = await getProjectVersion(versionId);
      if (!version || version.userId !== userId) {
        return reply.code(404).send({ error: 'Version not found' });
      }

      if (!version.artifactUrl) {
        // Artifact not available - could suggest rebuild in the future
        return reply.code(404).send({
          error: 'Artifact not available',
          message: 'This version has no downloadable artifact',
          canRebuild: true,
          rebuildUrl: `/v1/versions/${versionId}/rebuild`
        });
      }

      // Check artifact size for download safety
      const artifactSize = version.artifactSize || version.outputSizeBytes || 0;

      if (artifactSize > MAX_DOWNLOAD_SIZE) {
        return reply.code(413).send({
          error: 'Artifact too large for download',
          message: `Artifact size (${formatFileSize(artifactSize)}) exceeds download limit (${formatFileSize(MAX_DOWNLOAD_SIZE)})`,
          size: artifactSize,
          limit: MAX_DOWNLOAD_SIZE,
          suggestion: 'Please contact support for large project downloads or rebuild with smaller assets'
        });
      }

      // Generate signed URL (24hr expiry)
      const downloadUrl = await generateR2SignedUrl(version.artifactUrl, '24h');

      // Add rate limit headers for intelligent client backoff
      reply.header('x-ratelimit-remaining', '45'); // Example: 45 requests remaining
      reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + 3600); // Reset in 1 hour

      return reply.send({
        success: true,
        downloadUrl,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        filename: `${version.projectId}-${versionId}.zip`,
        size: artifactSize,
        version: {
          id: version.versionId,
          prompt: version.prompt,
          createdAt: version.createdAt,
          projectId: version.projectId
        }
      });
    } catch (error: any) {
      console.error('Error downloading version:', error);
      return reply.code(500).send({
        error: 'Failed to generate download URL',
        details: error.message
      });
    }
  });


}
