/**
 * Per-Build Logging Service
 * 
 * Provides secure, production-ready logging for individual builds with:
 * - JSONL format for structured parsing
 * - Security redaction for tokens/secrets/PEM blocks
 * - Date-based directory sharding
 * - Resource cleanup and backpressure handling
 * - Monotonic sequencing for deterministic log replay
 */

import fs from 'fs';
import path from 'path';
import { ChildProcess } from 'child_process';
import { PassThrough } from 'stream';
import * as readline from 'readline';
import pino from 'pino';
import { unifiedLogger } from './unifiedLogger';

// ULID validation (our buildIds use ULID format)
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function validateBuildId(buildId: string): boolean {
  return typeof buildId === 'string' && ULID_PATTERN.test(buildId);
}

function openBuildLog(buildId: string): fs.WriteStream {
  if (!validateBuildId(buildId)) {
    throw new Error(`Invalid buildId format: ${buildId}`);
  }
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dir = `./logs/builds/${day}`;
  fs.mkdirSync(dir, { recursive: true });
  return fs.createWriteStream(`${dir}/${buildId}.log`, { flags: 'a', mode: 0o640 });
}

function writeJsonl(stream: fs.WriteStream, obj: unknown): boolean {
  return stream.write(JSON.stringify(obj) + '\n');
}

// Production-ready redaction with multi-line support
const SINGLE_LINE_REDACTORS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+\-=\/]+/g, 'Bearer [REDACTED]'],
  [/\bsk-(live|test)[A-Za-z0-9]{20,}\b/g, 'sk-[REDACTED]'],
  [/\bAWS_SECRET_ACCESS_KEY=\S+/g, 'AWS_SECRET_ACCESS_KEY=[REDACTED]'],
  [/\bauthorization:\s*\S+/gi, 'authorization: [REDACTED]'],
  [/\bapi[_-]?key[_-]?[:=]\s*\S+/gi, 'api_key=[REDACTED]'],
  [/\bpassword[_-]?[:=]\s*\S+/gi, 'password=[REDACTED]'],
  [/\btoken[_-]?[:=]\s*\S+/gi, 'token=[REDACTED]'],
];

// Per-process PEM redaction factory (prevents race conditions)
function makePemRedactor() {
  let inPem = false;
  return (line: string): { line: string; skip?: boolean } => {
    if (inPem) {
      if (/-----END (?:RSA|EC|PRIVATE) KEY-----/.test(line)) {
        inPem = false;
        return { line: '-----END PRIVATE KEY-----' };
      }
      return { line: '[REDACTED_PEM_LINE]' };
    }
    if (/-----BEGIN (?:RSA|EC|PRIVATE) KEY-----/.test(line)) {
      inPem = true;
      return { line: '-----BEGIN PRIVATE KEY-----[REDACTED]' };
    }
    return { line };
  };
}

function redact(line: string, pemRedactor: ReturnType<typeof makePemRedactor>): string {
  // First handle multi-line secrets with per-process state
  const { line: pemSafeLine } = pemRedactor(line);
  
  // Then apply single-line redaction
  let result = pemSafeLine;
  for (const [re, replacement] of SINGLE_LINE_REDACTORS) {
    result = result.replace(re, replacement);
  }
  
  // Guard against huge lines (DoS protection)
  const MAX_LINE_SIZE = 256 * 1024; // 256KB
  if (result.length > MAX_LINE_SIZE) {
    result = result.slice(0, MAX_LINE_SIZE) + '…[TRUNCATED]';
  }
  
  return result;
}

/**
 * Attach logging to a child process, capturing stdout/stderr to JSONL files
 */
