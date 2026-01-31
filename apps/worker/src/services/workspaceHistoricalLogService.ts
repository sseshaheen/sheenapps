import { createClient } from '@supabase/supabase-js';
import type { LogTier } from './unifiedLogger';
import type { LogStreamEvent } from './workspaceLogStreamingService';

export interface HistoricalLogQuery {
  projectId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  startTime?: Date | undefined;
  endTime?: Date | undefined;
  tier?: LogTier | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  cursor?: string | undefined;
}

export interface HistoricalLogResult {
  logs: LogStreamEvent[];
  hasMore: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  nextCursor?: string | undefined;
  totalMatched?: number | undefined;
}

/**
 * Historical log service for advisor workspace
 * Queries archived logs using the log_archival_status table for efficient retrieval
 */
export class WorkspaceHistoricalLogService {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing for historical log service');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * Query historical logs using log_archival_status for efficient time-range queries
   */
  async queryHistoricalLogs(query: HistoricalLogQuery): Promise<HistoricalLogResult> {
    try {
      const {
        projectId,
        startTime,
        endTime,
        tier,
        limit = 100,
        offset = 0
      } = query;

      // First, find relevant log segments using the archival status table
      const segments = await this.findLogSegments(projectId, startTime, endTime, tier);

      if (segments.length === 0) {
        return {
          logs: [],
          hasMore: false,
          totalMatched: 0
        };
      }

      // Extract log entries from the segments
      const logs = await this.extractLogsFromSegments(segments, tier, startTime, endTime, limit, offset);

      return {
        logs,
        hasMore: logs.length === limit, // Simplified - would need more sophisticated pagination
        totalMatched: logs.length // Simplified - would query count separately for performance
      };

    } catch (error) {
      console.error('Failed to query historical logs:', error);
      return {
        logs: [],
        hasMore: false,
        totalMatched: 0
      };
    }
  }

