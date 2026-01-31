/**
 * Project Files Route
 *
 * Provides file listing and content retrieval for the Generated Code Viewer.
 * Uses existing workspaceFileAccessService for secure file access.
 * Falls back to R2 artifacts when local filesystem is empty.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { workspaceFileAccessService } from '../services/workspaceFileAccessService';
import { workspacePathValidator } from '../services/workspacePathValidator';
import { SecurePathValidator } from '../utils/securePathValidator';
import { downloadArtifactFromR2 } from '../services/cloudflareR2';
import { getVersionByBuildId } from '../services/database';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { spawn } from 'child_process';

// ============================================================================
// Types
// ============================================================================

interface FileListItem {
  path: string;
  type: 'file' | 'directory';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  size?: number | undefined;
  language?: string | undefined;
  hash?: string | undefined;
}

interface GetFilesResponse {
  files: FileListItem[];
  totalCount: number;
  projectId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  buildId?: string | undefined;
}

interface GetFileResponse {
  path: string;
  content: string;
  language: string;
  size: number;
  lastModified: string;
  hash: string;
}

interface ProjectFilesParams {
  projectId: string;
}

interface ProjectFilesQuery {
  userId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  path?: string | undefined;
  buildId?: string | undefined;
}

// ============================================================================
// Language Detection
// ============================================================================

const LANGUAGE_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.json': 'json',
  '.xml': 'xml',
  '.svg': 'xml',

  // Backend
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',

  // Config
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.env': 'bash',

  // Other
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
};

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || 'text';
}

function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

// ============================================================================
// R2 Artifact Extraction with Security & Caching
// ============================================================================

// Security limits
const MAX_ARTIFACT_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB max artifact
const MAX_EXTRACTED_FILES = 10000; // Max files to list
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB max single file
const EXTRACTION_TIMEOUT_MS = 30000; // 30 seconds

// TTL cache for extracted artifacts (avoids repeated downloads)
interface CachedArtifact {
  extractDir: string;
  files: FileListItem[];
  createdAt: number;
  lastAccessed: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const artifactCache = new Map<string, CachedArtifact>();

// Concurrency control per buildId (prevent parallel extractions of same artifact)
const extractionLocks = new Map<string, Promise<CachedArtifact | null>>();

// Cleanup expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, cached] of artifactCache.entries()) {
    if (now - cached.lastAccessed > CACHE_TTL_MS) {
      console.log(`[ProjectFiles] Cache cleanup: removing ${key}`);
      // Clean up the temp directory
      fs.rm(cached.extractDir, { recursive: true, force: true }).catch(() => {});
      artifactCache.delete(key);
    }
  }
}, 60000); // Run every minute

/**
 * Normalize path to POSIX format and remove traversal attempts
 * Returns null if path is unsafe
 */
function sanitizeRelativePath(filePath: string): string | null {
  // Remove any leading/trailing whitespace
  let normalized = filePath.trim();

  // Convert backslashes to forward slashes
  normalized = normalized.replace(/\\/g, '/');

  // Remove any null bytes
  normalized = normalized.replace(/\0/g, '');

  // Split into segments and filter out dangerous ones
  const segments = normalized.split('/').filter(seg => {
    // Remove empty segments and current-dir references
    if (seg === '' || seg === '.') return false;
    // Block parent-dir traversal
    if (seg === '..') return false;
    return true;
  });

  // Reject if any segment looks suspicious
  for (const seg of segments) {
    // Block hidden files at root level for security
    if (seg.startsWith('.') && segments.indexOf(seg) === 0) {
      return null;
    }
  }

  // Reconstruct as POSIX path
  const result = segments.join('/');

  // Additional check: ensure no remaining traversal patterns
  if (result.includes('../') || result.includes('..\\')) {
    return null;
  }

  return result || null;
}

/**
 * Validate that a resolved path stays within the base directory
 */
