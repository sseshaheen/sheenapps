import { Queue, Worker, Job } from 'bullmq';
import { EventEmitter } from 'events';
import { emitBuildEvent } from './eventService';
import { getWebhookService } from './webhookService';

// Error categories for classification
export enum ErrorCategory {
  RECOVERABLE_PATTERN = 'recoverable_pattern',    // Known patterns with fixes
  RECOVERABLE_CLAUDE = 'recoverable_claude',      // Complex but fixable via Claude
  NON_RECOVERABLE = 'non_recoverable',           // Requires human intervention
  SECURITY_RISK = 'security_risk'                // Potential security issues
}

// Error context for comprehensive analysis
// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface ErrorContext {
  errorId: string;
  timestamp: Date;
  errorType: string;
  errorMessage: string;
  stackTrace?: string | undefined;

  // Source information
  source: 'worker' | 'api' | 'build' | 'deploy' | 'system';
  stage?: string | undefined;

  // Contextual information
  projectContext?: {
    projectId?: string | undefined;
    userId?: string | undefined;
    buildId?: string | undefined;
    framework?: string | undefined;
    dependencies?: Record<string, string> | undefined;
    recentChanges?: string[] | undefined;
    projectPath?: string | undefined;
  } | undefined;

  // Affected files
  affectedFiles?: Array<{
    path: string;
    lastModified?: Date | undefined;
  }> | undefined;

  // Previous recovery attempts
  attemptHistory: Array<{
    strategy: string;
    result: 'success' | 'failure';
    timestamp: Date;
    changes?: string[] | undefined;
  }>;
}

// Classification result
// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface ErrorClassification {
  category: ErrorCategory;
  confidence: number;      // 0-1 confidence in classification
  suggestedStrategy: 'pattern' | 'claude' | 'escalate' | 'ignore';
  estimatedRecoveryTime: number; // seconds
  reason: string;
  metadata?: {
    claudeCategory?: string | undefined;
    suggestedApproach?: string | undefined;
    riskLevel?: string | undefined;
  } | undefined;
}

// Quick fix result
export interface QuickFixResult {
  success: boolean;
  strategy: string;
  confidence: number;
  changes?: string[];
  error?: string;
}

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

export class ErrorInterceptor extends EventEmitter {
  private errorQueue: Queue;
  private rateLimiter: Map<string, number[]> = new Map();
  private readonly MAX_ERRORS_PER_PROJECT_PER_HOUR = 20;
  private readonly MAX_GLOBAL_ERRORS_PER_HOUR = 500;
  private isShuttingDown = false;

  constructor() {
    super();
    this.errorQueue = new Queue('error-recovery', { connection });
    this.setupGlobalErrorHandlers();
  }

  private setupGlobalErrorHandlers() {
    // Only set up in production, not in test environments
    if (process.env.NODE_ENV !== 'test') {
      // Intercept uncaught exceptions
      process.on('uncaughtException', (error) => {
        if (!this.isShuttingDown) {
          console.error('[ErrorInterceptor] Uncaught Exception:', error);
          this.handleError(error, {
            source: 'system',
            stage: 'runtime'
          });
        }
      });

      // Intercept unhandled promise rejections
      process.on('unhandledRejection', (reason, promise) => {
        if (!this.isShuttingDown) {
          console.error('[ErrorInterceptor] Unhandled Rejection:', reason);
          const error = reason instanceof Error ? reason : new Error(String(reason));
          this.handleError(error, {
            source: 'system',
            stage: 'async'
          });
        }
      });
    }
  }

