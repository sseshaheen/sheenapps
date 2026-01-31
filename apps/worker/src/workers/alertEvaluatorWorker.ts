/**
 * Alert Evaluator Worker
 *
 * Runs every minute to evaluate all enabled alert rules against current metrics.
 * Fires alerts when thresholds are breached and resolves them with hysteresis.
 *
 * Architecture:
 * - Runs on interval (default: 1 minute)
 * - Evaluates all enabled rules
 * - Uses fingerprinting for per-dimension alert uniqueness
 * - Implements hysteresis (10% buffer) to prevent flapping
 * - Sends notifications via Slack/Email/Webhook
 * - Creates incidents for critical alerts
 */

import { getAlertService } from '../services/admin/AlertService';
import { ServerLoggingService } from '../services/serverLoggingService';

// Configuration
const EVALUATION_INTERVAL_MS = 60_000; // 1 minute
const MAX_CONSECUTIVE_ERRORS = 5;

// Worker state
let evaluationInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let consecutiveErrors = 0;
let lastEvaluationTime: Date | null = null;
let lastEvaluationResult: {
  rulesEvaluated: number;
  alertsFired: number;
  alertsResolved: number;
} | null = null;

const logger = ServerLoggingService.getInstance();

/**
 * Run a single evaluation cycle
 */
async function runEvaluationCycle(): Promise<void> {
  if (isRunning) {
    logger.warn('Evaluation cycle already running, skipping');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const alertService = getAlertService();
    const result = await alertService.evaluateAlerts();

    lastEvaluationTime = new Date();
    lastEvaluationResult = result;
    consecutiveErrors = 0;

    const duration = Date.now() - startTime;

    logger.info('Alert evaluation cycle completed', {
      rulesEvaluated: result.rulesEvaluated,
      alertsFired: result.alertsFired,
      alertsResolved: result.alertsResolved,
      durationMs: duration,
    });

    // Log if any alerts were fired or resolved
    if (result.alertsFired > 0) {
      logger.warn('Alerts fired during evaluation', {
        count: result.alertsFired,
      });
    }

    if (result.alertsResolved > 0) {
      logger.info('Alerts resolved during evaluation', {
        count: result.alertsResolved,
      });
    }
  } catch (error) {
    consecutiveErrors++;

    logger.error('Alert evaluation cycle failed', {
      error,
      consecutiveErrors,
    });

    // If too many consecutive errors, pause the worker
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      logger.error('Too many consecutive errors, pausing alert evaluator', {
        maxErrors: MAX_CONSECUTIVE_ERRORS,
      });
      stopAlertEvaluator();
    }
  } finally {
    isRunning = false;
  }
}

/**
 * Start the alert evaluator worker
 */
export function startAlertEvaluator(): void {
  if (evaluationInterval) {
    logger.warn('Alert evaluator already running');
    return;
  }

  logger.info('Starting alert evaluator worker', {
    intervalMs: EVALUATION_INTERVAL_MS,
  });

  // Run initial evaluation
  runEvaluationCycle().catch((err) => {
    logger.error('Initial evaluation failed', { error: err });
  });

  // Schedule recurring evaluations
  evaluationInterval = setInterval(() => {
    runEvaluationCycle().catch((err) => {
      logger.error('Scheduled evaluation failed', { error: err });
    });
  }, EVALUATION_INTERVAL_MS);

  logger.info('Alert evaluator worker started');
}

/**
 * Stop the alert evaluator worker
 */
export function stopAlertEvaluator(): void {
  if (!evaluationInterval) {
    return;
  }

  logger.info('Stopping alert evaluator worker');

  clearInterval(evaluationInterval);
  evaluationInterval = null;
  isRunning = false;

  logger.info('Alert evaluator worker stopped');
}

/**
 * Get alert evaluator status
 */
export function getAlertEvaluatorStatus(): {
  running: boolean;
  lastEvaluationTime: Date | null;
  lastEvaluationResult: {
    rulesEvaluated: number;
    alertsFired: number;
    alertsResolved: number;
  } | null;
  consecutiveErrors: number;
} {
  return {
    running: evaluationInterval !== null,
    lastEvaluationTime,
    lastEvaluationResult,
    consecutiveErrors,
  };
}

/**
 * Reset error count (for manual recovery)
 */
export function resetAlertEvaluatorErrors(): void {
  consecutiveErrors = 0;
  logger.info('Alert evaluator error count reset');
}

/**
 * Force immediate evaluation (for testing/debugging)
 */
export async function forceEvaluation(): Promise<void> {
  logger.info('Force evaluation requested');
  await runEvaluationCycle();
}