function isPathWithinBase(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath) + path.sep;
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase) || resolvedTarget === path.resolve(basePath);
}

/**
 * Extract a tar.gz file to a directory with timeout
 */
async function extractTarGz(tarGzPath: string, targetDir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tar = spawn('tar', ['-xzf', tarGzPath, '-C', targetDir]);

    const timeout = setTimeout(() => {
      tar.kill('SIGTERM');
      resolve(false);
    }, EXTRACTION_TIMEOUT_MS);

    tar.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });

    tar.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * List files recursively in a directory (for extracted artifacts)
 * Returns files with POSIX-style paths
 */
async function listExtractedFiles(
  baseDir: string,
  relativePath: string = '',
  maxDepth: number = 10,
  currentDepth: number = 0,
  fileCount: { count: number } = { count: 0 }
): Promise<FileListItem[]> {
  if (currentDepth > maxDepth || fileCount.count >= MAX_EXTRACTED_FILES) {
    return [];
  }

  const files: FileListItem[] = [];
  const currentDir = path.join(baseDir, relativePath);

  // Security: verify we're still within baseDir
  if (!isPathWithinBase(baseDir, currentDir)) {
    console.warn(`[ProjectFiles] Path traversal attempt detected: ${currentDir}`);
    return [];
  }

  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (fileCount.count >= MAX_EXTRACTED_FILES) break;

      // Skip hidden files, node_modules, and symlinks
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      // Security: skip symlinks entirely
      if (entry.isSymbolicLink()) {
        console.warn(`[ProjectFiles] Skipping symlink: ${entry.name}`);
        continue;
      }

      // Use POSIX-style path separators for consistency
      const itemRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        files.push({
          path: itemRelativePath,
          type: 'directory',
        });
        fileCount.count++;

        const subFiles = await listExtractedFiles(
          baseDir,
          itemRelativePath,
          maxDepth,
          currentDepth + 1,
          fileCount
        );
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const fullPath = path.join(currentDir, entry.name);

        // Security: verify path is within base
        if (!isPathWithinBase(baseDir, fullPath)) {
          continue;
        }

        const stats = await fs.stat(fullPath);

        files.push({
          path: itemRelativePath,
          type: 'file',
          size: stats.size,
          language: detectLanguage(entry.name),
        });
        fileCount.count++;
      }
    }
  } catch (error) {
    console.warn(`[ProjectFiles] Error listing extracted directory ${currentDir}:`, error);
  }

  return files;
}

/**
 * Get or create cached artifact extraction
 * Handles concurrency to avoid duplicate downloads
 */
