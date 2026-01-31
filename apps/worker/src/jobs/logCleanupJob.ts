import { CronJob } from 'cron';
import * as fs from 'fs';
import * as path from 'path';
import { unifiedLogger } from '../services/unifiedLogger';

// PostgreSQL advisory lock ID for log cleanup (unique number)
const LOG_CLEANUP_LOCK_ID = 12347;

export class LogCleanupJob {
  private cronJob: CronJob;
  private isRunning: boolean = false;
  private readonly retentionDays: number = 30; // 30-day retention as per plan

  constructor() {
    // Run daily at 02:00 UTC (after daily bonus reset job)
    this.cronJob = new CronJob(
      '0 2 * * *',
      () => this.run(),
      null,
      false,
      'UTC'
    );
  }

  start() {
    this.cronJob.start();
    console.log('✅ Log cleanup job scheduled (daily at 02:00 UTC)');
  }

  stop() {
    this.cronJob.stop();
    console.log('🛑 Log cleanup job stopped');
  }

  async runNow() {
    console.log('[Log Cleanup] Manual execution requested');
    await this.run();
  }

  private async run() {
    if (this.isRunning) {
      console.log('[Log Cleanup] Job already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    try {
      console.log('[Log Cleanup] Starting log cleanup job');
      
      // Log job start
      unifiedLogger.system('log_cleanup_start', 'info', 'Log cleanup job started', {
        jobId: `log-cleanup-${today}`,
        retentionDays: this.retentionDays,
        scheduledDate: today
      });
      
      const result = await this.cleanupOldLogs();
      
      const duration = Date.now() - startTime;
      console.log(`[Log Cleanup] Completed successfully: ${result.directoriesRemoved} directories, ${result.filesRemoved} files, ${result.bytesReclaimed} bytes reclaimed in ${duration}ms`);
      
      // Log job completion
      unifiedLogger.system('log_cleanup_complete', 'info', 'Log cleanup job completed successfully', {
        jobId: `log-cleanup-${today}`,
        directoriesRemoved: result.directoriesRemoved,
        filesRemoved: result.filesRemoved,
        bytesReclaimed: result.bytesReclaimed,
        durationMs: duration
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[Log Cleanup] Failed:', error);
      
      // Log job failure
      unifiedLogger.system('log_cleanup_failed', 'error', 'Log cleanup job failed', {
        jobId: `log-cleanup-${today}`,
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration
      });
      
      // Alert operations team
      console.error(`[ALERT] Log cleanup failed: ${error}`);
      
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean up logs older than retention period
   */
  private async cleanupOldLogs(): Promise<{
    directoriesRemoved: number;
    filesRemoved: number;
    bytesReclaimed: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
    const cutoffDateString = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD

    console.log(`[Log Cleanup] Removing logs older than ${cutoffDateString} (${this.retentionDays} days)`);

    let directoriesRemoved = 0;
    let filesRemoved = 0;
    let bytesReclaimed = 0;

    // Define all log directories based on multi-tier logging plan
    const logDirectories = [
      './logs/unified',    // Unified logs (existing)
      './logs/builds',     // Build logs (existing) 
      './logs/deploys',    // Deploy logs
      './logs/projects',   // User action logs
      './logs/lifecycle',  // Lifecycle logs
      './logs/system'      // System logs
    ];

    for (const logDir of logDirectories) {
      try {
        if (!fs.existsSync(logDir)) {
          console.log(`[Log Cleanup] Directory ${logDir} does not exist, skipping`);
          continue;
        }

        const dayDirs = await fs.promises.readdir(logDir);
        
        for (const dayDir of dayDirs) {
          // Check if directory name is a date (YYYY-MM-DD format)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDir)) {
            continue;
          }

          // Compare with cutoff date
          if (dayDir >= cutoffDateString) {
            continue; // Keep this directory
          }

          const dayPath = path.join(logDir, dayDir);
          
          try {
            const stats = await fs.promises.stat(dayPath);
            if (stats.isDirectory()) {
              // Calculate size of directory before removal
              const dirSize = await this.calculateDirectorySize(dayPath);
              
              // Remove the entire day directory
              await fs.promises.rm(dayPath, { recursive: true, force: true });
              
              directoriesRemoved++;
              bytesReclaimed += dirSize.bytes;
              filesRemoved += dirSize.files;
              
              console.log(`[Log Cleanup] Removed ${dayPath} (${dirSize.files} files, ${dirSize.bytes} bytes)`);
              
              // Log individual directory cleanup
              unifiedLogger.system('log_directory_cleaned', 'info', `Removed old log directory: ${dayPath}`, {
                directory: dayPath,
                date: dayDir,
                filesRemoved: dirSize.files,
                bytesReclaimed: dirSize.bytes,
                tier: this.getTierFromPath(logDir)
              });
            }
          } catch (error) {
            console.error(`[Log Cleanup] Failed to remove ${dayPath}:`, error);
            
            unifiedLogger.system('log_cleanup_directory_failed', 'error', `Failed to remove log directory: ${dayPath}`, {
              directory: dayPath,
              date: dayDir,
              error: error instanceof Error ? error.message : String(error),
              tier: this.getTierFromPath(logDir)
            });
          }
        }

      } catch (error) {
        console.error(`[Log Cleanup] Failed to process directory ${logDir}:`, error);
        
        unifiedLogger.system('log_cleanup_tier_failed', 'error', `Failed to process log tier directory: ${logDir}`, {
          logDirectory: logDir,
          error: error instanceof Error ? error.message : String(error),
          tier: this.getTierFromPath(logDir)
        });
      }
    }

    return { directoriesRemoved, filesRemoved, bytesReclaimed };
  }

  /**
   * Calculate total size and file count of directory
   */
  private async calculateDirectorySize(dirPath: string): Promise<{ bytes: number; files: number }> {
    let totalBytes = 0;
    let totalFiles = 0;

    try {
      const items = await fs.promises.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.promises.stat(itemPath);
        
        if (stats.isFile()) {
          totalBytes += stats.size;
          totalFiles++;
        } else if (stats.isDirectory()) {
          const subResult = await this.calculateDirectorySize(itemPath);
          totalBytes += subResult.bytes;
          totalFiles += subResult.files;
        }
      }
    } catch (error) {
      console.error(`[Log Cleanup] Failed to calculate size for ${dirPath}:`, error);
    }

    return { bytes: totalBytes, files: totalFiles };
  }

  /**
   * Extract tier name from log path for better logging context
   */
  private getTierFromPath(logPath: string): string {
    if (logPath.includes('unified')) return 'unified';
    if (logPath.includes('builds')) return 'build';
    if (logPath.includes('deploys')) return 'deploy';
    if (logPath.includes('projects')) return 'action';
    if (logPath.includes('lifecycle')) return 'lifecycle';
    if (logPath.includes('system')) return 'system';
    return 'unknown';
  }

  /**
   * Get status information about the log cleanup job
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    isScheduled: boolean;
    nextRun?: string;
    retentionDays: number;
    logDirectoryStats?: Array<{
      tier: string;
      path: string;
      exists: boolean;
      oldestDate?: string;
      newestDate?: string;
      totalDirs?: number;
    }>;
  }> {
    const status: {
      isRunning: boolean;
      isScheduled: boolean;
      nextRun?: string;
      retentionDays: number;
      logDirectoryStats?: Array<{
        tier: string;
        path: string;
        exists: boolean;
        oldestDate?: string;
        newestDate?: string;
        totalDirs?: number;
      }>;
    } = {
      isRunning: this.isRunning,
      isScheduled: this.cronJob.running,
      retentionDays: this.retentionDays
    };

    try {
      // Get next scheduled run time
      if (this.cronJob.running) {
        const nextDate = this.cronJob.nextDate();
        if (nextDate) {
          status.nextRun = nextDate.toString();
        }
      }

      // Get stats for each log directory
      const logDirectories = [
        { tier: 'unified', path: './logs/unified' },
        { tier: 'build', path: './logs/builds' },
        { tier: 'deploy', path: './logs/deploys' },
        { tier: 'action', path: './logs/projects' },
        { tier: 'lifecycle', path: './logs/lifecycle' },
        { tier: 'system', path: './logs/system' }
      ];

      status.logDirectoryStats = await Promise.all(logDirectories.map(async (logDir) => {
        try {
          const exists = fs.existsSync(logDir.path);
          const stat: any = { tier: logDir.tier, path: logDir.path, exists };
          
          if (exists) {
            const dayDirs = await fs.promises.readdir(logDir.path);
            const dateDirs = dayDirs.filter(dir => /^\d{4}-\d{2}-\d{2}$/.test(dir)).sort();
            
            stat.totalDirs = dateDirs.length;
            if (dateDirs.length > 0) {
              stat.oldestDate = dateDirs[0];
              stat.newestDate = dateDirs[dateDirs.length - 1];
            }
          }
          
          return stat;
        } catch (error) {
          return {
            tier: logDir.tier,
            path: logDir.path,
            exists: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }));

    } catch (error) {
      console.error('[Log Cleanup] Failed to get full status:', error);
    }

    return status;
  }
}

// Singleton instance
export const logCleanupJob = new LogCleanupJob();