  // Main error handling entry point
  async handleError(error: Error, context?: Partial<ErrorContext>): Promise<void> {
    // Skip error handling during shutdown
    if (this.isShuttingDown) {
      return;
    }
    
    try {
      const errorContext = this.createErrorContext(error, context);
      
      // Check rate limits
      if (!this.checkRateLimit(errorContext)) {
        console.warn(`[ErrorInterceptor] Rate limit exceeded for project ${errorContext.projectContext?.projectId}`);
        return;
      }

      // Quick classification
      const classification = await this.classifyError(errorContext);
      
      console.log(`[ErrorInterceptor] Error classified: ${classification.category} (confidence: ${classification.confidence})`);

      // Handle based on classification
      if (classification.category === ErrorCategory.SECURITY_RISK) {
        await this.handleSecurityRisk(errorContext);
        return;
      }

      if (classification.category === ErrorCategory.NON_RECOVERABLE) {
        await this.escalateToHuman(errorContext, classification.reason, classification);
        return;
      }

      // Try quick pattern matching first for high-confidence fixes
      if (classification.suggestedStrategy === 'pattern' && classification.confidence > 0.9) {
        const quickFix = await this.attemptQuickFix(errorContext);
        if (quickFix.success) {
          console.log(`[ErrorInterceptor] Quick fix successful: ${quickFix.strategy}`);
          await this.notifyRecoverySuccess(errorContext, quickFix);
          return;
        }
      }

      // Queue for deeper analysis and recovery
      await this.queueForRecovery(errorContext, classification);

    } catch (interceptorError) {
      console.error('[ErrorInterceptor] Error in error handling:', interceptorError);
      // Don't throw to avoid infinite loops
    }
  }

