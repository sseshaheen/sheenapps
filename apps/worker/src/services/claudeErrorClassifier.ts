import { spawn } from 'child_process';
import * as crypto from 'crypto';
import { CACHE_EXPIRY, INTERVALS, CLAUDE_TIMEOUTS } from '../config/timeouts.env';
import { ErrorContext } from './errorInterceptor';
import { emitBuildEvent } from './eventService';

export interface ClassificationResult {
  isRecoverable: boolean;
  category: 'hardware' | 'security' | 'infrastructure' | 'corruption' | 'system' | 'application';
  reasoning: string;
  suggestedApproach?: string;
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number;
}

interface CachedClassification {
  result: ClassificationResult;
  timestamp: number;
  errorHash: string;
}

// Non-fixable error categories
const NON_FIXABLE_PATTERNS = {
  hardware: [
    'disk full', 'out of memory', 'segmentation fault',
    'hardware failure', 'ENOSPC', 'ENOMEM', 'no space left',
    'memory allocation failed', 'heap out of memory'
  ],
  security: [
    'permission denied', 'unauthorized', 'forbidden',
    'security violation', 'malicious', 'injection attempt',
    'EACCES', 'EPERM', 'authentication failed', 'access denied',
    'invalid credentials', 'security risk'
  ],
  infrastructure: [
    'cloudflare suspended', 'api quota exceeded',
    'rate limited', 'account disabled', 'billing issue',
    'service unavailable', 'gateway timeout', '429 too many requests',
    'subscription expired', 'payment required'
  ],
  corruption: [
    'database corrupted', 'filesystem corrupted',
    'invalid state', 'data integrity', 'checksum mismatch',
    'corrupt file', 'malformed data', 'inconsistent state'
  ],
  system: [
    'kernel panic', 'system crash', 'os error',
    'fatal error', 'critical failure', 'system halt',
    'blue screen', 'unrecoverable error', 'catastrophic failure'
  ]
};

export class ClaudeErrorClassifier {
  private cache = new Map<string, CachedClassification>();
  private readonly cacheTimeout = CACHE_EXPIRY.errorClassification;
  private readonly classificationTimeout = CLAUDE_TIMEOUTS.versionClassification;

  constructor() {
    // Clean up old cache entries periodically
    setInterval(() => this.cleanCache(), INTERVALS.cacheCleanup);
  }

  async classifyError(errorContext: ErrorContext): Promise<ClassificationResult> {
    // Generate hash for caching
    const errorHash = this.generateErrorHash(errorContext);

    // Check cache first
    const cached = this.cache.get(errorHash);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log('[Claude Classifier] Using cached classification');
      return cached.result;
    }

