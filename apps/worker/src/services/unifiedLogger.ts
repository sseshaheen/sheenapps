/**
 * Unified Logging Service
 * 
 * Implements the 5-tier unified logging system with NDJSON format as specified in 
 * MULTI_TIER_LOGGING_PLAN.md. Provides segmentation, multi-instance safety, and
 * deep redaction for production-ready logging across all system components.
 */

import fs from 'fs';
import path from 'path';
import { ulid } from 'ulid';

// Generate unique instance ID on service startup
const INSTANCE_ID = ulid();

// Unified NDJSON Schema Types
export type LogTier = 'system' | 'build' | 'deploy' | 'action' | 'lifecycle';

export interface BaseLogEntry {
  timestamp: string;        // ISO 8601
  instanceId: string;       // Multi-instance safety
  tier: LogTier;           // Log categorization
  seq: number;             // Monotonic sequence within segment
}

export interface SystemLogEntry extends BaseLogEntry {
  tier: 'system';
  event: 'startup' | 'shutdown' | 'health_check' | 'error' | 'warning' | 'rate_limit_hit' | 'rate_limit_queue_processed' | 'rate_limiter_initialized' | 'ai_time_consumed' | 'ai_time_credited' | 'daily_bonus_granted' | 'daily_bonus_reset_start' | 'daily_bonus_reset_complete' | 'daily_bonus_reset_health_check_failed' | 'daily_bonus_reset_health_check_passed' | 'daily_bonus_reset_failed' | 'log_cleanup_start' | 'log_cleanup_complete' | 'log_cleanup_failed' | 'log_directory_cleaned' | 'log_cleanup_directory_failed' | 'log_cleanup_tier_failed' | 'queue_resumed' | 'queue_resume_failed' | 'insufficient_ai_time_balance' | 'system_configuration_error' | 'usage_limit_exceeded' | 'queue_paused_system_error' | 'queue_paused_usage_limit' | 'log_performance_report' | 'log_segment_rotated' | 'log_backpressure_detected' | 'log_broadcast_failed' | 'security' | 'artifact_recovery' | 'cleanup_audit' | 'trust_safety' | 'analytics' | 'migration_verification' | 'working_directory';
  severity: 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  metadata?: Record<string, unknown> | undefined;
  correlationId?: string | undefined;
}

export interface BuildLogEntry extends BaseLogEntry {
  tier: 'build';
  buildId: string;
  userId: string;
  projectId: string;
  event: 'started' | 'stdout' | 'stderr' | 'completed' | 'failed';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  message?: string | undefined;        // For stdout/stderr lines
  exitCode?: number | undefined;       // For completed/failed
  metadata?: Record<string, unknown> | undefined;
}

export interface DeployLogEntry extends BaseLogEntry {
  tier: 'deploy';
  buildId: string;
  userId: string;
  projectId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  deploymentId?: string | undefined;
  event: 'started' | 'progress' | 'completed' | 'failed' | 'rolled_back' | 'stdout' | 'stderr';
  message: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface ActionLogEntry extends BaseLogEntry {
  tier: 'action';
  userId: string;
  action: string;          // API endpoint or user action
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  method?: string | undefined;         // HTTP method
  path?: string | undefined;          // Request path
  status?: number | undefined;        // HTTP status
  duration?: number | undefined;      // Request duration in ms
  metadata?: Record<string, unknown> | undefined;
  correlationId?: string | undefined;
  buildId?: string | undefined;        // For build-related actions
  projectId?: string | undefined;      // For project-related actions
  message?: string | undefined;        // For action descriptions
}

export interface LifecycleLogEntry extends BaseLogEntry {
  tier: 'lifecycle';
  event: 'server_start' | 'server_stop' | 'worker_start' | 'worker_stop' | 'migration' | 'backup' | 'build_started' | 'build_completed' | 'build_failed';
  component: string;       // Which component/service
  message: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  metadata?: Record<string, unknown> | undefined;
  buildId?: string | undefined;        // For build-related lifecycle events
  userId?: string | undefined;
  projectId?: string | undefined;
}

export type LogEntry = SystemLogEntry | BuildLogEntry | DeployLogEntry | ActionLogEntry | LifecycleLogEntry;

// Segment Management
interface LogSegment {
  tier: LogTier;
  filePath: string;
  stream: fs.WriteStream;
  startTime: Date;
  seq: number;
  size: number;
  entriesWritten: number;
  bytesWritten: number;
  lastWriteTime: number;
  backpressureCount: number;
}

// Security Redaction - Same patterns as buildLogger but enhanced
const SINGLE_LINE_REDACTORS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+\-=\/]+/g, 'Bearer [REDACTED]'],
  [/\bsk-(live|test)[A-Za-z0-9]{20,}\b/g, 'sk-[REDACTED]'],
  [/\bAWS_SECRET_ACCESS_KEY=\S+/g, 'AWS_SECRET_ACCESS_KEY=[REDACTED]'],
  [/\bauthorization:\s*\S+/gi, 'authorization: [REDACTED]'],
  [/\bapi[_-]?key[_-]?[:=]\s*\S+/gi, 'api_key=[REDACTED]'],
  [/\bpassword[_-]?[:=]\s*\S+/gi, 'password=[REDACTED]'],
  [/\btoken[_-]?[:=]\s*\S+/gi, 'token=[REDACTED]'],
];

