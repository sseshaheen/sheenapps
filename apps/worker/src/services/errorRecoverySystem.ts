import { shutdownErrorRecoveryWorker, startErrorRecoveryWorker } from '../workers/errorRecoveryWorker';
import { getClaudeResolver } from './claudeErrorResolver';
import { getErrorInterceptor, initializeErrorInterceptor } from './errorInterceptor';
import { getPatternDatabase } from './errorPatternDatabase';
import { getFixSandbox } from './fixSandbox';
import { getFixValidator } from './fixValidator';

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface ErrorRecoveryConfig {
  enabled: boolean;
  claude: {
    enabled: boolean;
    apiKey?: string | undefined;
    model: string;
    maxCostPerHour: number;
  };
  patterns: {
    autoLearn: boolean;
    customPatternsPath?: string | undefined;
  };
  sandbox: {
    enabled: boolean;
    maxConcurrent: number;
    cleanupIntervalHours: number;
  };
  security: {
    allowedCommands: string[];
    blockedPatterns: string[];
    maxRiskLevel: 'low' | 'medium' | 'high';
  };
  monitoring: {
    metricsEnabled: boolean;
    alertThresholds: {
      failureRate: number;
      avgRecoveryTime: number;
    };
  };
}

const DEFAULT_CONFIG: ErrorRecoveryConfig = {
  enabled: process.env.ERROR_RECOVERY_ENABLED === 'true',
  claude: {
    enabled: process.env.CLAUDE_RECOVERY_ENABLED === 'true',
    apiKey: process.env.CLAUDE_API_KEY,
    model: 'claude-3-sonnet-20240229',
    maxCostPerHour: 5.0 // $5/hour limit
  },
  patterns: {
    autoLearn: true,
    customPatternsPath: process.env.CUSTOM_PATTERNS_PATH
  },
  sandbox: {
    enabled: true,
    maxConcurrent: 3,
    cleanupIntervalHours: 2
  },
  security: {
    allowedCommands: [
      'npm install',
      'npm audit fix',
      'pnpm install',
      'git init',
      'git add',
      'git commit',
      'npx tsc --noEmit'
    ],
    blockedPatterns: [
      'rm -rf',
      'sudo',
      'chmod 777',
      '../../../',
      'eval(',
      'exec(',
      '/etc/passwd'
    ],
    maxRiskLevel: 'medium'
  },
  monitoring: {
    metricsEnabled: true,
    alertThresholds: {
      failureRate: 0.5, // 50% failure rate threshold
      avgRecoveryTime: 300 // 5 minutes average recovery time threshold
    }
  }
};

export class ErrorRecoverySystem {
  private config: ErrorRecoveryConfig;
  private initialized = false;
  private cleanupInterval?: NodeJS.Timeout;
  private metrics = {
    startTime: Date.now(),
    totalErrors: 0,
    recoveredErrors: 0,
    failedRecoveries: 0,
    avgRecoveryTime: 0,
    totalCost: 0
  };

  constructor(config?: Partial<ErrorRecoveryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Error Recovery System already initialized');
      return;
    }

    console.log('🚀 Attempting to initialize the Error Recovery System...');

    if (!this.config.enabled) {
      console.log('⚠️ Error Recovery System is disabled');
      return;
    }

