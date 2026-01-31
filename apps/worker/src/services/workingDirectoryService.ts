import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { downloadArtifactFromR2, downloadFromR2 } from './cloudflareR2';
import { getProjectVersion } from './database';
import { pool } from './database';
import { getWorkingDirectoryAuditor } from './workingDirectoryAudit';

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
interface WorkingDirectorySyncResult {
  success: boolean;
  message: string;
  extractedFiles?: number | undefined;
  gitCommit?: string | undefined;
  error?: string | undefined;
}

interface WorkingDirectoryStatus {
  projectId: string;
  currentVersionId?: string | undefined;
  publishedVersionId?: string | undefined;
  isInSync: boolean;
  isDirty: boolean;
  uncommittedChanges: string[];
  syncRecommendation: string;
}

interface SyncLockResult {
  acquired: boolean;
  lockFile?: string | undefined;
  error?: string | undefined;
}

/**
 * Service for managing working directory synchronization with published versions
 * @internal Working directory operations are now handled automatically by the platform.
 * External callers should use publication and rollback endpoints instead.
 */
export class WorkingDirectoryService {
  private projectPath: string;
  private auditor = getWorkingDirectoryAuditor();
  private readonly SHEEN_DIR = '.sheenapps-project';
  private readonly ACTIVE_ARTIFACT_FILE = 'active-artifact';

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Acquire sync lock to prevent race conditions
   * Expert feedback: serialize concurrent sync requests
   */
  private async acquireSyncLock(userId: string, projectId: string): Promise<SyncLockResult> {
    const lockFile = path.join(os.tmpdir(), `sync-lock-${userId}-${projectId}.lock`);
    
    try {
      // Try to create lock file exclusively
      await fs.writeFile(lockFile, `${process.pid}-${Date.now()}`, { flag: 'wx' });
      return { acquired: true, lockFile };
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // Check if lock is stale (>5 minutes old)
        try {
          const stats = await fs.stat(lockFile);
          const lockAge = Date.now() - stats.mtime.getTime();
          
          if (lockAge > 5 * 60 * 1000) { // 5 minutes
            console.log(`[Working Directory] Removing stale lock file: ${lockFile}`);
            await fs.unlink(lockFile);
            
            // Try again
            await fs.writeFile(lockFile, `${process.pid}-${Date.now()}`, { flag: 'wx' });
            return { acquired: true, lockFile };
          }
          
          return { 
            acquired: false, 
            error: 'Another sync operation is in progress. Please wait and try again.' 
          };
        } catch (statError) {
          return { 
            acquired: false, 
            error: 'Failed to check lock file status' 
          };
        }
      }
      
      return { 
        acquired: false, 
        error: `Failed to acquire sync lock: ${error.message}` 
      };
    }
  }

  /**
   * Release sync lock
   */
  private async releaseSyncLock(lockFile: string): Promise<void> {
    try {
      await fs.unlink(lockFile);
    } catch (error) {
      console.warn(`[Working Directory] Failed to release lock file ${lockFile}:`, error);
    }
  }

  /**
   * Extract artifact files to working directory (used for rollbacks and sync)
   */
  async extractArtifactToWorkingDirectory(
    userId: string,
    projectId: string,
    versionId: string,
    syncSource: 'rollback' | 'manual_sync' | 'publication_sync' = 'manual_sync'
  ): Promise<WorkingDirectorySyncResult> {
    const startTime = Date.now();
    
    // Expert feedback: Race condition protection
    const lock = await this.acquireSyncLock(userId, projectId);
    if (!lock.acquired) {
      // Audit the lock failure
      await this.auditor.logSync({
        projectId,
        userId,
        versionId,
        action: 'working_dir_lock_failed',
        elapsedMs: Date.now() - startTime,
        syncResult: 'blocked',
        syncSource,
        lockConflict: true,
        errorMessage: lock.error || 'Could not acquire sync lock'
      });
      
      return {
        success: false,
        message: 'Sync operation in progress',
        error: lock.error || 'Could not acquire sync lock'
      };
    }

    try {
      // Get version info
      const version = await getProjectVersion(versionId);
      if (!version) {
        return {
          success: false,
          message: 'Version not found',
          error: 'Version not found'
        };
      }

      if (!version.artifactUrl) {
        return {
          success: false,
          message: 'No artifact available for this version',
          error: 'No artifact URL'
        };
      }

      // Create temp directory for extraction
      const tempDir = path.join(os.tmpdir(), `extract-${versionId}`);
      const zipPath = path.join(tempDir, 'artifact.tar.gz');
      
      await fs.mkdir(tempDir, { recursive: true });

      // Download artifact using the actual artifact URL from the version record
      // This is critical for rollbacks which reuse the target version's artifact
      console.log(`[Working Directory] Downloading artifact for version ${versionId}...`);
      console.log(`[Working Directory] Using artifact URL: ${version.artifactUrl}`);
      
      // Check if artifactUrl is a full URL or just a key
      if (version.artifactUrl.startsWith('http')) {
        // It's a full public URL - try downloading directly first
        console.log(`[Working Directory] Downloading from public URL: ${version.artifactUrl}`);
        
        try {
          // Try direct download from public URL
          const response = await fetch(version.artifactUrl);
          
          if (response.ok) {
            const buffer = await response.buffer();
            await fs.writeFile(zipPath, buffer);
            console.log(`[Working Directory] Successfully downloaded artifact from public URL`);
          } else {
            console.log(`[Working Directory] Public URL download failed (${response.status}), falling back to R2 API...`);
            
            // Extract key from URL and try R2 API
            const urlParts = version.artifactUrl.split('/dev-sheenapps-builder-artifacts/');
            if (urlParts.length === 2) {
              const r2Key = urlParts[1]!; // Safe: length check guarantees existence
              console.log(`[Working Directory] Trying R2 API with key: ${r2Key}`);
              await downloadFromR2(r2Key, zipPath);
              console.log(`[Working Directory] Successfully downloaded artifact from R2 API`);
            } else {
              // Fallback to legacy method
              console.log(`[Working Directory] Unexpected URL format, trying legacy method...`);
              await downloadArtifactFromR2(userId, projectId, versionId, zipPath);
            }
          }
        } catch (error) {
          console.error(`[Working Directory] Public URL download error:`, error);
          // Try legacy method as last resort - use the actual artifact URL's version ID
          const urlMatch = version.artifactUrl.match(/\/([A-Z0-9]{26})\.zip$/);
          const targetVersionId = urlMatch?.[1] ?? versionId;
          console.log(`[Working Directory] Falling back to legacy method with version ID: ${targetVersionId}`);
          await downloadArtifactFromR2(userId, projectId, targetVersionId, zipPath);
        }
      } else {
        // It's an R2 key - use the R2 download function directly
        console.log(`[Working Directory] Downloading from R2 key: ${version.artifactUrl}`);
        await downloadFromR2(version.artifactUrl, zipPath);
        console.log(`[Working Directory] Successfully downloaded artifact from R2`);
      }

      // Ensure project directory exists
      await fs.mkdir(this.projectPath, { recursive: true });

      // Extract tar.gz to working directory
      console.log(`[Working Directory] Extracting tar.gz to ${this.projectPath}...`);
      const extractResult = await this.extractTarGzToDirectory(zipPath, this.projectPath);

      // Clean up temp files
      await fs.rm(tempDir, { recursive: true, force: true });

      if (!extractResult.success) {
        return {
          success: false,
          message: 'Failed to extract artifact',
          error: extractResult.error
        };
      }

      // Update .sheen/active-artifact marker
      await this.updateActiveArtifactMarker(versionId, version.artifactChecksum || '');

      // Update git if it's a git repository
      let gitCommit: string | undefined;
      if (await this.isGitRepository()) {
        const gitResult = await this.updateGitState(versionId);
        gitCommit = gitResult.commit;
      }

      const result = {
        success: true,
        message: `Working directory updated with version ${version.versionId}`,
        extractedFiles: extractResult.extractedFiles,
        gitCommit
      };

      // Audit successful sync - exactly what your teammate suggested!
      await this.auditor.logSync({
        projectId,
        userId,
        versionId,
        action: 'working_dir_sync',
        elapsedMs: Date.now() - startTime,
        syncResult: 'success',
        extractedFiles: extractResult.extractedFiles,
        filesWritten: extractResult.extractedFiles,
        gitCommit,
        syncSource
      });

      return result;
    } catch (error) {
      console.error('[Working Directory] Extract failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Audit failed sync
      await this.auditor.logSync({
        projectId,
        userId,
        versionId,
        action: 'working_dir_sync',
        elapsedMs: Date.now() - startTime,
        syncResult: 'failure',
        syncSource,
        errorMessage,
        securityRejection: errorMessage.includes('Security validation failed')
      });
      
      return {
        success: false,
        message: 'Failed to extract artifact to working directory',
        error: errorMessage
      };
    } finally {
      // Always release the lock
      if (lock.lockFile) {
        await this.releaseSyncLock(lock.lockFile);
      }
    }
  }

  /**
   * Get working directory synchronization status
   */
  async getWorkingDirectoryStatus(projectId: string): Promise<WorkingDirectoryStatus> {
    try {
      // Get published version if any
      let publishedVersionId: string | undefined;
      if (pool) {
        const published = await pool.query(`
          SELECT version_id
          FROM project_versions_metadata
          WHERE project_id = $1 AND is_published = true AND soft_deleted_at IS NULL
        `, [projectId]);
        publishedVersionId = published.rows[0]?.version_id;
      }

      // Check .sheen/active-artifact marker first
      const activeArtifact = await this.getActiveArtifactMarker();
      let currentVersionId = activeArtifact?.versionId;

      // Check git status if it's a git repository
      let isDirty = false;
      let uncommittedChanges: string[] = [];

      if (await this.isGitRepository()) {
        const gitStatus = await this.getGitStatus();
        isDirty = gitStatus.isDirty;
        uncommittedChanges = gitStatus.uncommittedChanges;
        // Use git commit if no marker exists
        if (!currentVersionId) {
          currentVersionId = gitStatus.currentCommit;
        }
      }

      // Determine sync status
      const isInSync = !isDirty && currentVersionId === publishedVersionId;
      
      let syncRecommendation = '';
      if (!publishedVersionId) {
        syncRecommendation = 'No published version to sync with';
      } else if (isDirty) {
        syncRecommendation = 'Working directory has uncommitted changes';
      } else if (!isInSync) {
        syncRecommendation = 'Working directory does not match published version';
      } else {
        syncRecommendation = 'Working directory is in sync with published version';
      }

      return {
        projectId,
        currentVersionId,
        publishedVersionId,
        isInSync,
        isDirty,
        uncommittedChanges,
        syncRecommendation
      };
    } catch (error) {
      console.error('[Working Directory] Status check failed:', error);
      return {
        projectId,
        isInSync: false,
        isDirty: true,
        uncommittedChanges: [],
        syncRecommendation: 'Unable to determine sync status'
      };
    }
  }

  /**
   * Sync working directory with published version
   */
  async syncWithPublishedVersion(userId: string, projectId: string): Promise<WorkingDirectorySyncResult> {
    if (!pool) {
      return {
        success: false,
        message: 'Database not configured',
        error: 'Database not configured'
      };
    }

    try {
      // Get published version
      const published = await pool.query(`
        SELECT pvm.version_id
        FROM project_versions_metadata pvm
        WHERE pvm.project_id = $1 AND pvm.is_published = true AND pvm.soft_deleted_at IS NULL
      `, [projectId]);

      if (published.rows.length === 0) {
        return {
          success: false,
          message: 'No published version found to sync with',
          error: 'No published version'
        };
      }

      const publishedVersionId = published.rows[0].version_id;
      
      // Extract published version to working directory
      return await this.extractArtifactToWorkingDirectory(userId, projectId, publishedVersionId, 'publication_sync');
    } catch (error) {
      console.error('[Working Directory] Sync failed:', error);
      return {
        success: false,
        message: 'Failed to sync with published version',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate ZIP file for security (ZIP-Slip protection)
   */
  private async validateZipSecurity(zipPath: string, targetDir: string): Promise<{ safe: boolean; error?: string }> {
    return new Promise((resolve) => {
      // Expert feedback: ZIP-Slip guard - check for ../ and absolute paths
      console.log(`[Working Directory] Validating ZIP security for: ${zipPath}`);
      
      // First check if the file exists
      if (!fsSync.existsSync(zipPath)) {
        console.error(`[Working Directory] ZIP file does not exist: ${zipPath}`);
        resolve({ safe: false, error: `ZIP file not found: ${zipPath}` });
        return;
      }
      
      const zipList = spawn('unzip', ['-l', zipPath]);
      
      let output = '';
      let errorOutput = '';
      
      zipList.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      zipList.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      zipList.on('close', (code) => {
        if (code !== 0) {
          console.error(`[Working Directory] unzip -l failed with code ${code}: ${errorOutput}`);
          resolve({ safe: false, error: `Failed to list ZIP contents: ${errorOutput || 'unknown error'}` });
          return;
        }

        const lines = output.split('\n');
        const realTargetDir = path.resolve(targetDir);
        
        for (const line of lines) {
          // Extract filename from unzip -l output (format: "  length   date   time   name")
          const match = line.match(/^\s*\d+\s+\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/);
          if (!match) continue;
          
          const filename = match[1]!.trim(); // Safe: match exists from line 450
          
          // Check for path traversal attempts
          if (filename.includes('../') || filename.startsWith('/')) {
            resolve({ 
              safe: false, 
              error: `ZIP-Slip attack detected: dangerous path "${filename}"` 
            });
            return;
          }

          // Expert feedback: validate extraction path stays in project root
          try {
            const resolvedPath = path.resolve(targetDir, filename);
            
            if (!resolvedPath.startsWith(realTargetDir)) {
              resolve({ 
                safe: false, 
                error: `Path traversal detected: "${filename}" would extract outside project root` 
              });
              return;
            }
          } catch (error) {
            // If we can't resolve the path, it's probably safe but warn
            console.warn(`[Working Directory] Could not validate path for ${filename}:`, error);
          }
        }

        resolve({ safe: true });
      });

      zipList.on('error', (error) => {
        resolve({ 
          safe: false, 
          error: `ZIP validation error: ${error.message}` 
        });
      });
    });
  }

  /**
   * Extract tar.gz file to directory with security validation
   */
  private async extractTarGzToDirectory(tarGzPath: string, targetDir: string): Promise<{ success: boolean; extractedFiles?: number; error?: string }> {
    return new Promise((resolve) => {
      console.log(`[Working Directory] Extracting tar.gz from ${tarGzPath} to ${targetDir}`);
      
      // Use tar command to extract
      const tar = spawn('tar', ['-xzf', tarGzPath, '-C', targetDir]);
      
      let extractedFiles = 0;
      let errorOutput = '';
      
      tar.stdout.on('data', (data) => {
        // Count files being extracted if verbose
        const output = data.toString();
        const matches = output.match(/x /g);
        if (matches) {
          extractedFiles += matches.length;
        }
      });
      
      tar.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      tar.on('close', (code) => {
        if (code === 0) {
          console.log(`[Working Directory] Successfully extracted tar.gz`);
          resolve({ success: true, extractedFiles });
        } else {
          console.error(`[Working Directory] tar extraction failed with code ${code}: ${errorOutput}`);
          resolve({ 
            success: false, 
            error: `tar extraction failed: ${errorOutput || 'unknown error'}` 
          });
        }
      });

      tar.on('error', (error) => {
        resolve({ 
          success: false, 
          error: `tar process error: ${error.message}` 
        });
      });
    });
  }

  /**
   * Extract ZIP file to directory with security validation
   */
  private async extractZipToDirectory(zipPath: string, targetDir: string): Promise<{ success: boolean; extractedFiles?: number; error?: string }> {
    // Expert feedback: ZIP-Slip protection before extraction
    const securityCheck = await this.validateZipSecurity(zipPath, targetDir);
    if (!securityCheck.safe) {
      return {
        success: false,
        error: `Security validation failed: ${securityCheck.error}`
      };
    }

    return new Promise((resolve) => {
      // Expert feedback: Use -q for large files to reduce output noise
      const unzip = spawn('unzip', ['-o', '-q', zipPath, '-d', targetDir]);
      
      let extractedFiles = 0;
      
      unzip.stdout.on('data', (data) => {
        const output = data.toString();
        // Count extracted files (quieter output with -q)
        const matches = output.match(/inflating:/g);
        if (matches) {
          extractedFiles += matches.length;
        }
      });

      unzip.stderr.on('data', (data) => {
        // Log errors but don't fail immediately - unzip can be chatty
        console.warn('[Working Directory] Unzip stderr:', data.toString());
      });

      unzip.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, extractedFiles });
        } else {
          resolve({ 
            success: false, 
            error: `Unzip failed with code ${code}` 
          });
        }
      });

      unzip.on('error', (error) => {
        resolve({ 
          success: false, 
          error: `Unzip process error: ${error.message}` 
        });
      });
    });
  }

  /**
   * Check if directory is a git repository
   */
  private async isGitRepository(): Promise<boolean> {
    try {
      const gitDir = path.join(this.projectPath, '.git');
      const stats = await fs.stat(gitDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check and handle uncommitted changes before sync
   * Expert feedback: better handling than hard-reset
   */
  private async handleUncommittedChanges(): Promise<{ handled: boolean; error?: string }> {
    try {
      const gitStatus = await this.getGitStatus();
      
      if (!gitStatus.isDirty) {
        return { handled: true }; // No uncommitted changes
      }

      console.log(`[Working Directory] Found ${gitStatus.uncommittedChanges.length} uncommitted changes`);
      
      // Stash uncommitted changes
      return new Promise((resolve) => {
        const gitStash = spawn('git', ['stash', 'push', '-m', `Auto-stash before sync ${Date.now()}`], { 
          cwd: this.projectPath 
        });
        
        gitStash.on('close', (code) => {
          if (code === 0) {
            console.log('[Working Directory] Uncommitted changes stashed successfully');
            resolve({ handled: true });
          } else {
            resolve({ 
              handled: false, 
              error: 'Failed to stash uncommitted changes. Use git stash manually before syncing.' 
            });
          }
        });
        
        gitStash.on('error', (error) => {
          resolve({ 
            handled: false, 
            error: `Git stash error: ${error.message}` 
          });
        });
      });
    } catch (error) {
      return { 
        handled: false, 
        error: `Failed to check git status: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Update git state after extraction (commit changes and tag)
   */
  private async updateGitState(versionId: string): Promise<{ success: boolean; commit?: string }> {
    // Expert feedback: Handle uncommitted changes gracefully
    const stashResult = await this.handleUncommittedChanges();
    if (!stashResult.handled) {
      console.warn('[Working Directory] Could not handle uncommitted changes:', stashResult.error);
      // Continue anyway - user can resolve manually
    }

    return new Promise((resolve) => {
      // Add all changes
      const gitAdd = spawn('git', ['add', '.'], { cwd: this.projectPath });
      
      gitAdd.on('close', (code) => {
        if (code !== 0) {
          resolve({ success: false });
          return;
        }

        // Commit changes
        const gitCommit = spawn('git', ['commit', '-m', `Sync to version ${versionId}`], { 
          cwd: this.projectPath 
        });
        
        let commitHash = '';
        
        gitCommit.stdout.on('data', (data) => {
          const output = data.toString();
          const match = output.match(/\[.+?\s([a-f0-9]+)\]/);
          if (match) {
            commitHash = match[1];
          }
        });

        gitCommit.on('close', (commitCode) => {
          if (commitCode === 0) {
            // Tag the commit
            const gitTag = spawn('git', ['tag', `sync-${versionId}`, commitHash], { 
              cwd: this.projectPath 
            });
            
            gitTag.on('close', () => {
              resolve({ success: true, commit: commitHash });
            });
          } else {
            resolve({ success: false });
          }
        });
      });
    });
  }

  /**
   * Update .sheenapps-project/active-artifact marker to track which artifact is on disk
   * Expert recommendation: Internal bookkeeping for drift detection
   */
  private async updateActiveArtifactMarker(versionId: string, artifactSha256: string): Promise<void> {
    try {
      const sheenDir = path.join(this.projectPath, this.SHEEN_DIR);
      await fs.mkdir(sheenDir, { recursive: true });
      
      const markerFile = path.join(sheenDir, this.ACTIVE_ARTIFACT_FILE);
      const markerData = {
        versionId,
        artifactSha256,
        extractedAt: new Date().toISOString(),
        extractedBy: 'sheen-platform'
      };
      
      await fs.writeFile(markerFile, JSON.stringify(markerData, null, 2));
      console.log(`[Working Directory] Updated active artifact marker: ${versionId}`);
    } catch (error) {
      console.warn('[Working Directory] Failed to update active artifact marker:', error);
      // Don't fail the sync operation for marker issues
    }
  }

  /**
   * Get current active artifact marker
   * Expert recommendation: Check which artifact is currently on disk
   */
  private async getActiveArtifactMarker(): Promise<{ versionId: string; artifactSha256: string; extractedAt: string; extractedBy: string } | null> {
    try {
      const markerFile = path.join(this.projectPath, this.SHEEN_DIR, this.ACTIVE_ARTIFACT_FILE);
      const markerContent = await fs.readFile(markerFile, 'utf-8');
      return JSON.parse(markerContent);
    } catch (error) {
      // Marker doesn't exist or is corrupted - this is normal for first-time setup
      return null;
    }
  }

  /**
   * Detect if working directory has drifted from the active artifact
   * Expert recommendation: Elegant solution for drift detection
   */
  async detectWorkingDirectoryDrift(projectId: string): Promise<{
    hasDrift: boolean;
    activeVersion?: string | undefined;
    publishedVersion?: string | undefined;
    driftReason?: string | undefined;
  }> {
    try {
      const activeArtifact = await this.getActiveArtifactMarker();
      
      if (!activeArtifact) {
        return {
          hasDrift: true,
          driftReason: 'No active artifact marker found - working directory may be unmanaged'
        };
      }

      // Get published version
      let publishedVersionId: string | undefined;
      if (pool) {
        const published = await pool.query(`
          SELECT version_id
          FROM project_versions_metadata
          WHERE project_id = $1 AND is_published = true AND soft_deleted_at IS NULL
        `, [projectId]);
        publishedVersionId = published.rows[0]?.version_id;
      }

      const hasDrift = activeArtifact.versionId !== publishedVersionId;
      
      return {
        hasDrift,
        activeVersion: activeArtifact.versionId,
        publishedVersion: publishedVersionId,
        driftReason: hasDrift ? 'Active artifact differs from published version' : undefined
      };
    } catch (error) {
      return {
        hasDrift: true,
        driftReason: `Failed to detect drift: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get git status information
   */
  private async getGitStatus(): Promise<{ isDirty: boolean; uncommittedChanges: string[]; currentCommit?: string }> {
    return new Promise((resolve) => {
      const gitStatus = spawn('git', ['status', '--porcelain'], { cwd: this.projectPath });
      
      let output = '';
      gitStatus.stdout.on('data', (data) => {
        output += data.toString();
      });

      gitStatus.on('close', (code) => {
        if (code !== 0) {
          resolve({ isDirty: true, uncommittedChanges: [] });
          return;
        }

        const lines = output.trim().split('\n').filter(line => line.length > 0);
        const isDirty = lines.length > 0;
        
        // Get current commit
        const gitLog = spawn('git', ['rev-parse', 'HEAD'], { cwd: this.projectPath });
        let currentCommit = '';
        
        gitLog.stdout.on('data', (data) => {
          currentCommit = data.toString().trim();
        });

        gitLog.on('close', () => {
          resolve({
            isDirty,
            uncommittedChanges: lines,
            ...(currentCommit && { currentCommit })
          });
        });
      });
    });
  }
}