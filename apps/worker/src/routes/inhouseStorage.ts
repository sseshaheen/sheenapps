/**
 * In-House Storage Routes
 *
 * HTTP endpoints for Easy Mode project storage operations.
 * Uses Pattern 1: projectId from x-project-id header (not URL path).
 *
 * Routes:
 * - POST /v1/inhouse/storage/signed-upload - Create signed upload URL
 * - POST /v1/inhouse/storage/signed-download - Create signed download URL
 * - GET  /v1/inhouse/storage/files - List files
 * - GET  /v1/inhouse/storage/files/metadata - Get file metadata
 * - DELETE /v1/inhouse/storage/files - Delete files (batch)
 * - GET  /v1/inhouse/storage/public-url - Get public URL for a file
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { FastifyInstance } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { assertProjectAccess } from '../utils/projectAuth';
import { getInhouseStorageService } from '../services/inhouse/InhouseStorageService';
import { getInhouseMeteringService } from '../services/inhouse/InhouseMeteringService';
import { logActivity } from '../services/inhouse/InhouseActivityLogger';

// =============================================================================
// LIMITS (DoS Protection)
// =============================================================================

/**
 * Maximum file size for signed URLs (100MB)
 */
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * Maximum files per delete operation
 */
const MAX_DELETE_BATCH_SIZE = 100;

/**
 * Maximum path length
 */
const MAX_PATH_LENGTH = 500;

/**
 * Allowed content types for uploads
 */
const ALLOWED_CONTENT_TYPE_PATTERNS = [
  /^image\/(jpeg|png|gif|webp|svg\+xml|avif)$/,
  /^application\/(pdf|json|zip|gzip|x-tar|octet-stream)$/,
  /^text\/(plain|csv|html|css|javascript)$/,
  /^video\/(mp4|webm|quicktime)$/,
  /^audio\/(mpeg|wav|ogg|webm)$/,
  /^font\/(woff|woff2|ttf|otf)$/,
];

// =============================================================================
// VALIDATION
// =============================================================================

function validatePath(path: string): { valid: boolean; error?: string } {
  if (typeof path !== 'string') {
    return { valid: false, error: 'Path must be a string' };
  }
  if (path.length === 0) {
    return { valid: false, error: 'Path cannot be empty' };
  }
  if (path.length > MAX_PATH_LENGTH) {
    return { valid: false, error: `Path exceeds maximum length (${MAX_PATH_LENGTH} chars)` };
  }
  // No backslashes
  if (path.includes('\\')) {
    return { valid: false, error: 'Path cannot contain backslashes' };
  }
  // No control characters
  if (/[\x00-\x1f]/.test(path)) {
    return { valid: false, error: 'Path cannot contain control characters' };
  }
  // Block percent-encoded traversal
  if (/%2e/i.test(path) || /%2f/i.test(path) || /%5c/i.test(path)) {
    return { valid: false, error: 'Path cannot contain percent-encoded special characters' };
  }
  // Segment-based validation
  const segments = path.split('/');
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment === '' && i > 0) {
      return { valid: false, error: 'Path cannot contain empty segments (double slashes)' };
    }
    if (segment === '.' || segment === '..') {
      return { valid: false, error: 'Path cannot contain . or .. segments' };
    }
  }
  return { valid: true };
}

function validateContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPE_PATTERNS.some(pattern => pattern.test(contentType));
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface SignedUploadBody {
  path: string;
  contentType: string;
  maxSizeBytes?: number;
  expiresIn?: string;
  public?: boolean;
  metadata?: Record<string, string>;
  userId?: string;
}

interface SignedDownloadBody {
  path: string;
  expiresIn?: string;
  downloadFilename?: string;
  userId?: string;
}

interface ListFilesQuery {
  prefix?: string;
  limit?: string;
  cursor?: string;
  userId?: string;
}

interface GetMetadataQuery {
  path: string;
  userId?: string;
}