    try {
      // Call Claude for classification
      const result = await this.callClaudeForClassification(errorContext);

      // Cache the result
      this.cache.set(errorHash, {
        result,
        timestamp: Date.now(),
        errorHash
      });

      // Emit classification event
      if (errorContext.projectContext?.buildId) {
        await emitBuildEvent(errorContext.projectContext.buildId, 'error_classified', {
          errorId: errorContext.errorId,
          category: result.category,
          isRecoverable: result.isRecoverable,
          confidence: result.confidence,
          reasoning: result.reasoning,
          userId: errorContext.projectContext.userId
        });
      }

      return result;
    } catch (error) {
      console.error('[Claude Classifier] Classification failed:', error);

      // Fallback to conservative non-recoverable
      return {
        isRecoverable: false,
        category: 'system',
        reasoning: 'Classification failed - defaulting to non-recoverable for safety',
        riskLevel: 'high',
        confidence: 0.5
      };
    }
  }

  private async callClaudeForClassification(errorContext: ErrorContext): Promise<ClassificationResult> {
    const prompt = this.buildClassificationPrompt(errorContext);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        claudeProcess.kill();
        reject(new Error('Claude classification timeout'));
      }, this.classificationTimeout);

      const claudeProcess = spawn('claude', [
        '--output-format', 'json'
      ], {
        env: process.env
      });

      let output = '';
      let errorOutput = '';

      claudeProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      claudeProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      claudeProcess.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(new Error(`Claude process failed: ${errorOutput}`));
          return;
        }

        try {
          const response = JSON.parse(output);
          const content = response.content || response.result || '';

          // Extract JSON from Claude's response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No JSON found in Claude response');
          }

          const classification = JSON.parse(jsonMatch[0]) as ClassificationResult;

          // Validate the response
          if (typeof classification.isRecoverable !== 'boolean' ||
              !classification.category ||
              !classification.reasoning ||
              typeof classification.confidence !== 'number') {
            throw new Error('Invalid classification format');
          }

          resolve(classification);
        } catch (error) {
          reject(new Error(`Failed to parse Claude response: ${error}`));
        }
      });

      // Send the prompt
      claudeProcess.stdin.write(prompt);
      claudeProcess.stdin.end();
    });
  }

  private buildClassificationPrompt(errorContext: ErrorContext): string {
    const nonFixableList = Object.entries(NON_FIXABLE_PATTERNS)
      .map(([category, patterns]) =>
        `${category.toUpperCase()}: ${patterns.join(', ')}`
      )
      .join('\n');

    return `You are an error classification system. Analyze the following error and determine if it's recoverable.

CRITICAL RULES - These errors are NEVER recoverable:
${nonFixableList}

Additional rules:
- If the error mentions any of the above patterns (even partially), it is NOT recoverable
- Security-related errors are NEVER recoverable
- Hardware/resource errors are NEVER recoverable
- System-level crashes are NEVER recoverable
- Be conservative - when in doubt, mark as non-recoverable

Error Details:
- Message: ${errorContext.errorMessage}
- Type: ${errorContext.errorType}
- Source: ${errorContext.source || 'unknown'}
- Stage: ${errorContext.stage || 'unknown'}
- Stack trace (first 500 chars): ${(errorContext.stackTrace || '').substring(0, 500)}

Analyze this error and respond with ONLY a JSON object (no markdown, no extra text):
{
  "isRecoverable": boolean,
  "category": "hardware|security|infrastructure|corruption|system|application",
  "reasoning": "brief explanation (max 100 chars)",
  "suggestedApproach": "how to fix if recoverable (max 100 chars)",
  "riskLevel": "low|medium|high",
  "confidence": 0.0-1.0
}

Remember: Be conservative. Protect the system. Mark as non-recoverable if unsure.`;
  }

  private generateErrorHash(errorContext: ErrorContext): string {
    const key = `${errorContext.errorType}:${errorContext.errorMessage}:${errorContext.source}:${errorContext.stage}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  private cleanCache(): void {
    const now = Date.now();
    let removed = 0;

    for (const [hash, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.cacheTimeout) {
        this.cache.delete(hash);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[Claude Classifier] Cleaned ${removed} expired cache entries`);
    }
  }

  /**
   * Quick pre-check to avoid calling Claude for obvious non-recoverable errors
   */
  quickCheckNonRecoverable(errorMessage: string): boolean {
    const lowerMessage = errorMessage.toLowerCase();

    for (const patterns of Object.values(NON_FIXABLE_PATTERNS)) {
      for (const pattern of patterns) {
        if (lowerMessage.includes(pattern.toLowerCase())) {
          return true; // Definitely non-recoverable
        }
      }
    }

    return false; // Might be recoverable, need Claude to check
  }

  /**
   * Get classification statistics
   */
  getStats(): {
    cacheSize: number;
    cacheHitRate: number;
    classifications: { recoverable: number; nonRecoverable: number };
  } {
    // This would need to track actual stats in production
    return {
      cacheSize: this.cache.size,
      cacheHitRate: 0, // Would need to track hits/misses
      classifications: {
        recoverable: 0,
        nonRecoverable: 0
      }
    };
  }
}

// Singleton instance
let classifierInstance: ClaudeErrorClassifier | null = null;

export function getClaudeErrorClassifier(): ClaudeErrorClassifier {
  if (!classifierInstance) {
    classifierInstance = new ClaudeErrorClassifier();
  }
  return classifierInstance;
}
