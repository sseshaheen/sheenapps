/**
 * Admin Unified Log Routes
 * 
 * Provides admin-only access to the unified multi-tier logging system with:
 * - JWT-based admin authentication
 * - Tier-based filtering (system, build, deploy, action, lifecycle)
 * - Content-specific filtering (buildId, userId, projectId)
 * - Time-based queries across segments
 * - Instance ID filtering for multi-deployment environments
 * - NDJSON streaming format with optional raw text conversion
 * - DB-first hybrid query strategy
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { PassThrough } from 'stream';
import { requireAdminAuth } from '../middleware/adminAuthentication';
import { adminErrorResponse } from '../middleware/correlationIdMiddleware';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { LogEntry, LogTier, unifiedLogger } from '../services/unifiedLogger';

const loggingService = ServerLoggingService.getInstance();

/**
 * Convert unified NDJSON log entry to raw text format
 */
function formatUnifiedLogEntryAsRaw(logEntry: LogEntry): string | null {
  const timestamp = new Date(logEntry.timestamp).toISOString();
  const tier = logEntry.tier.toUpperCase();
  const instance = logEntry.instanceId.substring(0, 8);
  
  switch (logEntry.tier) {
    case 'system':
      return `[${timestamp}] ${tier} [${instance}] ${logEntry.severity.toUpperCase()} ${logEntry.event}: ${logEntry.message}`;
    
    case 'build':
      const buildPrefix = `[${logEntry.buildId}]`;
      if (logEntry.event === 'stdout' || logEntry.event === 'stderr') {
        return `[${timestamp}] ${tier} [${instance}] ${buildPrefix} (${logEntry.event}) ${logEntry.message || ''}`;
      }
      return `[${timestamp}] ${tier} [${instance}] ${buildPrefix} ${logEntry.event}${logEntry.exitCode !== undefined ? ` (exit: ${logEntry.exitCode})` : ''}`;
    
    case 'deploy':
      return `[${timestamp}] ${tier} [${instance}] [${logEntry.buildId}] ${logEntry.event}: ${logEntry.message}`;
    
    case 'action':
      const actionDetails = logEntry.method && logEntry.path ? ` ${logEntry.method} ${logEntry.path}` : '';
      const statusInfo = logEntry.status ? ` (${logEntry.status})` : '';
      const durationInfo = logEntry.duration ? ` ${logEntry.duration}ms` : '';
      return `[${timestamp}] ${tier} [${instance}] ${logEntry.action}${actionDetails}${statusInfo}${durationInfo}`;
    
    case 'lifecycle':
      return `[${timestamp}] ${tier} [${instance}] [${logEntry.component}] ${logEntry.event}: ${logEntry.message}`;
    
    default:
      return `[${timestamp}] ${tier} [${instance}] ${JSON.stringify(logEntry)}`;
  }
}

/**
 * Scan unified log segments in date range
 */
async function findUnifiedLogSegments(
  startDate: Date,
  endDate: Date,
  tier?: LogTier,
  instanceId?: string
): Promise<string[]> {
  const logsDir = './logs/unified';
  const segments: string[] = [];
  const startDay = startDate.toISOString().slice(0, 10); // YYYY-MM-DD  
  const endDay = endDate.toISOString().slice(0, 10);     // YYYY-MM-DD
  
  try {
    const days = (await fs.promises.readdir(logsDir)).sort(); // folder names YYYY-MM-DD
    
    for (const day of days) {
      if (day < startDay || day > endDay) continue; // inclusive day-window, no Date math
      
      const dayDir = path.join(logsDir, day);
      const files = await fs.promises.readdir(dayDir);
      
      for (const file of files) {
        if (!file.endsWith('.ndjson')) continue;
        
        const parts = file.replace('.ndjson', '').split('-');
        if (parts.length < 4) continue;
        
        const [fileTier, hour, fileInstanceId] = parts;
        
        // Filter by tier if specified
        if (tier && fileTier !== tier) continue;
        
        // Filter by instance if specified  
        if (instanceId && fileInstanceId !== instanceId) continue;
        
        segments.push(path.join(dayDir, file));
      }
    }
  } catch (error) {
    console.error('Error scanning unified log segments:', error);
  }
  
  return segments.sort();
}

