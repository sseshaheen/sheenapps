import { getAuditLogger, AuditEntry } from './auditLogger';

interface WorkingDirectoryAuditEntry {
  projectId: string;
  userId: string;
  versionId: string;
  action: 'working_dir_sync' | 'working_dir_status_check' | 'working_dir_lock_acquired' | 'working_dir_lock_failed';

  // Performance metrics
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  filesWritten?: number | undefined;
  elapsedMs: number;

  // Operational details
  syncResult: 'success' | 'failure' | 'partial' | 'blocked';
  extractedFiles?: number | undefined;
  gitCommit?: string | undefined;

  // Security context
  syncSource: 'rollback' | 'manual_sync' | 'publication_sync';
  skipWorkingDirectory?: boolean | undefined;

  // Error details (if any)
  errorMessage?: string | undefined;
  lockConflict?: boolean | undefined;
  securityRejection?: boolean | undefined;
}

export class WorkingDirectoryAuditor {
  private auditLogger = getAuditLogger();
  
  async initialize(): Promise<void> {
    await this.auditLogger.initialize();
  }
  
  /**
   * Log working directory sync operation - exactly what your teammate suggested!
   */
  async logSync(entry: WorkingDirectoryAuditEntry): Promise<string> {
    // Convert to general audit format
    const auditEntry: Omit<AuditEntry, 'id' | 'timestamp' | 'securityChecks'> = {
      errorId: `wd_${entry.action}_${Date.now()}`, // Not really an error, but needed for the interface
      action: entry.action === 'working_dir_sync' ? 'fix_applied' : 'error_detected', // Map to existing actions
      actor: 'system',
      
      projectContext: {
        projectId: entry.projectId,
        userId: entry.userId,
        buildId: entry.versionId // Using buildId for versionId
      },
      
      errorDetails: {
        type: 'working_directory_operation',
        message: entry.errorMessage || `${entry.action} completed`,
        source: 'working_directory_service',
        stage: entry.syncSource
      },
      
      fixDetails: entry.action === 'working_dir_sync' ? {
        strategy: `sync_to_version_${entry.versionId}`,
        method: 'manual',
        confidence: 1.0,
        riskLevel: 'low',
        changes: [{
          type: 'file_edit',
          target: 'working_directory',
          action: `extracted ${entry.extractedFiles || 0} files`,
          after: entry.gitCommit || 'no_git_commit'
        }],
        actualTime: entry.elapsedMs
      } : undefined,
      
      result: entry.syncResult,
      
      metadata: {
        correlationId: `wd_${entry.projectId}_${entry.versionId}`,
        resources: {
          cpuTime: entry.elapsedMs,
          memoryUsed: 0, // Not tracking memory for file operations
          diskUsed: entry.filesWritten || 0
        }
      }
    };
    
    // Security checks for working directory operations
    const securityChecks = {
      codeInjection: false,
      pathTraversal: entry.securityRejection || false,
      privilegeEscalation: false,
      commandExecution: entry.gitCommit ? true : false, // Git operations involve command execution
      fileSystemAccess: true // All working directory operations involve file system access
    };
    
    return await this.auditLogger.log(auditEntry, securityChecks);
  }
  