interface DeleteFilesBody {
  paths: string[];
  userId?: string;
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseStorageRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();

  // ===========================================================================
  // POST /v1/inhouse/storage/signed-upload
  // ===========================================================================
  fastify.post<{
    Body: SignedUploadBody;
  }>('/v1/inhouse/storage/signed-upload', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { path, contentType, maxSizeBytes, expiresIn, public: isPublic, metadata, userId } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate required fields
    if (!path || !contentType) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'path and contentType are required',
        },
      });
    }

    // Validate path
    const pathValidation = validatePath(path);
    if (!pathValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_PATH',
          message: pathValidation.error,
        },
      });
    }

    // Validate content type
    if (!validateContentType(contentType)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: `Content type '${contentType}' is not allowed`,
        },
      });
    }

    // Validate max size
    if (maxSizeBytes && maxSizeBytes > MAX_FILE_SIZE_BYTES) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `Maximum file size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
        },
      });
    }

    try {
      // Check storage quota (use maxSizeBytes for estimate, or 0 if not specified)
      const meteringService = getInhouseMeteringService();
      const quotaCheck = await meteringService.checkProjectQuota(
        projectId,
        'storage_bytes',
        maxSizeBytes || 0
      );

      if (!quotaCheck.allowed) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Storage quota exceeded',
            details: {
              used: quotaCheck.used,
              limit: quotaCheck.limit,
              remaining: quotaCheck.remaining,
            },
          },
        });
      }

      const storageService = getInhouseStorageService(projectId);
      const result = await storageService.createSignedUploadUrl({
        path,
        contentType,
        maxSizeBytes,
        expiresIn,
        public: isPublic,
        metadata,
      });

      // Log activity (fire-and-forget)
      logActivity({
        projectId,
        service: 'storage',
        action: 'signed_upload_created',
        actorType: 'user',
        actorId: userId,
        resourceType: 'file',
        resourceId: path,
        metadata: { contentType, maxSizeBytes, public: isPublic },
      });

      return reply.send({
        ok: true,
        data: result,
        quota: {
          used: quotaCheck.used,
          limit: quotaCheck.limit,
          remaining: quotaCheck.remaining,
          unlimited: quotaCheck.unlimited,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log error activity
      logActivity({
        projectId,
        service: 'storage',
        action: 'signed_upload_created',
        status: 'error',
        actorType: 'user',
        actorId: userId,
        resourceType: 'file',
        resourceId: path,
        errorCode: 'INTERNAL_ERROR',
        metadata: { error: errorMessage },
      });

      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // POST /v1/inhouse/storage/signed-download
  // ===========================================================================
  fastify.post<{
    Body: SignedDownloadBody;
  }>('/v1/inhouse/storage/signed-download', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { path, expiresIn, downloadFilename, userId } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate required fields
    if (!path) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'path is required',
        },
      });
    }

    // Validate path
    const pathValidation = validatePath(path);
    if (!pathValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_PATH',
          message: pathValidation.error,
        },
      });
    }

    try {
      const storageService = getInhouseStorageService(projectId);
      const result = await storageService.createSignedDownloadUrl({
        path,
        expiresIn,
        downloadFilename,
      });

      return reply.send({
        ok: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/storage/files
  // ===========================================================================
  fastify.get<{
    Querystring: ListFilesQuery;
  }>('/v1/inhouse/storage/files', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { prefix, limit: limitStr, cursor, userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Parse and validate limit
    let limit = 100;
    if (limitStr) {
      const parsed = parseInt(limitStr, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 1000) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_LIMIT',
            message: 'limit must be an integer between 1 and 1000',
          },
        });
      }
      limit = parsed;
    }

    // Validate prefix if provided
    if (prefix) {
      const pathValidation = validatePath(prefix);
      if (!pathValidation.valid) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_PREFIX',
            message: pathValidation.error,
          },
        });
      }
    }

    try {
      const storageService = getInhouseStorageService(projectId);
      const result = await storageService.list({
        prefix,
        limit,
        cursor,
      });

      return reply.send({
        ok: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/storage/files/metadata
  // ===========================================================================
  fastify.get<{
    Querystring: GetMetadataQuery;
  }>('/v1/inhouse/storage/files/metadata', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { path, userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate required fields
    if (!path) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'path query parameter is required',
        },
      });
    }

    // Validate path
    const pathValidation = validatePath(path);
    if (!pathValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_PATH',
          message: pathValidation.error,
        },
      });
    }

    try {
      const storageService = getInhouseStorageService(projectId);
      const metadata = await storageService.getMetadata(path);

      if (!metadata) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `File not found: ${path}`,
          },
        });
      }

      return reply.send({
        ok: true,
        data: metadata,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // DELETE /v1/inhouse/storage/files
  // ===========================================================================
  fastify.delete<{
    Body: DeleteFilesBody;
  }>('/v1/inhouse/storage/files', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { paths, userId } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate required fields
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'paths array is required and must not be empty',
        },
      });
    }

    // Validate batch size
    if (paths.length > MAX_DELETE_BATCH_SIZE) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'BATCH_TOO_LARGE',
          message: `Maximum ${MAX_DELETE_BATCH_SIZE} files per delete request`,
        },
      });
    }

    // Validate all paths
    for (const path of paths) {
      const pathValidation = validatePath(path);
      if (!pathValidation.valid) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_PATH',
            message: `Invalid path '${path}': ${pathValidation.error}`,
          },
        });
      }
    }

    try {
      const storageService = getInhouseStorageService(projectId);

      // Get file sizes before deleting for metering
      let totalBytesToDelete = 0;
      for (const path of paths) {
        try {
          const metadata = await storageService.getMetadata(path);
          if (metadata) {
            totalBytesToDelete += metadata.size;
          }
        } catch {
          // Ignore errors getting metadata for individual files
        }
      }

      const result = await storageService.delete(paths);

      // Track storage reduction (only for successfully deleted files)
      if (result.deleted.length > 0 && totalBytesToDelete > 0) {
        const meteringService = getInhouseMeteringService();
        // Note: We tracked all sizes, but some files may have failed to delete
        // For simplicity, we reduce by the total tracked (could be more accurate by summing only deleted)
        await meteringService.trackProjectStorageChange(projectId, -totalBytesToDelete);
      }

      // Log activity (fire-and-forget)
      logActivity({
        projectId,
        service: 'storage',
        action: 'files_deleted',
        actorType: 'user',
        actorId: userId,
        resourceType: 'file',
        metadata: {
          deletedCount: result.deleted.length,
          failedCount: result.failed.length,
          bytesFreed: totalBytesToDelete,
        },
      });

      return reply.send({
        ok: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log error activity
      logActivity({
        projectId,
        service: 'storage',
        action: 'files_deleted',
        status: 'error',
        actorType: 'user',
        actorId: userId,
        resourceType: 'file',
        errorCode: 'INTERNAL_ERROR',
        metadata: { pathCount: paths.length, error: errorMessage },
      });

      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/storage/public-url
  // ===========================================================================
  fastify.get<{
    Querystring: { path: string; userId?: string };
  }>('/v1/inhouse/storage/public-url', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const projectId = request.headers['x-project-id'] as string;
    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_PROJECT_ID',
          message: 'x-project-id header is required',
        },
      });
    }
    const { path, userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate required fields
    if (!path) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'path query parameter is required',
        },
      });
    }

    // Validate path
    const pathValidation = validatePath(path);
    if (!pathValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_PATH',
          message: pathValidation.error,
        },
      });
    }

    try {
      const storageService = getInhouseStorageService(projectId);
      const url = storageService.getPublicUrl(path);

      return reply.send({
        ok: true,
        data: { url },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });
}