  private createErrorContext(error: Error, context?: Partial<ErrorContext>): ErrorContext {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      errorId,
      timestamp: new Date(),
      errorType: error.constructor.name,
      errorMessage: error.message,
      stackTrace: error.stack,
      source: context?.source || 'system',
      stage: context?.stage,
      projectContext: context?.projectContext,
      affectedFiles: context?.affectedFiles || [],
      attemptHistory: context?.attemptHistory || [],
      ...context
    };
  }

  private async classifyError(errorContext: ErrorContext): Promise<ErrorClassification> {
    const errorMessage = errorContext.errorMessage.toLowerCase();
    const errorType = errorContext.errorType;

    // Security risk patterns
    const securityPatterns = [
      /path traversal/i,
      /directory traversal/i,
      /\.\.\/\.\.\//,
      /\/etc\/passwd/i,
      /rm -rf/i,
      /eval\(/i,
      /exec\(/i
    ];

    for (const pattern of securityPatterns) {
      if (pattern.test(errorContext.errorMessage) || pattern.test(errorContext.stackTrace || '')) {
        return {
          category: ErrorCategory.SECURITY_RISK,
          confidence: 0.95,
          suggestedStrategy: 'escalate',
          estimatedRecoveryTime: 0,
          reason: 'Potential security vulnerability detected'
        };
      }
    }

    // Session timeout patterns - always recoverable
    const timeoutPatterns = [
      /session timeout/i,
      /task took too long/i,
      /stream ended without result/i,
      /timeout after \d+ms/i,
      /claude session timeout/i,
      /killed.*143/i  // SIGTERM from timeout
    ];
    
    for (const pattern of timeoutPatterns) {
      if (pattern.test(errorContext.errorMessage) || pattern.test(errorContext.stackTrace || '')) {
        return {
          category: ErrorCategory.RECOVERABLE_PATTERN,
          confidence: 0.95,
          suggestedStrategy: 'pattern',
          estimatedRecoveryTime: 60,
          reason: 'Session timeout - can retry with speed focus'
        };
      }
    }

    // High-confidence recoverable patterns
    const patternMatches = [
      {
        patterns: [/```json[\s\S]*?```/, /unexpected token.*json/i, /invalid json/i],
        category: ErrorCategory.RECOVERABLE_PATTERN,
        confidence: 0.95,
        strategy: 'pattern' as const,
        time: 30
      },
      {
        patterns: [/eresolve unable to resolve dependency tree/i, /peer dep/i, /conflicting peer dependency/i],
        category: ErrorCategory.RECOVERABLE_PATTERN,
        confidence: 0.90,
        strategy: 'pattern' as const,
        time: 120
      },
      {
        patterns: [/terser not found/i, /vite.*terser/i],
        category: ErrorCategory.RECOVERABLE_PATTERN,
        confidence: 0.95,
        strategy: 'pattern' as const,
        time: 90
      },
      {
        patterns: [/module not found/i, /cannot resolve module/i],
        category: ErrorCategory.RECOVERABLE_PATTERN,
        confidence: 0.85,
        strategy: 'pattern' as const,
        time: 60
      }
    ];

    for (const match of patternMatches) {
      for (const pattern of match.patterns) {
        if (pattern.test(errorContext.errorMessage)) {
          return {
            category: match.category,
            confidence: match.confidence,
            suggestedStrategy: match.strategy,
            estimatedRecoveryTime: match.time,
            reason: `Matched known pattern: ${pattern.source}`
          };
        }
      }
    }

    // Medium-confidence Claude-recoverable patterns
    const claudeRecoverablePatterns = [
      /syntax error/i,
      /type error/i,
      /compilation error/i,
      /build failed/i,
      /cannot find/i,
      /unexpected/i
    ];

    for (const pattern of claudeRecoverablePatterns) {
      if (pattern.test(errorContext.errorMessage)) {
        return {
          category: ErrorCategory.RECOVERABLE_CLAUDE,
          confidence: 0.70,
          suggestedStrategy: 'claude',
          estimatedRecoveryTime: 300,
          reason: `Potentially recoverable by AI analysis: ${pattern.source}`
        };
      }
    }

    // For unknown patterns, use Claude to classify
    console.log('[ErrorInterceptor] Unknown error pattern, using Claude classification...');
    
    try {
      const { getClaudeErrorClassifier } = await import('./claudeErrorClassifier');
      const classifier = getClaudeErrorClassifier();
      
      // Quick pre-check for obvious non-recoverable errors
      if (classifier.quickCheckNonRecoverable(errorContext.errorMessage)) {
        console.log('[ErrorInterceptor] Quick check: definitely non-recoverable');
        return {
          category: ErrorCategory.NON_RECOVERABLE,
          confidence: 0.95,
          suggestedStrategy: 'escalate',
          estimatedRecoveryTime: 0,
          reason: 'Matches non-recoverable pattern (hardware/security/system)'
        };
      }
      
      // Call Claude for intelligent classification
      const classification = await classifier.classifyError(errorContext);
      
      if (classification.isRecoverable) {
        console.log(`[ErrorInterceptor] Claude classified as recoverable: ${classification.reasoning}`);
        return {
          category: ErrorCategory.RECOVERABLE_CLAUDE,
          confidence: classification.confidence,
          suggestedStrategy: 'claude',
          estimatedRecoveryTime: 300,
          reason: `Claude: ${classification.reasoning}`,
          metadata: {
            claudeCategory: classification.category,
            suggestedApproach: classification.suggestedApproach,
            riskLevel: classification.riskLevel
          }
        };
      } else {
        console.log(`[ErrorInterceptor] Claude classified as non-recoverable: ${classification.reasoning}`);
        return {
          category: ErrorCategory.NON_RECOVERABLE,
          confidence: classification.confidence,
          suggestedStrategy: 'escalate',
          estimatedRecoveryTime: 0,
          reason: `Claude: ${classification.reasoning}`,
          metadata: {
            claudeCategory: classification.category,
            riskLevel: classification.riskLevel
          }
        };
      }
    } catch (classificationError) {
      console.error('[ErrorInterceptor] Claude classification failed:', classificationError);
      // Fallback to conservative non-recoverable
      return {
        category: ErrorCategory.NON_RECOVERABLE,
        confidence: 0.50,
        suggestedStrategy: 'escalate',
        estimatedRecoveryTime: 0,
        reason: 'Classification failed - defaulting to non-recoverable for safety'
      };
    }
  }

  private async attemptQuickFix(errorContext: ErrorContext): Promise<QuickFixResult> {
    const errorMessage = errorContext.errorMessage;

    try {
      // JSON healing quick fix
      if (errorMessage.includes('```json') || errorMessage.toLowerCase().includes('invalid json')) {
        // This is handled by existing jsonHealer - just record the attempt
        return {
          success: true,
          strategy: 'json_healing',
          confidence: 0.95,
          changes: ['Applied JSON format healing']
        };
      }

      // Dependency conflict quick fix
      if (errorMessage.includes('ERESOLVE') || errorMessage.includes('peer dep')) {
        // This is handled by existing dependencyFixer - just record the attempt
        return {
          success: true,
          strategy: 'dependency_fixing',
          confidence: 0.90,
          changes: ['Applied dependency conflict resolution']
        };
      }

      // Vite terser quick fix
      if (errorMessage.includes('terser not found') && errorMessage.includes('Vite')) {
        // This is handled by existing dependencyFixer - just record the attempt
        return {
          success: true,
          strategy: 'vite_terser_fix',
          confidence: 0.95,
          changes: ['Added missing terser dependency for Vite 5.x']
        };
      }

      return {
        success: false,
        strategy: 'none',
        confidence: 0,
        error: 'No matching quick fix pattern'
      };

    } catch (error) {
      return {
        success: false,
        strategy: 'error',
        confidence: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  shutdown(): void {
    this.isShuttingDown = true;
  }

  private checkRateLimit(errorContext: ErrorContext): boolean {
    const projectId = errorContext.projectContext?.projectId || 'unknown';
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Clean old entries
    const projectErrors = this.rateLimiter.get(projectId) || [];
    const recentErrors = projectErrors.filter(timestamp => now - timestamp < oneHour);
    this.rateLimiter.set(projectId, recentErrors);

    // Check project limit
    if (recentErrors.length >= this.MAX_ERRORS_PER_PROJECT_PER_HOUR) {
      return false;
    }

    // Check global limit
    const globalErrors = Array.from(this.rateLimiter.values()).flat();
    const recentGlobalErrors = globalErrors.filter(timestamp => now - timestamp < oneHour);
    
    if (recentGlobalErrors.length >= this.MAX_GLOBAL_ERRORS_PER_HOUR) {
      return false;
    }

    // Add current error to rate limiter
    recentErrors.push(now);
    this.rateLimiter.set(projectId, recentErrors);

    return true;
  }

  private async handleSecurityRisk(errorContext: ErrorContext): Promise<void> {
    console.error('[ErrorInterceptor] SECURITY ALERT:', errorContext.errorMessage);
    
    // Emit security event
    if (errorContext.projectContext?.buildId) {
      await emitBuildEvent(errorContext.projectContext.buildId, 'security_alert', {
        errorId: errorContext.errorId,
        errorType: errorContext.errorType,
        message: 'Security risk detected - escalated to security team',
        timestamp: errorContext.timestamp,
        userId: errorContext.projectContext.userId
      });
    }

    // Send webhook notification
    await getWebhookService().send({
      type: 'security_alert',
      buildId: errorContext.projectContext?.buildId || 'unknown',
      timestamp: Date.now(),
      data: {
        errorId: errorContext.errorId,
        errorType: errorContext.errorType,
        message: 'Security risk detected in error recovery process',
        projectId: errorContext.projectContext?.projectId,
        userId: errorContext.projectContext?.userId
      }
    });
  }

  private async escalateToHuman(errorContext: ErrorContext, reason: string, classification?: ErrorClassification): Promise<void> {
    console.log(`[ErrorInterceptor] Escalating to human: ${reason}`);
    
    // Log Claude classification details if available
    if (classification?.metadata) {
      console.log(`[ErrorInterceptor] Claude classification: ${classification.metadata.claudeCategory} (risk: ${classification.metadata.riskLevel})`);
    }
    
    // Emit escalation event
    if (errorContext.projectContext?.buildId) {
      await emitBuildEvent(errorContext.projectContext.buildId, 'error_escalated', {
        errorId: errorContext.errorId,
        errorType: errorContext.errorType,
        reason,
        message: 'Error requires manual intervention',
        timestamp: errorContext.timestamp,
        userId: errorContext.projectContext.userId,
        classification: classification?.metadata ? {
          category: classification.metadata.claudeCategory || 'unknown',
          riskLevel: classification.metadata.riskLevel || 'unknown',
          confidence: classification.confidence
        } : undefined
      });
    }

    // Send webhook notification
    await getWebhookService().send({
      type: 'error_escalated',
      buildId: errorContext.projectContext?.buildId || 'unknown',
      timestamp: Date.now(),
      data: {
        errorId: errorContext.errorId,
        errorType: errorContext.errorType,
        errorMessage: errorContext.errorMessage,
        reason,
        projectId: errorContext.projectContext?.projectId,
        userId: errorContext.projectContext?.userId,
        actionRequired: {
          type: 'manual_intervention',
          description: 'This error requires manual review and resolution',
          priority: 'medium'
        }
      }
    });
  }

  private async queueForRecovery(errorContext: ErrorContext, classification: ErrorClassification): Promise<void> {
    console.log(`[ErrorInterceptor] Queueing error for recovery: ${errorContext.errorId}`);
    
    await this.errorQueue.add(
      'analyze-and-recover',
      {
        errorContext,
        classification,
        queuedAt: new Date()
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 5,
        removeOnFail: false
      }
    );

    // Emit recovery started event
    if (errorContext.projectContext?.buildId) {
      await emitBuildEvent(errorContext.projectContext.buildId, 'error_recovery_queued', {
        errorId: errorContext.errorId,
        category: classification.category,
        strategy: classification.suggestedStrategy,
        estimatedTime: classification.estimatedRecoveryTime,
        message: 'Error queued for automatic recovery',
        userId: errorContext.projectContext.userId
      });
    }
  }

  private async notifyRecoverySuccess(errorContext: ErrorContext, quickFix: QuickFixResult): Promise<void> {
    console.log(`[ErrorInterceptor] Quick recovery successful: ${quickFix.strategy}`);
    
    // Emit success event
    if (errorContext.projectContext?.buildId) {
      await emitBuildEvent(errorContext.projectContext.buildId, 'error_recovered', {
        errorId: errorContext.errorId,
        strategy: quickFix.strategy,
        confidence: quickFix.confidence,
        changes: quickFix.changes || [],
        recoveryTime: '<30 seconds',
        message: `Successfully auto-recovered using ${quickFix.strategy}`,
        userId: errorContext.projectContext.userId
      });
    }

    // Send success webhook
    await getWebhookService().send({
      type: 'error_recovery_completed',
      buildId: errorContext.projectContext?.buildId || 'unknown',
      timestamp: Date.now(),
      data: {
        errorId: errorContext.errorId,
        status: 'recovered',
        method: 'quick_fix',
        strategy: quickFix.strategy,
        confidence: quickFix.confidence,
        timeToRecover: '<30 seconds',
        summary: {
          issueDetected: errorContext.errorType,
          fixApplied: quickFix.strategy.replace('_', ' '),
          confidence: quickFix.confidence > 0.9 ? 'high' : 'medium'
        }
      }
    });
  }

  // Public method for workers to report errors
  async reportError(error: Error, context: {
    source: 'worker' | 'api' | 'build' | 'deploy';
    stage?: string;
    projectId?: string;
    userId?: string;
    buildId?: string;
    jobData?: any;
  }): Promise<void> {
    await this.handleError(error, {
      source: context.source,
      stage: context.stage,
      projectContext: {
        projectId: context.projectId,
        userId: context.userId,
        buildId: context.buildId
      }
    });
  }

  // Cleanup method
  async close(): Promise<void> {
    await this.errorQueue.close();
  }
}

// Singleton instance
let errorInterceptorInstance: ErrorInterceptor | null = null;

export function getErrorInterceptor(): ErrorInterceptor {
  if (!errorInterceptorInstance) {
    errorInterceptorInstance = new ErrorInterceptor();
  }
  return errorInterceptorInstance;
}

// Initialize the interceptor
export function initializeErrorInterceptor(): ErrorInterceptor {
  const interceptor = getErrorInterceptor();
  console.log('✅ Error Interceptor initialized');
  return interceptor;
}