async function getOrExtractArtifact(
  userId: string,
  projectId: string,
  buildId: string
): Promise<CachedArtifact | null> {
  const cacheKey = `${userId}:${projectId}:${buildId}`;

  // Check cache first
  const cached = artifactCache.get(cacheKey);
  if (cached) {
    cached.lastAccessed = Date.now();
    console.log(`[ProjectFiles] Cache hit for ${cacheKey}`);
    return cached;
  }

  // Check if extraction is already in progress
  const existingLock = extractionLocks.get(cacheKey);
  if (existingLock) {
    console.log(`[ProjectFiles] Waiting for existing extraction: ${cacheKey}`);
    return existingLock;
  }

  // Start new extraction with lock
  const extractionPromise = (async (): Promise<CachedArtifact | null> => {
    const tempDir = path.join(os.tmpdir(), `project-files-${buildId}-${Date.now()}`);
    const artifactPath = path.join(tempDir, 'artifact.tar.gz');
    const extractDir = path.join(tempDir, 'extracted');

    try {
      console.log(`[ProjectFiles] Starting extraction for ${cacheKey}`);

      // Look up version by buildId (checks project_build_metrics first, then project_versions)
      const version = await getVersionByBuildId(buildId);
      if (!version) {
        console.log(`[ProjectFiles] No version found for buildId ${buildId}`);
        return null;
      }

      // CRITICAL: Authorization check - verify build belongs to this user/project
      if (version.projectId !== projectId) {
        console.error(`[ProjectFiles] Authorization failed: version.projectId (${version.projectId}) !== projectId (${projectId})`);
        return null;
      }
      if (version.userId !== userId) {
        console.error(`[ProjectFiles] Authorization failed: version.userId (${version.userId}) !== userId (${userId})`);
        return null;
      }

      // Create temp directories
      await fs.mkdir(tempDir, { recursive: true });
      await fs.mkdir(extractDir, { recursive: true });

      // Download artifact from R2 using versionId (not buildId) - R2 artifacts are keyed by versionId
      console.log(`[ProjectFiles] Downloading artifact with versionId: ${version.versionId}`);
      await downloadArtifactFromR2(userId, projectId, version.versionId, artifactPath);

      // Check artifact size
      const artifactStats = await fs.stat(artifactPath);
      if (artifactStats.size > MAX_ARTIFACT_SIZE_BYTES) {
        console.error(`[ProjectFiles] Artifact too large: ${artifactStats.size} bytes`);
        return null;
      }

      console.log(`[ProjectFiles] Downloaded artifact (${artifactStats.size} bytes)`);

      // Extract the tar.gz
      const extractSuccess = await extractTarGz(artifactPath, extractDir);
      if (!extractSuccess) {
        console.error(`[ProjectFiles] Failed to extract artifact`);
        return null;
      }

      // Remove the tar.gz to save space
      await fs.unlink(artifactPath).catch(() => {});

      console.log(`[ProjectFiles] Extracted artifact to ${extractDir}`);

      // List files from extracted directory
      const files = await listExtractedFiles(extractDir);

      console.log(`[ProjectFiles] Found ${files.length} files in R2 artifact`);

      // Cache the result
      const cachedArtifact: CachedArtifact = {
        extractDir,
        files,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
      };

      artifactCache.set(cacheKey, cachedArtifact);
      return cachedArtifact;

    } catch (error) {
      console.error(`[ProjectFiles] Error extracting artifact:`, error);
      // Clean up on error
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      return null;
    }
  })();

  // Register lock
  extractionLocks.set(cacheKey, extractionPromise);

  try {
    return await extractionPromise;
  } finally {
    extractionLocks.delete(cacheKey);
  }
}

/**
 * Get files from R2 artifact for a specific build/version
 * Returns null if artifact not found, authorization fails, or extraction fails
 */
async function getFilesFromR2Artifact(
  userId: string,
  projectId: string,
  buildId: string
): Promise<FileListItem[] | null> {
  console.log(`[ProjectFiles] Local files empty, trying R2 artifact for build ${buildId}`);

  const cached = await getOrExtractArtifact(userId, projectId, buildId);
  if (!cached) {
    return null;
  }

  return cached.files;
}

/**
 * Read a file from R2 artifact with path traversal protection
 */
async function readFileFromR2Artifact(
  userId: string,
  projectId: string,
  buildId: string,
  filePath: string
): Promise<{ content: string; size: number; mtime: Date; hash: string } | null> {
  // CRITICAL: Sanitize the file path to prevent traversal
  const safePath = sanitizeRelativePath(filePath);
  if (!safePath) {
    console.error(`[ProjectFiles] Path traversal attempt blocked: ${filePath}`);
    return null;
  }

  const cached = await getOrExtractArtifact(userId, projectId, buildId);
  if (!cached) {
    return null;
  }

  try {
    // Build the full path using sanitized relative path
    const fullPath = path.join(cached.extractDir, safePath);

    // CRITICAL: Verify the resolved path is within extraction directory
    if (!isPathWithinBase(cached.extractDir, fullPath)) {
      console.error(`[ProjectFiles] Path escape attempt blocked: ${fullPath}`);
      return null;
    }

    const stats = await fs.stat(fullPath);

    // Check file size limit
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      console.error(`[ProjectFiles] File too large: ${stats.size} bytes`);
      return null;
    }

    // Security: ensure it's a regular file, not a symlink
    if (!stats.isFile()) {
      console.error(`[ProjectFiles] Not a regular file: ${fullPath}`);
      return null;
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const hash = generateContentHash(content);

    return {
      content,
      size: stats.size,
      mtime: stats.mtime,
      hash,
    };

  } catch (error) {
    console.error(`[ProjectFiles] Error reading file from R2:`, error);
    return null;
  }
}