// Multi-line PEM block state machine (per-segment state)
const pemStates = new Map<string, boolean>();

function redactMultiline(line: string, segmentKey: string): { line: string; skip?: boolean } {
  const inPem = pemStates.get(segmentKey) || false;
  
  if (inPem) {
    if (/-----END (?:RSA|EC|PRIVATE) KEY-----/.test(line)) {
      pemStates.set(segmentKey, false);
      return { line: '-----END PRIVATE KEY-----' };
    }
    return { line: '[REDACTED_PEM_LINE]' };
  }
  if (/-----BEGIN (?:RSA|EC|PRIVATE) KEY-----/.test(line)) {
    pemStates.set(segmentKey, true);
    return { line: '-----BEGIN PRIVATE KEY-----[REDACTED]' };
  }
  return { line };
}

function redact(text: string, segmentKey: string): string {
  // Handle multi-line secrets first
  const { line: pemSafeLine } = redactMultiline(text, segmentKey);
  
  // Apply single-line redaction
  let result = pemSafeLine;
  for (const [re, replacement] of SINGLE_LINE_REDACTORS) {
    result = result.replace(re, replacement);
  }
  
  // DoS protection
  const MAX_LINE_SIZE = 256 * 1024; // 256KB
  if (result.length > MAX_LINE_SIZE) {
    result = result.slice(0, MAX_LINE_SIZE) + '…[TRUNCATED]';
  }
  
  return result;
}

// Segment Constants
const SEGMENT_MAX_DURATION = 60 * 60 * 1000; // 1 hour in ms
const SEGMENT_MAX_SIZE = 16 * 1024 * 1024;   // 16MB in bytes

class UnifiedLogger {
  private segments = new Map<LogTier, LogSegment>();
  private redactionEnabled = false; // Matches current buildLogger state
  private isRotating = new Set<LogTier>(); // Recursion guard for segment rotation
  private performanceMetrics = {
    totalEntriesLogged: 0,
    totalBytesWritten: 0,
    totalBackpressureEvents: 0,
    totalBroadcastFailures: 0,
    lastPerformanceReport: Date.now()
  };
  private performanceReportInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Ensure logs directory exists
    this.ensureLogsDirectory();
    
    // Start performance monitoring (report every 5 minutes)
    this.startPerformanceMonitoring();
    