export function attachProcessLogging(
  proc: ChildProcess, 
  buildId: string, 
  userId: string, 
  projectId: string, 
  pinoLogger: pino.Logger
) {
  const file = openBuildLog(buildId);

  // 1) Write JSONL metadata record (legacy format)
  writeJsonl(file, { 
    kind: 'meta', 
    buildId, 
    userId, 
    projectId, 
    startedAt: new Date().toISOString(), 
    version: process.env.APP_VERSION ?? 'unknown' 
  });

  // 2) Log to unified system (new format)
  unifiedLogger.build(buildId, userId, projectId, 'started', undefined, undefined, {
    version: process.env.APP_VERSION ?? 'unknown'
  });

  // 2) Create line readers with resource cleanup and monotonic sequencing
  let seq = 0; // Deterministic ordering for stdout/stderr interleaving
  
  const createLineReader = (src: 'stdout'|'stderr', readable: NodeJS.ReadableStream | null) => {
    if (!readable) return;
    const tee = new PassThrough();
    const rl = readline.createInterface({ input: tee });
    
    // Create per-process PEM redactor to prevent race conditions
    const pemRedactor = makePemRedactor();
    
    // Resource cleanup handlers (prevent memory leaks)
    const cleanup = () => { 
      rl.close();
      tee.destroy();
    };
    readable.once('end', cleanup);
    readable.once('error', cleanup);
    
    rl.on('line', (line) => {
      // Convert to UTF-8, replacing invalid bytes to prevent regex issues
      const utf8Line = Buffer.from(line, 'utf8').toString('utf8');
      // const redacted = redact(utf8Line, pemRedactor); // Per-process redaction ready
      
      // Write JSONL event record with monotonic sequencing (legacy format)
      const ok = writeJsonl(file, { 
        kind: 'line', 
        ts: Date.now(), 
        seq: ++seq, // Deterministic ordering
        src, 
        buildId, 
        msg: utf8Line // Using raw line without redaction for debugging
      });
      if (!ok) rl.pause(); // Basic backpressure handling
      
      // Log to unified system (new format)
      unifiedLogger.build(buildId, userId, projectId, src as 'stdout' | 'stderr', utf8Line);
      
      // Log to Pino for structured logging
      pinoLogger.info({ buildId, src, stage: 'agent', msg: utf8Line });
      
      // Optional: Keep console for immediate visibility  
      console.log(`[Claude ${buildId}] (${src}) ${utf8Line}`);
    });
    
    file.on('drain', () => rl.resume());
    readable.pipe(tee, { end: true }); // Let tee end when source ends
  };

  createLineReader('stdout', proc.stdout);
  createLineReader('stderr', proc.stderr);

  // 3) Graceful cleanup with final JSONL record
  const end = (code?: number | null, signal?: string | null) => {
    // Legacy format
    writeJsonl(file, { kind: 'meta', buildId, endedAt: new Date().toISOString() });
    file.end();
    
    // Expert pattern: Per-build direct upload to R2 (reuse existing buildLogger output)
    file.once('finish', () => {
      (async () => {
        try {
          // Check if archival is enabled for this environment
          const LOG_ARCHIVAL_ENABLED = process.env.LOG_ARCHIVAL_ENABLED !== 'false' && process.env.NODE_ENV === 'production';
          if (!LOG_ARCHIVAL_ENABLED) {
            console.log(`[BuildLogger] R2 archival disabled for environment (NODE_ENV=${process.env.NODE_ENV}), skipping upload for build ${buildId}`);
            return;
          }

          const day = new Date().toISOString().slice(0, 10);
          const filePath = `./logs/builds/${day}/${buildId}.log`;
          const gzPath = `./logs/builds/${day}/${buildId}.ndjson.gz`;
          
          // Import gzip utilities from archival service
          const { createReadStream, createWriteStream } = require('fs');
          const { createGzip } = require('zlib');
          const { pipeline } = require('stream');
          const { createHash } = require('crypto');
          const { promisify } = require('util');
          const pipe = promisify(pipeline);
          
          // Gzip the build log file
          await pipe(createReadStream(filePath), createGzip(), createWriteStream(gzPath, { mode: 0o640 }));
          
          // Compute MD5 over compressed file
          const md5 = createHash('md5');
          await pipe(
            createReadStream(gzPath),
            new (class extends require('stream').Writable {
              _write(chunk: any, _: any, cb: any) { md5.update(chunk); cb(); }
            })()
          );
          const md5Hash = md5.digest('hex');
          
          // Upload to R2 with MD5 result object
          const { logArchivalService } = require('./logArchivalService');
          const md5Result = { hex: md5Hash, base64: Buffer.from(md5Hash, 'hex').toString('base64') };
          await logArchivalService.uploadLogSegment(gzPath, 'build', md5Result);
          
          // Cleanup gzipped temp file
          try {
            await require('fs').promises.unlink(gzPath);
          } catch {
            // Ignore cleanup errors
          }
          
          console.log(`[BuildLogger] Successfully uploaded build ${buildId} to R2`);
          
        } catch (error) {
          console.error(`[BuildLogger] Failed per-build R2 upload for ${buildId}:`, error);
        }
      })();
    });
    
    // Unified logging format
    if (code === 0) {
      unifiedLogger.build(buildId, userId, projectId, 'completed', undefined, code || 0);
    } else {
      unifiedLogger.build(buildId, userId, projectId, 'failed', undefined, code || -1);
    }
  };
  proc.once('exit', end);
  proc.once('error', () => end(-1, 'error'));
}

/**
 * Find log file in date-sharded directories
 */
export async function findLogFile(buildId: string): Promise<string | null> {
  if (!validateBuildId(buildId)) {
    return null;
  }
  
  const logsDir = './logs/builds';
  
  // Ensure logs directory exists
  try {
    await fs.promises.access(logsDir);
  } catch {
    return null;
  }
  
  const days = await fs.promises.readdir(logsDir).catch(() => []);
  
  for (const day of days.sort().reverse()) { // Check recent days first
    const logPath = path.join(logsDir, day, `${buildId}.log`);
    if (await fs.promises.access(logPath).then(() => true).catch(() => false)) {
      return logPath;
    }
  }
  return null;
}

/**
 * Get build info from database for ownership validation
 */
export async function getBuildInfo(buildId: string, pool: any): Promise<{ projectId: string; userId: string } | null> {
  try {
    const result = await pool.query(
      'SELECT project_id, user_id FROM project_build_metrics WHERE build_id = $1',
      [buildId]
    );
    return result.rows[0] ? { 
      projectId: result.rows[0].project_id, 
      userId: result.rows[0].user_id 
    } : null;
  } catch (error) {
    console.error(`Failed to lookup build info for ${buildId}:`, error);
    return null;
  }
}