  /**
   * Incident response helper: "who changed main.css at 3 AM?"
   */
  async findFileChanges(options: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    projectId?: string | undefined;
    userId?: string | undefined;
    filename?: string | undefined;
    fromDate?: Date | undefined;
    toDate?: Date | undefined;
  }): Promise<Array<{
    timestamp: Date;
    userId: string;
    projectId: string;
    versionId: string;
    action: string;
    filesWritten: number;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    gitCommit?: string | undefined;
    syncSource: string;
  }>> {
    const query = {
      projectId: options.projectId,
      userId: options.userId,
      fromDate: options.fromDate,
      toDate: options.toDate,
      limit: 100
    };
    
    const entries = await this.auditLogger.query(query);
    
    // Filter to working directory operations and extract relevant info
    return entries
      .filter(entry => entry.errorDetails.type === 'working_directory_operation')
      .map(entry => ({
        timestamp: entry.timestamp,
        userId: entry.projectContext?.userId || 'unknown',
        projectId: entry.projectContext?.projectId || 'unknown',
        versionId: entry.projectContext?.buildId || 'unknown',
        action: entry.action as string,
        filesWritten: entry.metadata?.resources?.diskUsed || 0,
        gitCommit: entry.fixDetails?.changes?.[0]?.after,
        syncSource: entry.errorDetails.stage || 'unknown'
      }))
      .filter(change => {
        // If filename filter is provided, check if this operation might have affected it
        if (options.filename) {
          // This is a rough heuristic - in practice you'd need more detailed file tracking
          return change.filesWritten > 0;
        }
        return true;
      });
  }
  
  /**
   * Security incident helper: detect suspicious working directory operations
   */
  async findSuspiciousActivity(options: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    projectId?: string | undefined;
    fromDate?: Date | undefined;
    toDate?: Date | undefined;
  } = {}): Promise<Array<{
    timestamp: Date;
    userId: string;
    projectId: string;
    versionId: string;
    suspiciousReasons: string[];
    filesWritten: number;
  }>> {
    const query = {
      ...options,
      securityOnly: true,
      limit: 50
    };
    
    const entries = await this.auditLogger.query(query);
    
    return entries
      .filter(entry => entry.errorDetails.type === 'working_directory_operation')
      .map(entry => {
        const reasons: string[] = [];
        
        if (entry.securityChecks.pathTraversal) {
          reasons.push('Path traversal attempt detected');
        }
        
        if (entry.metadata?.resources?.diskUsed && entry.metadata.resources.diskUsed > 1000) {
          reasons.push('Unusually large number of files written');
        }
        
        const hour = entry.timestamp.getHours();
        if (hour < 6 || hour > 22) {
          reasons.push('Operation performed outside business hours');
        }
        
        return {
          timestamp: entry.timestamp,
          userId: entry.projectContext?.userId || 'unknown',
          projectId: entry.projectContext?.projectId || 'unknown',
          versionId: entry.projectContext?.buildId || 'unknown',
          suspiciousReasons: reasons,
          filesWritten: entry.metadata?.resources?.diskUsed || 0
        };
      })
      .filter(activity => activity.suspiciousReasons.length > 0);
  }
  
  /**
   * Performance monitoring: track sync operation performance
   */
  async getSyncPerformanceStats(options: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    projectId?: string | undefined;
    fromDate?: Date | undefined;
    toDate?: Date | undefined;
  } = {}): Promise<{
    totalOperations: number;
    avgSyncTimeMs: number;
    avgFilesWritten: number;
    successRate: number;
    slowOperations: Array<{
      timestamp: Date;
      userId: string;
      projectId: string;
      elapsedMs: number;
      filesWritten: number;
    }>;
  }> {
    const query = {
      ...options,
      limit: 1000
    };
    
    const entries = await this.auditLogger.query(query);
    const syncEntries = entries.filter(entry => 
      entry.errorDetails.type === 'working_directory_operation' && 
      entry.action === 'fix_applied' // sync operations
    );
    
    if (syncEntries.length === 0) {
      return {
        totalOperations: 0,
        avgSyncTimeMs: 0,
        avgFilesWritten: 0,
        successRate: 0,
        slowOperations: []
      };
    }
    
    const totalTime = syncEntries.reduce((sum, entry) => 
      sum + (entry.fixDetails?.actualTime || 0), 0
    );
    
    const totalFiles = syncEntries.reduce((sum, entry) => 
      sum + (entry.metadata?.resources?.diskUsed || 0), 0
    );
    
    const successCount = syncEntries.filter(entry => entry.result === 'success').length;
    
    const slowOperations = syncEntries
      .filter(entry => (entry.fixDetails?.actualTime || 0) > 30000) // >30 seconds
      .map(entry => ({
        timestamp: entry.timestamp,
        userId: entry.projectContext?.userId || 'unknown',
        projectId: entry.projectContext?.projectId || 'unknown',
        elapsedMs: entry.fixDetails?.actualTime || 0,
        filesWritten: entry.metadata?.resources?.diskUsed || 0
      }))
      .sort((a, b) => b.elapsedMs - a.elapsedMs)
      .slice(0, 10);
    
    return {
      totalOperations: syncEntries.length,
      avgSyncTimeMs: totalTime / syncEntries.length,
      avgFilesWritten: totalFiles / syncEntries.length,
      successRate: successCount / syncEntries.length,
      slowOperations
    };
  }
  
  /**
   * Log R2 garbage collection operations
   * Audit trail for storage cleanup operations
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async logOperation(entry: {
    operation: 'r2_garbage_collection';
    success: boolean;
    duration: number;
    details: {
      deletedCount: number;
      totalSizeFreed: number;
      skippedCount: number;
      retentionDays: number;
      error?: string | undefined;
    };
  }): Promise<string> {
    // Convert to general audit format
    const auditEntry: Omit<AuditEntry, 'id' | 'timestamp' | 'securityChecks'> = {
      errorId: `r2_gc_${Date.now()}`,
      action: entry.success ? 'fix_applied' : 'error_detected',
      actor: 'system',
      
      projectContext: {
        projectId: 'system', // R2 cleanup is system-wide
        userId: 'system',
        buildId: 'gc_operation'
      },
      
      errorDetails: {
        type: entry.success ? 'CLEANUP_SUCCESS' : 'CLEANUP_FAILED',
        message: entry.success 
          ? `R2 cleanup completed: ${entry.details.deletedCount} artifacts deleted, ${this.formatFileSize(entry.details.totalSizeFreed)} freed`
          : `R2 cleanup failed: ${entry.details.error}`,
        source: 'r2_garbage_collector',
        stage: 'storage_cleanup'
      },
      
      fixDetails: entry.success ? {
        strategy: `Automated cleanup with ${entry.details.retentionDays}-day retention policy`,
        method: 'pattern' as const,
        changes: [{
          type: 'config' as const,
          target: 'r2_storage',
          before: `${entry.details.deletedCount + entry.details.skippedCount} artifacts`,
          after: `${entry.details.skippedCount} artifacts (${entry.details.deletedCount} deleted)`,
          action: 'cleanup_expired_artifacts'
        }],
        actualTime: entry.duration
      } : undefined,
      
      metadata: {
        resources: {
          cpuTime: 0, // R2 cleanup is network I/O bound
          memoryUsed: 0, // Minimal memory usage
          diskUsed: -entry.details.totalSizeFreed // Negative because we freed space
        }
        // Note: Operation details are captured in fixDetails.strategy
      },
      
      result: entry.success ? 'success' : 'failure'
    };
    
    return await this.auditLogger.log(auditEntry);
  }
  
  /**
   * Format file size for human-readable output
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

// Singleton instance
let workingDirectoryAuditorInstance: WorkingDirectoryAuditor | null = null;

export function getWorkingDirectoryAuditor(): WorkingDirectoryAuditor {
  if (!workingDirectoryAuditorInstance) {
    workingDirectoryAuditorInstance = new WorkingDirectoryAuditor();
  }
  return workingDirectoryAuditorInstance;
}