export default async function adminUnifiedLogRoutes(fastify: FastifyInstance) {
  // List available log segments
  fastify.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      tier?: LogTier;
      buildId?: string;
      userId?: string;
      projectId?: string;
      instanceId?: string;
    };
  }>('/admin/unified-logs/segments', {
    preHandler: [requireAdminAuth({
      permissions: ['read_logs'],
      logActions: true
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { startDate, endDate, tier, buildId, userId, projectId, instanceId } = request.query as any;
      
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const end = endDate ? new Date(endDate) : new Date();
      
      const segments = await findUnifiedLogSegments(start, end, tier, instanceId);
      
      // Get segment info
      const segmentInfo = await Promise.all(segments.map(async (segmentPath) => {
        try {
          const stats = await fs.promises.stat(segmentPath);
          const filename = path.basename(segmentPath);
          const parts = filename.replace('.ndjson', '').split('-');
          
          return {
            path: segmentPath,
            filename,
            tier: parts[0],
            hour: parts[1],
            instanceId: parts[2],
            size: stats.size,
            modified: stats.mtime
          };
        } catch (error) {
          return null;
        }
      }));
      
      loggingService.logServerEvent('routing', 'info', 'Admin listed unified log segments', {
        startDate: start,
        endDate: end,
        tier,
        buildId,
        userId,
        projectId,
        instanceId,
        segmentCount: segments.length,
        correlationId: request.correlationId
      });
      
      return reply.send({
        success: true,
        segments: segmentInfo.filter(Boolean),
        query: { startDate: start, endDate: end, tier, buildId, userId, projectId, instanceId }
      });
    } catch (error) {
      return adminErrorResponse(request, String(error));
    }
  });

  // Stream unified logs 
  fastify.get<{
    Querystring: {
      tier?: LogTier;
      buildId?: string;
      userId?: string;
      projectId?: string;
      startDate?: string;
      endDate?: string;
      instanceId?: string;
      format?: 'ndjson' | 'raw';
      limit?: string;
      offset?: string;
      sortOrder?: 'asc' | 'desc';
    };
  }>('/admin/unified-logs/stream', {
    preHandler: [requireAdminAuth({
      permissions: ['read_logs'],
      logActions: true
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { 
        tier,
        buildId,
        userId,
        projectId,
        startDate, 
        endDate,
        instanceId, 
        format = 'ndjson',
        limit = '1000',
        offset = '0',
        sortOrder = 'desc'
      } = request.query as any;
      
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
      const end = endDate ? new Date(endDate) : new Date();
      const maxLimit = Math.min(parseInt(limit) || 1000, 10000); // Cap at 10k entries
      const skipEntries = Math.max(parseInt(offset) || 0, 0); // Pagination offset
      
      // Find relevant segments
      const segments = await findUnifiedLogSegments(start, end, tier, instanceId);
      
      // Collect all matching entries first for proper sorting
      const allEntries: LogEntry[] = [];
      
      // Process all segments to collect entries
      for (const segmentPath of segments) {
        try {
          const fileStream = createReadStream(segmentPath);
          const rl = createInterface({
            input: fileStream,
            crlfDelay: Infinity
          });
          
          for await (const line of rl) {
            if (!line.trim()) continue;
            
            try {
              const logEntry = JSON.parse(line) as LogEntry;
              
              // Apply filters
              if (tier && logEntry.tier !== tier) continue;
              if (instanceId && logEntry.instanceId !== instanceId) continue;
              
              // Apply content-specific filters
              if (buildId && 'buildId' in logEntry && logEntry.buildId !== buildId) continue;
              if (userId && 'userId' in logEntry && logEntry.userId !== userId) continue;
              if (projectId && 'projectId' in logEntry && logEntry.projectId !== projectId) continue;
              
              const entryTime = new Date(logEntry.timestamp);
              if (entryTime < start || entryTime > end) continue;
              
              // Collect matching entries
              allEntries.push(logEntry);
              
            } catch (parseError) {
              // Skip malformed entries
              continue;
            }
          }
        } catch (segmentError) {
          console.error(`Error processing segment ${segmentPath}:`, segmentError);
          continue;
        }
      }
      
      // Sort entries by timestamp (DESC = newest first, ASC = oldest first)
      allEntries.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
      
      // Apply pagination after sorting
      const paginatedEntries = allEntries.slice(skipEntries, skipEntries + maxLimit);
      
      // Set response headers and stream results
      const outputStream = new PassThrough();
      reply.raw.setHeader('Content-Type', format === 'ndjson' ? 'application/x-ndjson' : 'text/plain');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.send(outputStream);
      
      // Output paginated and sorted entries
      for (const logEntry of paginatedEntries) {
        if (format === 'raw') {
          const rawLine = formatUnifiedLogEntryAsRaw(logEntry);
          if (rawLine) {
            outputStream.write(rawLine + '\n');
          }
        } else {
          outputStream.write(JSON.stringify(logEntry) + '\n');
        }
      }
      
      outputStream.end();
      
      loggingService.logServerEvent('routing', 'info', 'Admin streamed unified logs', {
        tier,
        buildId,
        userId,
        projectId,
        startDate: start,
        endDate: end,
        instanceId,
        format,
        sortOrder,
        totalMatched: allEntries.length,
        entryCount: paginatedEntries.length,
        correlationId: request.correlationId
      });
      
    } catch (error) {
      reply.raw.statusCode = 500;
      reply.raw.end(JSON.stringify({
        success: false,
        error: 'Internal server error',
        correlationId: request.correlationId
      }));
    }
  });

  // Get specific segment raw content
  fastify.get<{
    Params: { segmentId: string };
    Querystring: { format?: 'ndjson' | 'raw' };
  }>('/admin/unified-logs/segments/:segmentId', {
    preHandler: [requireAdminAuth({
      permissions: ['read_logs'],
      logActions: true
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { segmentId } = request.params as any;
      const { format = 'ndjson' } = request.query as any;
      
      // Security: Validate segment ID format and prevent path traversal
      if (!segmentId.match(/^[a-z]+-\d{2}-[A-Z0-9]{26}-[A-Z0-9]{26}\.ndjson$/)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid segment ID format' },
          correlationId: request.correlationId
        });
      }
      
      // Find the segment file
      const logsDir = './logs/unified';
      let segmentPath: string | null = null;
      
      try {
        const days = await fs.promises.readdir(logsDir);
        for (const day of days) {
          const candidate = path.join(logsDir, day, segmentId);
          if (await fs.promises.access(candidate).then(() => true).catch(() => false)) {
            segmentPath = candidate;
            break;
          }
        }
      } catch (error) {
        // Directory doesn't exist
      }
      
      if (!segmentPath) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Segment not found' },
          correlationId: request.correlationId
        });
      }
      
      const stats = await fs.promises.stat(segmentPath);
      
      // Set response headers
      reply.raw.setHeader('Content-Type', format === 'ndjson' ? 'application/x-ndjson' : 'text/plain');
      reply.raw.setHeader('Content-Length', stats.size.toString());
      reply.raw.setHeader('Cache-Control', 'public, max-age=3600'); // Segments are immutable
      
      const fileStream = createReadStream(segmentPath);
      
      if (format === 'raw') {
        const outputStream = new PassThrough();
        const rl = createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });

        rl.on('line', (line) => {
          if (!line.trim()) return;
          
          try {
            const logEntry = JSON.parse(line) as LogEntry;
            const rawLine = formatUnifiedLogEntryAsRaw(logEntry);
            if (rawLine) {
              outputStream.write(rawLine + '\n');
            }
          } catch (error) {
            // If JSON parsing fails, write the original line
            outputStream.write(line + '\n');
          }
        });

        rl.on('close', () => {
          outputStream.end();
        });

        rl.on('error', (error) => {
          outputStream.destroy(error);
        });
        
        reply.send(outputStream);
      } else {
        reply.send(fileStream);
      }
      
      loggingService.logServerEvent('routing', 'info', 'Admin downloaded unified log segment', {
        segmentId,
        format,
        size: stats.size,
        correlationId: request.correlationId
      });
      
      return;
      
    } catch (error) {
      return adminErrorResponse(request, String(error));
    }
  });

  // Get unified logger performance metrics
  fastify.get<{}>('/admin/unified-logs/performance', {
    preHandler: [requireAdminAuth({
      permissions: ['read_logs'],
      logActions: true
    })]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const performanceMetrics = unifiedLogger.getPerformanceMetrics();
      
      loggingService.logServerEvent('routing', 'info', 'Admin retrieved unified logger performance metrics', {
        activeSegments: performanceMetrics.activeSegments,
        correlationId: request.correlationId
      });
      
      return reply.send({
        success: true,
        performance: performanceMetrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return adminErrorResponse(request, String(error));
    }
  });

  return;
}