  /**
   * Find log segments that overlap with the requested time range using GiST index
   */
  private async findLogSegments(
    projectId: string,
    startTime?: Date,
    endTime?: Date,
    tier?: LogTier
  ): Promise<any[]> {
    try {
      let query = this.supabase
        .from('log_archival_status')
        .select('segment_path, r2_key, first_timestamp, last_timestamp, tier, compressed');

      // Use tsrange overlap for efficient time window queries
      if (startTime && endTime) {
        const timeRange = `[${startTime.toISOString()},${endTime.toISOString()}]`;
        query = query.overlaps('ts_range', timeRange);
      } else if (startTime) {
        query = query.gte('last_timestamp', startTime.toISOString());
      } else if (endTime) {
        query = query.lte('first_timestamp', endTime.toISOString());
      }

      // Filter by tier if specified
      if (tier) {
        query = query.eq('tier', tier);
      }

      // Order by time for consistent results
      query = query.order('first_timestamp', { ascending: true });

      const { data, error } = await query;

      if (error) {
        console.error('Failed to find log segments:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error finding log segments:', error);
      return [];
    }
  }

  /**
   * Extract log entries from archived segments
   * In production, this would read from R2 storage or local archived files
   */
  private async extractLogsFromSegments(
    segments: any[],
    tier?: LogTier,
    startTime?: Date,
    endTime?: Date,
    limit = 100,
    offset = 0
  ): Promise<LogStreamEvent[]> {
    const logs: LogStreamEvent[] = [];

    try {
      for (const segment of segments) {
        // In production, this would:
        // 1. Read the actual log file from segment.segment_path or R2 using segment.r2_key
        // 2. Parse NDJSON format logs
        // 3. Filter by time range and tier
        // 4. Convert to LogStreamEvent format

        // For Phase 1, return mock data based on segment metadata
        const mockLogs = this.generateMockLogsFromSegment(segment, tier, startTime, endTime);
        logs.push(...mockLogs);

        // Apply limit
        if (logs.length >= limit + offset) {
          break;
        }
      }

      // Apply offset and limit
      return logs.slice(offset, offset + limit);

    } catch (error) {
      console.error('Error extracting logs from segments:', error);
      return [];
    }
  }

  /**
   * Generate mock logs from segment metadata (Phase 1 implementation)
   * In production, this would be replaced with actual log file reading
   */
  private generateMockLogsFromSegment(
    segment: any,
    tier?: LogTier,
    startTime?: Date,
    endTime?: Date
  ): LogStreamEvent[] {
    const logs: LogStreamEvent[] = [];
    const segmentTier = segment.tier as LogTier;

    // Skip if tier doesn't match filter
    if (tier && segmentTier !== tier) {
      return logs;
    }

    const segmentStart = new Date(segment.first_timestamp);
    const segmentEnd = new Date(segment.last_timestamp);

    // Generate mock log entries for this segment
    const eventCount = 5; // Mock: 5 events per segment
    for (let i = 0; i < eventCount; i++) {
      const eventTime = new Date(segmentStart.getTime() + (i / eventCount) * (segmentEnd.getTime() - segmentStart.getTime()));

      // Apply time range filter
      if (startTime && eventTime < startTime) continue;
      if (endTime && eventTime > endTime) continue;

      logs.push({
        id: `${segment.segment_path}-${i}`,
        timestamp: eventTime.toISOString(),
        tier: segmentTier,
        message: this.generateMockMessage(segmentTier),
        projectId: '', // Would be extracted from segment metadata
        sequence: Date.now() + i
      });
    }

    return logs;
  }

  /**
   * Generate mock log messages based on tier
   */
  private generateMockMessage(tier: LogTier): string {
    const messages = {
      system: ['System initialized', 'Configuration loaded', 'Health check passed'],
      build: ['Build started', 'Compiling source files', 'Build completed successfully'],
      deploy: ['Deployment initiated', 'Pushing to production', 'Deployment successful'],
      action: ['Action triggered', 'Processing request', 'Action completed'],
      lifecycle: ['Project created', 'Environment setup', 'Resources allocated']
    };

    const tierMessages = messages[tier] ?? ['Log entry'];
    return tierMessages[Math.floor(Math.random() * tierMessages.length)] ?? 'Log entry';
  }

  /**
   * Get log statistics for a project and time range
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async getLogStatistics(
    projectId: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<{
    totalSegments: number;
    tierCounts: Record<LogTier, number>;
    timeRange: { earliest?: string | undefined; latest?: string | undefined };
    totalSize: number;
  }> {
    try {
      let query = this.supabase
        .from('log_archival_status')
        .select('tier, file_size_bytes, first_timestamp, last_timestamp');

      // Apply time filters
      if (startTime && endTime) {
        const timeRange = `[${startTime.toISOString()},${endTime.toISOString()}]`;
        query = query.overlaps('ts_range', timeRange);
      } else if (startTime) {
        query = query.gte('last_timestamp', startTime.toISOString());
      } else if (endTime) {
        query = query.lte('first_timestamp', endTime.toISOString());
      }

      const { data, error } = await query;

      if (error || !data) {
        throw error;
      }

      // Calculate statistics
      const tierCounts: Record<LogTier, number> = {
        system: 0,
        build: 0,
        deploy: 0,
        action: 0,
        lifecycle: 0
      };

      let totalSize = 0;
      let earliest: string | undefined;
      let latest: string | undefined;

      for (const segment of data) {
        tierCounts[segment.tier as LogTier]++;
        totalSize += segment.file_size_bytes;

        if (!earliest || segment.first_timestamp < earliest) {
          earliest = segment.first_timestamp;
        }
        if (!latest || segment.last_timestamp > latest) {
          latest = segment.last_timestamp;
        }
      }

      return {
        totalSegments: data.length,
        tierCounts,
        timeRange: { earliest, latest },
        totalSize
      };

    } catch (error) {
      console.error('Failed to get log statistics:', error);
      return {
        totalSegments: 0,
        tierCounts: { system: 0, build: 0, deploy: 0, action: 0, lifecycle: 0 },
        timeRange: {},
        totalSize: 0
      };
    }
  }

  /**
   * Search logs by content (would require full-text search index in production)
   */
  async searchLogs(
    projectId: string,
    searchTerm: string,
    options: {
      tier?: LogTier;
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    } = {}
  ): Promise<LogStreamEvent[]> {
    // Phase 1: Return empty results
    // In production, this would use PostgreSQL full-text search or Elasticsearch
    console.log(`Search not implemented in Phase 1: "${searchTerm}" for project ${projectId}`);
    return [];
  }
}

// Export singleton instance
export const workspaceHistoricalLogService = new WorkspaceHistoricalLogService();