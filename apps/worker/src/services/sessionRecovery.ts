import { Redis } from 'ioredis';
import * as fs from 'fs/promises';
import * as path from 'path';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

export interface SessionCheckpoint {
  sessionId: string;
  buildId: string;
  projectPath: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  filesCreated?: string[] | undefined; // Legacy: was misnamed, kept for backward compatibility
  existingFilesAtCheckpoint?: string[] | undefined; // Files present at checkpoint time (for resumption)
  filesCreatedCount?: number | undefined; // Count of files created by Claude
  filesModifiedCount?: number | undefined; // Count of files modified by Claude
  lastActivity?: number | undefined;
  tokenUsage?: any | undefined;
  cost?: number | undefined;
}

const SESSION_TTL = 3600; // 1 hour

/**
 * Save Claude session checkpoint for recovery
 */
export async function saveSessionCheckpoint(
  buildId: string,
  checkpoint: Partial<SessionCheckpoint>
): Promise<void> {
  const key = `claude:session:${buildId}`;
  const data = {
    ...checkpoint,
    buildId,
    lastActivity: Date.now()
  };
  
  await redis.setex(key, SESSION_TTL, JSON.stringify(data));
  console.log(`[Session Recovery] Saved checkpoint for build ${buildId}`);
}

/**
 * Get session checkpoint for recovery
 */
export async function getSessionCheckpoint(
  buildId: string
): Promise<SessionCheckpoint | null> {
  const key = `claude:session:${buildId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return null;
  }
  
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('[Session Recovery] Failed to parse checkpoint:', error);
    return null;
  }
}

/**
 * List files created in project directory
 */
export async function getExistingProjectFiles(
  projectPath: string
): Promise<string[]> {
  const files: string[] = [];
  
  async function scanDir(dirPath: string, basePath: string = '') {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.join(basePath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules and .git
          if (entry.name !== 'node_modules' && entry.name !== '.git') {
            await scanDir(fullPath, relativePath);
          }
        } else {
          files.push(relativePath);
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }
  }
  
  await scanDir(projectPath);
  return files;
}

/**
 * Update checkpoint with new files
 */
export async function updateSessionFiles(
  buildId: string,
  newFiles: string[]
): Promise<void> {
  const checkpoint = await getSessionCheckpoint(buildId);
  if (!checkpoint) return;

  const existingFiles = checkpoint.filesCreated || checkpoint.existingFilesAtCheckpoint || [];
  const updatedFiles = [...new Set([...existingFiles, ...newFiles])];

  await saveSessionCheckpoint(buildId, {
    ...checkpoint,
    filesCreated: updatedFiles
  });
}

/**
 * Mark session as completed
 */
export async function completeSession(buildId: string): Promise<void> {
  const key = `claude:session:${buildId}`;
  await redis.del(key);
  console.log(`[Session Recovery] Completed session for build ${buildId}`);
}