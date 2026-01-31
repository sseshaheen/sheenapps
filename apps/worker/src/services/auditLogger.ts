import * as fs from 'fs/promises';
import * as path from 'path';
import { ErrorContext } from './errorInterceptor';

export interface AuditEntry {
  id: string;
  timestamp: Date;
  errorId: string;
  
  // What happened
  action: 'error_detected' | 'fix_attempted' | 'fix_applied' | 'rollback_performed' | 'security_blocked';
  actor: 'system' | 'claude' | 'pattern_matcher' | 'user';
  
  // Context
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  projectContext?: {
    projectId?: string | undefined;
    userId?: string | undefined;
    buildId?: string | undefined;
    framework?: string | undefined;
    dependencies?: Record<string, string> | undefined;
    recentChanges?: string[] | undefined;
    projectPath?: string | undefined;
  } | undefined;
  
  // Details
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  errorDetails: {
    type: string;
    message: string;
    stackTrace?: string | undefined;
    source: string;
    stage?: string | undefined;
  };
  
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  fixDetails?: {
    strategy: string;
    method: 'pattern' | 'claude' | 'manual';
    confidence?: number | undefined;
    riskLevel?: 'low' | 'medium' | 'high' | undefined;
    changes: Array<{
      type: 'file_edit' | 'command' | 'config' | 'dependency';
      target: string;
      before?: string | undefined;
      after?: string | undefined;
      action: string;
    }>;
    estimatedTime?: number | undefined;
    actualTime?: number | undefined;
  } | undefined;
  
  // Outcome
  result: 'success' | 'failure' | 'partial' | 'blocked' | 'escalated';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  validationResults?: Array<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any;
  }> | undefined;
  
  // Security
  securityChecks: {
    codeInjection: boolean;
    pathTraversal: boolean;
    privilegeEscalation: boolean;
    commandExecution: boolean;
    fileSystemAccess: boolean;
  };
  
  // Additional metadata
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    sessionId?: string;
    correlationId?: string;
    cost?: number;
    resources?: {
      cpuTime: number;
      memoryUsed: number;
      diskUsed: number;
    };
  };
}

export interface AuditQuery {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  errorId?: string | undefined;
  projectId?: string | undefined;
  userId?: string | undefined;
  action?: AuditEntry['action'] | undefined;
  actor?: AuditEntry['actor'] | undefined;
  result?: AuditEntry['result'] | undefined;
  fromDate?: Date | undefined;
  toDate?: Date | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  securityOnly?: boolean | undefined;
}

export interface AuditStats {
  totalEntries: number;
  byAction: Record<AuditEntry['action'], number>;
  byResult: Record<AuditEntry['result'], number>;
  securityIncidents: number;
  avgRecoveryTime: number;
  costSummary: {
    total: number;
    byMethod: Record<string, number>;
  };
  topProjects: Array<{
    projectId: string;
    errorCount: number;
    recoveryRate: number;
  }>;
}

export class AuditLogger {
  private readonly logPath: string;
  private readonly maxLogSizeMB: number;
  private readonly retentionDays: number;
  private readonly compressionEnabled: boolean;

  constructor(options: {
    logPath?: string;
    maxLogSizeMB?: number;
    retentionDays?: number;
    compressionEnabled?: boolean;
  } = {}) {
    this.logPath = options.logPath || path.join(process.cwd(), 'logs', 'error-recovery-audit.jsonl');
    this.maxLogSizeMB = options.maxLogSizeMB || 100;
    this.retentionDays = options.retentionDays || 90;
    this.compressionEnabled = options.compressionEnabled || true;
  }

  async initialize(): Promise<void> {
    // Ensure log directory exists
    const logDir = path.dirname(this.logPath);
    await fs.mkdir(logDir, { recursive: true });
    
    console.log(`✅ Audit Logger initialized (${this.logPath})`);
  }

  async log(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'securityChecks'>, securityChecks?: Partial<AuditEntry['securityChecks']>): Promise<string> {
    const entryId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const fullEntry: AuditEntry = {
      id: entryId,
      timestamp: new Date(),
      securityChecks: {
        codeInjection: false,
        pathTraversal: false,
        privilegeEscalation: false,
        commandExecution: false,
        fileSystemAccess: false,
        ...securityChecks
      },
      ...entry
    };

    try {
      // Perform security checks based on entry content
      fullEntry.securityChecks = await this.performSecurityChecks(fullEntry);

      // Write to log file
      await this.writeEntry(fullEntry);

      // Check for security incidents
      if (this.isSecurityIncident(fullEntry)) {
        await this.alertSecurityTeam(fullEntry);
      }

      // Periodic maintenance
      if (Math.random() < 0.01) { // 1% chance to trigger maintenance
        await this.performMaintenance();
      }

      return entryId;

    } catch (error) {
      console.error('[AuditLogger] Failed to log entry:', error);
      throw error;
    }
  }