    // Setup graceful shutdown handlers (async)
    process.on('SIGTERM', () => {
      this.shutdown().catch(error => {
        console.error('[UnifiedLogger] Error during SIGTERM shutdown:', error);
        process.exit(1);
      });
    });
    process.on('SIGINT', () => {
      this.shutdown().catch(error => {
        console.error('[UnifiedLogger] Error during SIGINT shutdown:', error);
        process.exit(1);
      });
    });
  }

  private ensureLogsDirectory(): void {
    const baseDir = './logs/unified';
    fs.mkdirSync(baseDir, { recursive: true });
  }

  private getSegmentPath(tier: LogTier): string {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const hour = new Date().toISOString().slice(11, 13); // HH
    const segmentId = ulid();
    
    const dir = `./logs/unified/${day}`;
    fs.mkdirSync(dir, { recursive: true });
    
    return `${dir}/${tier}-${hour}-${INSTANCE_ID}-${segmentId}.ndjson`;
  }

  private shouldRotateSegment(segment: LogSegment): boolean {
    const now = new Date();
    const duration = now.getTime() - segment.startTime.getTime();
    
    return duration >= SEGMENT_MAX_DURATION || segment.size >= SEGMENT_MAX_SIZE;
  }

  private rotateSegment(tier: LogTier): void {
    // Recursion guard: Prevent infinite recursion during rotation
    if (this.isRotating.has(tier)) {
      console.warn(`[UnifiedLogger] Already rotating ${tier} segment, skipping nested rotation`);
      return;
    }

    this.isRotating.add(tier);
    
    try {
      const existing = this.segments.get(tier);
      if (existing) {
        // Use console.log for rotation logging to avoid recursion (industry standard practice)
        console.log(`[UnifiedLogger] Rotating ${tier} segment: ${existing.entriesWritten} entries, ${existing.bytesWritten} bytes, ${Date.now() - existing.startTime.getTime()}ms duration`);
        
        // Expert pattern: End stream and wait for 'finish' before uploading (prevents truncation)
        existing.stream.end();
        existing.stream.once('finish', () => {
          pemStates.delete(existing.filePath);
          try {
            // Fire-and-forget archival (optional service)
            const { logArchivalService } = require('./logArchivalService');
            logArchivalService
              .uploadFinishedSegment(existing.filePath, tier)
              .catch((err: any) => console.error('[UnifiedLogger] Archive upload failed:', err));
          } catch {
            // Archival service optional - continue without it
          }
        });
      }
    } finally {
      // Always remove rotation flag, even if error occurs
      this.isRotating.delete(tier);
    }

    const filePath = this.getSegmentPath(tier);
    const stream = fs.createWriteStream(filePath, { flags: 'a', mode: 0o640 });
    
    const segment: LogSegment = {
      tier,
      filePath,
      stream,
      startTime: new Date(),
      seq: 0,
      size: 0,
      entriesWritten: 0,
      bytesWritten: 0,
      lastWriteTime: Date.now(),
      backpressureCount: 0
    };

    this.segments.set(tier, segment);
  }

  private getOrCreateSegment(tier: LogTier): LogSegment {
    let segment = this.segments.get(tier);
    
    if (!segment || this.shouldRotateSegment(segment)) {
      this.rotateSegment(tier);
      segment = this.segments.get(tier)!;
    }
    
    return segment;
  }

  private writeEntry(entry: LogEntry): void {
    const segment = this.getOrCreateSegment(entry.tier);
    
    // Add sequence number and instanceId
    const enrichedEntry = {
      ...entry,
      seq: ++segment.seq,
      instanceId: INSTANCE_ID,
      timestamp: new Date().toISOString()
    };

    // Apply redaction to message fields if enabled
    if (this.redactionEnabled && 'message' in enrichedEntry && enrichedEntry.message) {
      enrichedEntry.message = redact(enrichedEntry.message, segment.filePath);
    }

    const line = JSON.stringify(enrichedEntry) + '\n';
    const lineSize = Buffer.byteLength(line, 'utf8');
    const written = segment.stream.write(line);
    
    // Update segment performance metrics
    segment.size += lineSize;
    segment.entriesWritten++;
    segment.bytesWritten += lineSize;
    segment.lastWriteTime = Date.now();

    // Update global performance metrics
    this.performanceMetrics.totalEntriesLogged++;
    this.performanceMetrics.totalBytesWritten += lineSize;

    if (!written) {
      // Handle backpressure - track for performance monitoring
      segment.backpressureCount++;
      this.performanceMetrics.totalBackpressureEvents++;
      
      // Log backpressure event (but avoid recursion for system logs)
      if (entry.tier !== 'system') {
        this.system('log_backpressure_detected', 'warn', `Backpressure detected on ${entry.tier} segment`, {
          tier: entry.tier,
          segmentSize: segment.size,
          entriesWritten: segment.entriesWritten,
          backpressureCount: segment.backpressureCount
        });
      } else {
        console.warn(`[UnifiedLogger] Backpressure on ${entry.tier} segment`);
      }
    }

    // Broadcast to WebSocket connections (async, non-blocking)
    process.nextTick(() => {
      try {
        // Dynamic import to avoid circular dependency
        const { broadcastLogEntry } = require('../routes/adminLogStreaming');
        broadcastLogEntry(enrichedEntry);
      } catch (error) {
        // WebSocket module not available or error - track failure
        this.performanceMetrics.totalBroadcastFailures++;
        
        // Log broadcast failure (but avoid recursion for system logs)
        if (entry.tier !== 'system') {
          this.system('log_broadcast_failed', 'warn', 'Failed to broadcast log entry to WebSocket', {
            tier: entry.tier,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    });

    // Fire-and-forget alerting (never blocks log writes)
    process.nextTick(() => {
      try {
        // Fast feature flag check to skip when alerts disabled
        if (process.env.LOG_ALERTS_ENABLED === 'false') {
          return;
        }
        
        // Dynamic import to avoid circular dependency
        const { publishLogForAlerts } = require('./logAlertingService');
        publishLogForAlerts(enrichedEntry);
      } catch (error) {
        // Alerting service optional - silent failure to not impact logging performance
      }
    });
  }

  // Public API - System Events
  system(event: SystemLogEntry['event'], severity: SystemLogEntry['severity'], message: string, metadata?: Record<string, unknown>, correlationId?: string): void {
    this.writeEntry({
      timestamp: '', // Will be set in writeEntry
      instanceId: '', // Will be set in writeEntry
      tier: 'system',
      seq: 0, // Will be set in writeEntry
      event,
      severity,
      message,
      metadata,
      correlationId
    });
  }

  // Public API - Build Events
  build(buildId: string, userId: string, projectId: string, event: BuildLogEntry['event'], message?: string, exitCode?: number, metadata?: Record<string, unknown>): void {
    this.writeEntry({
      timestamp: '', // Will be set in writeEntry
      instanceId: '', // Will be set in writeEntry
      tier: 'build',
      seq: 0, // Will be set in writeEntry
      buildId,
      userId,
      projectId,
      event,
      message,
      exitCode,
      metadata
    });
  }

  // Public API - Deploy Events
  deploy(buildId: string, userId: string, projectId: string, event: DeployLogEntry['event'], message: string, deploymentId?: string, metadata?: Record<string, unknown>): void {
    this.writeEntry({
      timestamp: '', // Will be set in writeEntry
      instanceId: '', // Will be set in writeEntry
      tier: 'deploy',
      seq: 0, // Will be set in writeEntry
      buildId,
      userId,
      projectId,
      deploymentId,
      event,
      message,
      metadata
    });
  }

  // Public API - Action Events
  action(userId: string, action: string, method?: string, path?: string, status?: number, duration?: number, metadata?: Record<string, unknown>, correlationId?: string): void {
    this.writeEntry({
      timestamp: '', // Will be set in writeEntry
      instanceId: '', // Will be set in writeEntry
      tier: 'action',
      seq: 0, // Will be set in writeEntry
      userId,
      action,
      method,
      path,
      status,
      duration,
      metadata,
      correlationId
    });
  }

  // Public API - Lifecycle Events
  lifecycle(event: LifecycleLogEntry['event'], component: string, message: string, metadata?: Record<string, unknown>): void {
    this.writeEntry({
      timestamp: '', // Will be set in writeEntry
      instanceId: '', // Will be set in writeEntry
      tier: 'lifecycle',
      seq: 0, // Will be set in writeEntry
      event,
      component,
      message,
      metadata
    });
  }

  // Performance Monitoring
  private startPerformanceMonitoring(): void {
    // Skip performance monitoring in test environment to prevent resource leaks
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // Report performance metrics every 5 minutes
    this.performanceReportInterval = setInterval(() => {
      this.reportPerformanceMetrics();
    }, 5 * 60 * 1000);
  }

  private reportPerformanceMetrics(): void {
    const now = Date.now();
    const timeSinceLastReport = now - this.performanceMetrics.lastPerformanceReport;
    
    // Collect segment-specific metrics
    const segmentMetrics = Array.from(this.segments.entries()).map(([tier, segment]) => ({
      tier,
      entriesWritten: segment.entriesWritten,
      bytesWritten: segment.bytesWritten,
      segmentSize: segment.size,
      backpressureCount: segment.backpressureCount,
      ageMins: (now - segment.startTime.getTime()) / (60 * 1000)
    }));

    this.system('log_performance_report', 'info', 'Unified Logger Performance Report', {
      reportPeriodMs: timeSinceLastReport,
      globalMetrics: {
        totalEntriesLogged: this.performanceMetrics.totalEntriesLogged,
        totalBytesWritten: this.performanceMetrics.totalBytesWritten,
        totalBackpressureEvents: this.performanceMetrics.totalBackpressureEvents,
        totalBroadcastFailures: this.performanceMetrics.totalBroadcastFailures,
        entriesPerSecond: this.performanceMetrics.totalEntriesLogged / (timeSinceLastReport / 1000),
        bytesPerSecond: this.performanceMetrics.totalBytesWritten / (timeSinceLastReport / 1000)
      },
      segmentMetrics,
      activeSegments: segmentMetrics.length,
      instanceId: INSTANCE_ID
    });

    // Reset counters for next period
    this.performanceMetrics.totalEntriesLogged = 0;
    this.performanceMetrics.totalBytesWritten = 0;
    this.performanceMetrics.totalBackpressureEvents = 0;
    this.performanceMetrics.totalBroadcastFailures = 0;
    this.performanceMetrics.lastPerformanceReport = now;
  }

  // Configuration
  enableRedaction(): void {
    this.redactionEnabled = true;
  }

  disableRedaction(): void {
    this.redactionEnabled = false;
  }

  // Get current performance metrics (for admin API)
  getPerformanceMetrics() {
    const now = Date.now();
    return {
      globalMetrics: {
        ...this.performanceMetrics,
        uptime: now - this.performanceMetrics.lastPerformanceReport
      },
      segmentMetrics: Array.from(this.segments.entries()).map(([tier, segment]) => ({
        tier,
        entriesWritten: segment.entriesWritten,
        bytesWritten: segment.bytesWritten,
        segmentSize: segment.size,
        backpressureCount: segment.backpressureCount,
        ageMins: (now - segment.startTime.getTime()) / (60 * 1000),
        lastWriteAgo: now - segment.lastWriteTime
      })),
      activeSegments: this.segments.size,
      instanceId: INSTANCE_ID
    };
  }

  // Graceful shutdown with proper stream flushing
  async shutdown(): Promise<void> {
    // Stop performance monitoring
    if (this.performanceReportInterval) {
      clearInterval(this.performanceReportInterval);
      this.performanceReportInterval = null;
    }

    const { finished } = require('stream');
    const { promisify } = require('util');
    const streamFinished = promisify(finished);
    
    console.log(`[UnifiedLogger] Starting graceful shutdown of ${this.segments.size} log segments...`);
    
    const shutdownPromises: Promise<void>[] = [];
    
    for (const [tier, segment] of this.segments) {
      const shutdownPromise = this.shutdownSegment(segment, tier, streamFinished);
      shutdownPromises.push(shutdownPromise);
    }
    
    // Wait for all segments to flush with 8-second timeout
    try {
      await Promise.race([
        Promise.all(shutdownPromises),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), 8000)
        )
      ]);
      console.log(`[UnifiedLogger] Graceful shutdown completed successfully`);
    } catch (error) {
      console.warn(`[UnifiedLogger] Shutdown timeout reached, forcing closure:`, (error as Error).message);
      // Force close any remaining streams
      for (const [, segment] of this.segments) {
        try {
          if (!segment.stream.destroyed) {
            segment.stream.destroy();
          }
        } catch (e) {
          // Ignore errors during forced closure
        }
      }
    } finally {
      // Clean up tracking
      for (const [, segment] of this.segments) {
        pemStates.delete(segment.filePath);
      }
      this.segments.clear();
    }
  }
  
  // Individual segment shutdown with proper event handling
  private async shutdownSegment(
    segment: LogSegment, 
    tier: LogTier, 
    streamFinished: (stream: NodeJS.WritableStream) => Promise<void>
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (segment.stream.destroyed || segment.stream.closed) {
        resolve();
        return;
      }
      
      // Set up timeout for this specific segment (3 seconds per segment)
      const segmentTimeout = setTimeout(() => {
        console.warn(`[UnifiedLogger] Timeout flushing ${tier} segment, forcing close`);
        try {
          segment.stream.destroy();
        } catch (e) {
          // Ignore errors during forced closure
        }
        reject(new Error(`Segment ${tier} shutdown timeout`));
      }, 3000);
      
      // Listen for finish event (all data flushed)
      segment.stream.once('finish', () => {
        clearTimeout(segmentTimeout);
        console.log(`[UnifiedLogger] ${tier} segment flushed successfully`);
        resolve();
      });
      
      // Handle errors during shutdown
      segment.stream.once('error', (error) => {
        clearTimeout(segmentTimeout);
        console.error(`[UnifiedLogger] Error during ${tier} segment shutdown:`, error);
        // Don't reject - continue with shutdown even if one segment fails
        resolve();
      });
      
      // End the stream (triggers flush)
      try {
        segment.stream.end();
      } catch (error) {
        clearTimeout(segmentTimeout);
        console.error(`[UnifiedLogger] Error ending ${tier} segment:`, error);
        resolve();
      }
    });
  }

  // Utility - Get current instance ID
  getInstanceId(): string {
    return INSTANCE_ID;
  }
}

// Export singleton instance
export const unifiedLogger = new UnifiedLogger();

// Export for testing/advanced usage
export { UnifiedLogger };