    try {
      // Initialize core components
      console.log('📡 Initializing error interceptor...');
      const errorInterceptor = initializeErrorInterceptor();

      console.log('📊 Initializing pattern database...');
      const patternDatabase = getPatternDatabase();
      await patternDatabase.initialize();

      console.log('🛡️ Initializing fix sandbox...');
      const fixSandbox = getFixSandbox();
      await fixSandbox.initialize();

      console.log('✅ Initializing fix validator...');
      const fixValidator = getFixValidator();
      await fixValidator.initialize();

      // Initialize Claude resolver if enabled
      if (this.config.claude.enabled) {
        console.log('🤖 Initializing Claude error resolver...');
        const claudeResolver = getClaudeResolver({
          apiKey: this.config.claude.apiKey,
          model: this.config.claude.model,
          maxTokens: 4000,
          temperature: 0.2,
          timeout: 60000,
          retryAttempts: 3,
          costLimit: this.config.claude.maxCostPerHour / 12 // Per 5-minute window
        });

        // Test Claude API health
        const health = await claudeResolver.checkApiHealth();
        if (!health.available) {
          console.warn(`⚠️ Claude API not available: ${health.error}`);
          this.config.claude.enabled = false;
        } else {
          console.log(`✅ Claude API healthy (latency: ${health.latency}ms)`);
        }
      }

      // Start the error recovery worker
      console.log('⚙️ Starting error recovery worker...');
      await startErrorRecoveryWorker();

      // Set up periodic cleanup
      if (this.config.sandbox.enabled) {
        this.setupCleanupSchedule();
      }

      // Set up monitoring
      if (this.config.monitoring.metricsEnabled) {
        this.setupMonitoring();
      }

      this.initialized = true;
      console.log('✅ Error Recovery System initialized successfully!');
      this.logSystemStatus();

    } catch (error) {
      console.error('❌ Failed to initialize Error Recovery System:', error);
      throw error;
    }
  }

  private setupCleanupSchedule(): void {
    const intervalMs = this.config.sandbox.cleanupIntervalHours * 60 * 60 * 1000;

    this.cleanupInterval = setInterval(async () => {
      try {
        console.log('🧹 Running periodic cleanup...');
        const fixValidator = getFixValidator();
        await fixValidator.cleanup();

        const fixSandbox = getFixSandbox();
        await fixSandbox.cleanupOldSandboxes();

        console.log('✅ Cleanup completed');
      } catch (error) {
        console.error('❌ Cleanup failed:', error);
      }
    }, intervalMs);
  }

  private setupMonitoring(): void {
    // Set up metrics collection
    const errorInterceptor = getErrorInterceptor();

    errorInterceptor.on('error_processed', (data: any) => {
      this.metrics.totalErrors++;
      if (data.recovered) {
        this.metrics.recoveredErrors++;
        this.updateAvgRecoveryTime(data.recoveryTime);
      } else {
        this.metrics.failedRecoveries++;
      }
    });

    // Periodic metrics logging
    setInterval(() => {
      this.logMetrics();
      this.checkAlertThresholds();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private updateAvgRecoveryTime(newTime: number): void {
    const totalRecoveries = this.metrics.recoveredErrors;
    this.metrics.avgRecoveryTime =
      (this.metrics.avgRecoveryTime * (totalRecoveries - 1) + newTime) / totalRecoveries;
  }

  private checkAlertThresholds(): void {
    const { totalErrors, failedRecoveries, avgRecoveryTime } = this.metrics;
    const { alertThresholds } = this.config.monitoring;

    if (totalErrors > 0) {
      const failureRate = failedRecoveries / totalErrors;

      if (failureRate > alertThresholds.failureRate) {
        console.warn(`🚨 High failure rate: ${(failureRate * 100).toFixed(1)}% (threshold: ${(alertThresholds.failureRate * 100).toFixed(1)}%)`);
      }

      if (avgRecoveryTime > alertThresholds.avgRecoveryTime) {
        console.warn(`🚨 High recovery time: ${(avgRecoveryTime / 1000).toFixed(1)}s (threshold: ${alertThresholds.avgRecoveryTime}s)`);
      }
    }
  }

  private logSystemStatus(): void {
    console.log('📋 Error Recovery System Status:');
    console.log(`  🔧 Enabled: ${this.config.enabled}`);
    console.log(`  🤖 Claude: ${this.config.claude.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  🛡️ Sandbox: ${this.config.sandbox.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  📊 Monitoring: ${this.config.monitoring.metricsEnabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  🔒 Max Risk Level: ${this.config.security.maxRiskLevel}`);
  }

  private logMetrics(): void {
    const uptime = Date.now() - this.metrics.startTime;
    const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(1);
    const successRate = this.metrics.totalErrors > 0 ?
      (this.metrics.recoveredErrors / this.metrics.totalErrors * 100).toFixed(1) : '0';

    console.log(`📊 Error Recovery Metrics (${uptimeHours}h uptime):`);
    console.log(`  📈 Total Errors: ${this.metrics.totalErrors}`);
    console.log(`  ✅ Recovered: ${this.metrics.recoveredErrors} (${successRate}%)`);
    console.log(`  ❌ Failed: ${this.metrics.failedRecoveries}`);
    console.log(`  ⏱️ Avg Recovery Time: ${(this.metrics.avgRecoveryTime / 1000).toFixed(1)}s`);
    console.log(`  💰 Total Cost: $${this.metrics.totalCost.toFixed(2)}`);
  }

  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, { status: string; details?: any }>;
    metrics: {
      startTime: number;
      totalErrors: number;
      recoveredErrors: number;
      failedRecoveries: number;
      avgRecoveryTime: number;
      totalCost: number;
    };
  }> {
    const components: Record<string, { status: string; details?: any }> = {};

    try {
      // Check pattern database
      const patternDb = getPatternDatabase();
      const patternStats = patternDb.getPatternStats();
      components.patternDatabase = {
        status: patternStats.total > 0 ? 'healthy' : 'warning',
        details: patternStats
      };

      // Check Claude API if enabled
      if (this.config.claude.enabled) {
        const claudeResolver = getClaudeResolver();
        const claudeHealth = await claudeResolver.checkApiHealth();
        components.claudeApi = {
          status: claudeHealth.available ? 'healthy' : 'unhealthy',
          details: claudeHealth
        };
      }

      // Check sandbox system
      if (this.config.sandbox.enabled) {
        const fixValidator = getFixValidator();
        const validationStats = await fixValidator.getValidationStats();
        components.sandbox = {
          status: validationStats.sandboxes.active < this.config.sandbox.maxConcurrent ? 'healthy' : 'warning',
          details: validationStats
        };
      }

      // Determine overall health
      const componentStatuses = Object.values(components).map(c => c.status);
      const hasUnhealthy = componentStatuses.includes('unhealthy');
      const hasWarning = componentStatuses.includes('warning');

      const status = hasUnhealthy ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy';

      return {
        status,
        components,
        metrics: { ...this.metrics }
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        components: {
          system: {
            status: 'unhealthy',
            details: { error: error instanceof Error ? error.message : String(error) }
          }
        },
        metrics: { ...this.metrics }
      };
    }
  }

  async updateConfig(newConfig: Partial<ErrorRecoveryConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    console.log('🔄 Error Recovery System configuration updated');

    // Restart components that might need reconfiguration
    if (newConfig.claude && this.initialized) {
      console.log('🔄 Reinitializing Claude resolver...');
      // Claude resolver will pick up new config on next instantiation
    }
  }

  getConfig(): ErrorRecoveryConfig {
    return { ...this.config };
  }

  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    console.log('🛑 Shutting down Error Recovery System...');

    try {
      // Stop cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Stop error recovery worker
      await shutdownErrorRecoveryWorker();

      // Final cleanup
      const fixValidator = getFixValidator();
      await fixValidator.cleanup();

      this.initialized = false;
      console.log('✅ Error Recovery System shut down successfully');

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let errorRecoverySystemInstance: ErrorRecoverySystem | null = null;

export function getErrorRecoverySystem(config?: Partial<ErrorRecoveryConfig>): ErrorRecoverySystem {
  if (!errorRecoverySystemInstance) {
    errorRecoverySystemInstance = new ErrorRecoverySystem(config);
  }
  return errorRecoverySystemInstance;
}

// Convenience function for initialization
export async function initializeErrorRecoverySystem(config?: Partial<ErrorRecoveryConfig>): Promise<ErrorRecoverySystem> {
  const system = getErrorRecoverySystem(config);
  await system.initialize();
  return system;
}