  private async performSecurityChecks(entry: AuditEntry): Promise<AuditEntry['securityChecks']> {
    const checks: AuditEntry['securityChecks'] = {
      codeInjection: false,
      pathTraversal: false,
      privilegeEscalation: false,
      commandExecution: false,
      fileSystemAccess: false
    };

    // Check all text content in the entry
    const textContent = this.extractTextContent(entry);

    // Code injection patterns
    const codeInjectionPatterns = [
      /eval\s*\(/i,
      /Function\s*\(/i,
      /setTimeout\s*\(\s*["'].*["']\s*\)/i,
      /setInterval\s*\(\s*["'].*["']\s*\)/i,
      /new\s+Function/i,
      /document\.write\s*\(/i,
      /innerHTML\s*=\s*["'].*<script/i
    ];

    for (const pattern of codeInjectionPatterns) {
      if (pattern.test(textContent)) {
        checks.codeInjection = true;
        break;
      }
    }

    // Path traversal patterns
    const pathTraversalPatterns = [
      /\.\.\/\.\.\//,
      /\.\.\\\.\.\\/, 
      /%2e%2e%2f/i,
      /%252e%252e%252f/i,
      /\/etc\/passwd/i,
      /\/etc\/shadow/i,
      /\\windows\\system32/i
    ];

    for (const pattern of pathTraversalPatterns) {
      if (pattern.test(textContent)) {
        checks.pathTraversal = true;
        break;
      }
    }

    // Privilege escalation patterns
    const privilegeEscalationPatterns = [
      /sudo\s+/i,
      /su\s+-/i,
      /chmod\s+777/i,
      /chmod\s+\+s/i,
      /setuid/i,
      /setgid/i,
      /\/bin\/sh/i,
      /\/bin\/bash/i,
      /powershell/i
    ];

    for (const pattern of privilegeEscalationPatterns) {
      if (pattern.test(textContent)) {
        checks.privilegeEscalation = true;
        break;
      }
    }

    // Command execution patterns
    const commandExecutionPatterns = [
      /exec\s*\(/i,
      /spawn\s*\(/i,
      /system\s*\(/i,
      /shell_exec/i,
      /passthru/i,
      /`[^`]*`/, // Backtick command execution
      /\$\([^)]*\)/, // Command substitution
      /rm\s+-rf\s+\//i,
      /del\s+\/[sq]/i
    ];

    for (const pattern of commandExecutionPatterns) {
      if (pattern.test(textContent)) {
        checks.commandExecution = true;
        break;
      }
    }

    // File system access patterns (suspicious)
    const fileSystemPatterns = [
      /\/proc\//i,
      /\/sys\//i,
      /\/dev\//i,
      /\/root\//i,
      /C:\\Windows\\/i,
      /C:\\System/i,
      /\.ssh/i,
      /id_rsa/i,
      /authorized_keys/i
    ];

    for (const pattern of fileSystemPatterns) {
      if (pattern.test(textContent)) {
        checks.fileSystemAccess = true;
        break;
      }
    }

    return checks;
  }

  private extractTextContent(entry: AuditEntry): string {
    const textParts: string[] = [
      entry.errorDetails.message,
      entry.errorDetails.stackTrace || '',
      entry.fixDetails?.strategy || '',
      ...(entry.fixDetails?.changes || []).map(change => 
        `${change.action} ${change.before || ''} ${change.after || ''}`
      )
    ];

    return textParts.join(' ').toLowerCase();
  }

  private isSecurityIncident(entry: AuditEntry): boolean {
    const { securityChecks } = entry;
    return securityChecks.codeInjection || 
           securityChecks.pathTraversal || 
           securityChecks.privilegeEscalation ||
           entry.action === 'security_blocked';
  }

  private async alertSecurityTeam(entry: AuditEntry): Promise<void> {
    console.error('🚨 SECURITY INCIDENT DETECTED:', {
      entryId: entry.id,
      errorId: entry.errorId,
      checks: entry.securityChecks,
      projectId: entry.projectContext?.projectId,
      userId: entry.projectContext?.userId
    });

    // In production, this would send alerts to security team
    // For now, we'll just log it prominently
    const securityLog = {
      timestamp: entry.timestamp,
      incident: 'error_recovery_security',
      severity: 'high',
      entryId: entry.id,
      details: entry.securityChecks,
      context: entry.projectContext
    };

    const securityLogPath = path.join(path.dirname(this.logPath), 'security-incidents.jsonl');
    await fs.appendFile(securityLogPath, JSON.stringify(securityLog) + '\n');
  }

  private async writeEntry(entry: AuditEntry): Promise<void> {
    const logLine = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.logPath, logLine);
  }

  async query(query: AuditQuery): Promise<AuditEntry[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      let entries: AuditEntry[] = [];
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          entries.push({
            ...entry,
            timestamp: new Date(entry.timestamp)
          });
        } catch (error) {
          // Skip malformed lines
          continue;
        }
      }

      // Apply filters
      entries = this.applyFilters(entries, query);

      // Sort by timestamp descending
      entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply pagination
      if (query.offset) {
        entries = entries.slice(query.offset);
      }
      
      if (query.limit) {
        entries = entries.slice(0, query.limit);
      }

      return entries;

    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return []; // Log file doesn't exist yet
      }
      throw error;
    }
  }

  private applyFilters(entries: AuditEntry[], query: AuditQuery): AuditEntry[] {
    return entries.filter(entry => {
      if (query.errorId && entry.errorId !== query.errorId) return false;
      if (query.projectId && entry.projectContext?.projectId !== query.projectId) return false;
      if (query.userId && entry.projectContext?.userId !== query.userId) return false;
      if (query.action && entry.action !== query.action) return false;
      if (query.actor && entry.actor !== query.actor) return false;
      if (query.result && entry.result !== query.result) return false;
      
      if (query.fromDate && entry.timestamp < query.fromDate) return false;
      if (query.toDate && entry.timestamp > query.toDate) return false;
      
      if (query.securityOnly && !this.isSecurityIncident(entry)) return false;
      
      return true;
    });
  }

  async getStats(query?: Pick<AuditQuery, 'fromDate' | 'toDate' | 'projectId' | 'userId'>): Promise<AuditStats> {
    const entries = await this.query(query || {});

    const stats: AuditStats = {
      totalEntries: entries.length,
      byAction: {
        'error_detected': 0,
        'fix_attempted': 0,
        'fix_applied': 0,
        'rollback_performed': 0,
        'security_blocked': 0
      },
      byResult: {
        'success': 0,
        'failure': 0,
        'partial': 0,
        'blocked': 0,
        'escalated': 0
      },
      securityIncidents: 0,
      avgRecoveryTime: 0,
      costSummary: {
        total: 0,
        byMethod: {}
      },
      topProjects: []
    };

    // Calculate statistics
    let totalRecoveryTime = 0;
    let recoveryCount = 0;
    const projectStats = new Map<string, { errors: number; recovered: number }>();

    for (const entry of entries) {
      // Count by action
      stats.byAction[entry.action]++;
      
      // Count by result
      stats.byResult[entry.result]++;
      
      // Security incidents
      if (this.isSecurityIncident(entry)) {
        stats.securityIncidents++;
      }
      
      // Recovery time
      if (entry.fixDetails?.actualTime) {
        totalRecoveryTime += entry.fixDetails.actualTime;
        recoveryCount++;
      }
      
      // Cost tracking
      if (entry.metadata?.cost) {
        stats.costSummary.total += entry.metadata.cost;
        const method = entry.fixDetails?.method || 'unknown';
        stats.costSummary.byMethod[method] = (stats.costSummary.byMethod[method] || 0) + entry.metadata.cost;
      }
      
      // Project statistics
      if (entry.projectContext?.projectId) {
        const projectId = entry.projectContext.projectId;
        const current = projectStats.get(projectId) || { errors: 0, recovered: 0 };
        current.errors++;
        if (entry.result === 'success') {
          current.recovered++;
        }
        projectStats.set(projectId, current);
      }
    }

    // Calculate average recovery time
    if (recoveryCount > 0) {
      stats.avgRecoveryTime = totalRecoveryTime / recoveryCount;
    }

    // Calculate top projects
    stats.topProjects = Array.from(projectStats.entries())
      .map(([projectId, data]) => ({
        projectId,
        errorCount: data.errors,
        recoveryRate: data.errors > 0 ? data.recovered / data.errors : 0
      }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 10);

    return stats;
  }

  async exportLogs(query: AuditQuery, format: 'json' | 'csv' = 'json'): Promise<string> {
    const entries = await this.query(query);
    
    if (format === 'csv') {
      const headers = [
        'timestamp', 'errorId', 'action', 'actor', 'result',
        'projectId', 'userId', 'errorType', 'fixStrategy', 'recoveryTime'
      ];
      
      const rows = entries.map(entry => [
        entry.timestamp.toISOString(),
        entry.errorId,
        entry.action,
        entry.actor,
        entry.result,
        entry.projectContext?.projectId || '',
        entry.projectContext?.userId || '',
        entry.errorDetails.type,
        entry.fixDetails?.strategy || '',
        entry.fixDetails?.actualTime?.toString() || ''
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    return JSON.stringify(entries, null, 2);
  }

  private async performMaintenance(): Promise<void> {
    try {
      // Check log file size
      const stats = await fs.stat(this.logPath);
      const sizeMB = stats.size / (1024 * 1024);
      
      if (sizeMB > this.maxLogSizeMB) {
        console.log(`[AuditLogger] Log file size (${sizeMB.toFixed(1)}MB) exceeds limit, rotating...`);
        await this.rotateLogFile();
      }
      
      // Clean up old files
      await this.cleanupOldLogs();
      
    } catch (error) {
      console.error('[AuditLogger] Maintenance failed:', error);
    }
  }

  private async rotateLogFile(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivedPath = this.logPath.replace('.jsonl', `_${timestamp}.jsonl`);
    
    await fs.rename(this.logPath, archivedPath);
    
    if (this.compressionEnabled) {
      // In production, compress the archived file
      console.log(`[AuditLogger] Log archived to ${archivedPath}`);
    }
  }

  private async cleanupOldLogs(): Promise<void> {
    const logDir = path.dirname(this.logPath);
    const files = await fs.readdir(logDir);
    const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    
    for (const file of files) {
      if (file.includes('error-recovery-audit_')) {
        const filePath = path.join(logDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          console.log(`[AuditLogger] Deleted old log file: ${file}`);
        }
      }
    }
  }

  // Helper method to create audit entries from error recovery events
  static createErrorDetectedEntry(errorContext: ErrorContext): Omit<AuditEntry, 'id' | 'timestamp' | 'securityChecks'> {
    return {
      errorId: errorContext.errorId,
      action: 'error_detected',
      actor: 'system',
      projectContext: errorContext.projectContext,
      errorDetails: {
        type: errorContext.errorType,
        message: errorContext.errorMessage,
        stackTrace: errorContext.stackTrace,
        source: errorContext.source,
        stage: errorContext.stage
      },
      result: 'partial' // Detection is just the start
    };
  }

  static createFixAttemptedEntry(errorContext: ErrorContext, strategy: string, method: 'pattern' | 'claude'): Omit<AuditEntry, 'id' | 'timestamp' | 'securityChecks'> {
    return {
      errorId: errorContext.errorId,
      action: 'fix_attempted',
      actor: method === 'claude' ? 'claude' : 'pattern_matcher',
      projectContext: errorContext.projectContext,
      errorDetails: {
        type: errorContext.errorType,
        message: errorContext.errorMessage,
        stackTrace: errorContext.stackTrace,
        source: errorContext.source,
        stage: errorContext.stage
      },
      fixDetails: {
        strategy,
        method,
        changes: []
      },
      result: 'partial' // Attempt in progress
    };
  }

  static createFixAppliedEntry(
    errorContext: ErrorContext, 
    fixDetails: AuditEntry['fixDetails'], 
    validationResults: AuditEntry['validationResults'],
    success: boolean
  ): Omit<AuditEntry, 'id' | 'timestamp' | 'securityChecks'> {
    return {
      errorId: errorContext.errorId,
      action: 'fix_applied',
      actor: fixDetails?.method === 'claude' ? 'claude' : 'pattern_matcher',
      projectContext: errorContext.projectContext,
      errorDetails: {
        type: errorContext.errorType,
        message: errorContext.errorMessage,
        stackTrace: errorContext.stackTrace,
        source: errorContext.source,
        stage: errorContext.stage
      },
      fixDetails,
      validationResults,
      result: success ? 'success' : 'failure'
    };
  }
}

// Singleton instance
let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(options?: ConstructorParameters<typeof AuditLogger>[0]): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger(options);
  }
  return auditLoggerInstance;
}