// ============================================================================
// Recursive File Listing
// ============================================================================

async function listFilesRecursively(
  projectRoot: string,
  relativePath: string = '',
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<FileListItem[]> {
  if (currentDepth > maxDepth) {
    return [];
  }

  const files: FileListItem[] = [];
  const currentPath = relativePath || '.';

  try {
    const result = await workspacePathValidator.listDirectory(projectRoot, currentPath);

    for (const file of result.files) {
      const itemRelativePath = path.relative(projectRoot, file.path);

      if (file.isDirectory) {
        // Add directory entry
        files.push({
          path: itemRelativePath,
          type: 'directory',
        });

        // Recurse into directory
        const subFiles = await listFilesRecursively(
          projectRoot,
          itemRelativePath,
          maxDepth,
          currentDepth + 1
        );
        files.push(...subFiles);
      } else {
        // Add file entry
        files.push({
          path: itemRelativePath,
          type: 'file',
          size: file.size,
          language: detectLanguage(file.path),
        });
      }
    }
  } catch (error) {
    // Directory might not exist or be inaccessible
    console.warn(`[ProjectFiles] Error listing directory ${currentPath}:`, error);
  }

  return files;
}

// ============================================================================
// Routes
// ============================================================================

export async function projectFilesRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();

  /**
   * GET /api/v1/projects/:projectId/files
   *
   * List all files in a project OR get a single file's content.
   * - Without ?path= : Returns file tree
   * - With ?path=src/App.tsx : Returns file content
   */
  fastify.get<{
    Params: ProjectFilesParams;
    Querystring: ProjectFilesQuery;
  }>('/api/v1/projects/:projectId/files', {
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
          userId: { type: 'string' },
          path: { type: 'string' },
          buildId: { type: 'string' }
        },
        required: ['userId']
      }
    }
  }, async (
    request: FastifyRequest<{
      Params: ProjectFilesParams;
      Querystring: ProjectFilesQuery;
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const { userId, path: filePath, buildId } = request.query;

    // Validate required parameters
    if (!userId) {
      return reply.code(400).send({
        error: 'Missing required parameter: userId',
        code: 'MISSING_USER_ID'
      });
    }

    // Get project root using secure path validator
    const projectRoot = SecurePathValidator.getProjectRoot(userId, projectId);

    // Check if project directory exists
    let localDirExists = false;
    try {
      const stats = await fs.stat(projectRoot);
      localDirExists = stats.isDirectory();
    } catch {
      localDirExists = false;
    }

    // If local directory doesn't exist and no buildId, return 404
    // With buildId, we can try to get files from R2
    if (!localDirExists && !buildId) {
      return reply.code(404).send({
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND'
      });
    }

    // If path is provided, return single file content
    if (filePath) {
      let fileContent: string | null = null;
      let fileSize = 0;
      let fileMtime = new Date();
      let fileEtag: string | undefined;

      // Try local filesystem first if directory exists
      if (localDirExists) {
        try {
          const fileResult = await workspaceFileAccessService.readFile(
            projectRoot,
            filePath,
            userId, // Use userId as "advisorId" for rate limiting
            {}
          );

          // Check if file was not modified (304 response)
          if ('notModified' in fileResult) {
            return reply.code(304).send();
          }

          fileContent = fileResult.content;
          fileSize = fileResult.size;
          fileMtime = fileResult.mtime;
          fileEtag = fileResult.etag;

        } catch (error: any) {
          // Handle non-404 errors immediately
          if (error.message?.includes('Rate limit')) {
            return reply.code(429).send({
              error: 'Rate limit exceeded',
              code: 'RATE_LIMIT_EXCEEDED'
            });
          }

          if (error.message?.includes('access denied') || error.message?.includes('traversal')) {
            return reply.code(403).send({
              error: 'Access denied',
              code: 'ACCESS_DENIED'
            });
          }

          // File not found locally - will try R2 below
          console.log(`[ProjectFiles] File ${filePath} not found locally, will try R2`);
        }
      }

      // If file not found locally and we have a buildId, try R2 artifact
      let fileHash: string | undefined;
      if (fileContent === null && buildId) {
        console.log(`[ProjectFiles] Trying R2 for file ${filePath} with buildId ${buildId}`);
        const r2Result = await readFileFromR2Artifact(userId, projectId, buildId, filePath);

        if (r2Result) {
          fileContent = r2Result.content;
          fileSize = r2Result.size;
          fileMtime = r2Result.mtime;
          fileHash = r2Result.hash;
          // Use hash as ETag for R2 files
          fileEtag = `"${r2Result.hash}"`;
          console.log(`[ProjectFiles] Found file ${filePath} in R2 artifact`);
        }
      }

      // If still no file content, return 404
      if (fileContent === null) {
        return reply.code(404).send({
          error: 'File not found',
          code: 'FILE_NOT_FOUND',
          message: `File ${filePath} not found in local filesystem or R2 artifact`
        });
      }

      // Calculate content hash (use pre-computed if from R2)
      const hash = fileHash || generateContentHash(fileContent);

      // Check If-None-Match for conditional GET (304 support)
      const ifNoneMatch = request.headers['if-none-match'];
      if (ifNoneMatch && fileEtag && ifNoneMatch === fileEtag) {
        return reply.code(304).send();
      }

      const response: GetFileResponse = {
        path: filePath,
        content: fileContent,
        language: detectLanguage(filePath),
        size: fileSize,
        lastModified: fileMtime.toISOString(),
        hash
      };

      // Set caching headers (always set ETag for conditional GET support)
      if (fileEtag) {
        reply.header('ETag', fileEtag);
      } else {
        // Generate ETag from hash for local files too
        reply.header('ETag', `"${hash}"`);
      }
      reply.header('Last-Modified', fileMtime.toUTCString());

      // Immutable caching if buildId is provided (especially for R2 artifacts)
      if (buildId) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        reply.header('Cache-Control', 'private, no-cache');
      }

      return response;
    }

    // No path provided - return file tree
    try {
      // First try local filesystem if directory exists
      let files: FileListItem[] = [];

      if (localDirExists) {
        files = await listFilesRecursively(projectRoot);
      }

      // If local files are empty and we have a buildId, try R2 artifact
      if (files.length === 0 && buildId) {
        console.log(`[ProjectFiles] Local files empty for project ${projectId}, trying R2 with buildId ${buildId}`);
        const r2Files = await getFilesFromR2Artifact(userId, projectId, buildId);

        if (r2Files && r2Files.length > 0) {
          files = r2Files;
          console.log(`[ProjectFiles] Found ${files.length} files from R2 artifact`);
        } else {
          console.log(`[ProjectFiles] No files found in R2 artifact either`);
        }
      }

      const response: GetFilesResponse = {
        files,
        totalCount: files.length,
        projectId,
        buildId
      };

      // Set caching headers for file list
      if (buildId) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        reply.header('Cache-Control', 'private, max-age=30');
      }

      return response;

    } catch (error: any) {
      console.error('[ProjectFiles] Error listing files:', error);
      return reply.code(500).send({
        error: 'Failed to list project files',
        code: 'LIST_FILES_FAILED',
        message: error.message
      });
    }
  });
}
