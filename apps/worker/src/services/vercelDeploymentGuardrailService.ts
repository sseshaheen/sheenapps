import { getPool } from './database';
import { ServerLoggingService } from './serverLoggingService';
import { randomUUID } from 'crypto';

/**
 * Vercel Deployment Guardrail Service
 * Implements safety checks and warnings for production deployments
 * Prevents accidental deployments and enforces deployment policies
 */

export interface DeploymentWarning {
  type: 'branch_mismatch' | 'non_main_production' | 'missing_tests' | 'large_deployment' | 'recent_failure' | 'manual_confirmation';
  severity: 'info' | 'warning' | 'error';
  message: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  details?: any | undefined;
  blockDeployment: boolean;
  canOverride: boolean;
  overrideReason?: string | undefined;
}

export interface DeploymentGuardrailConfig {
  enabled: boolean;
  productionBranches: string[]; // e.g., ['main', 'master', 'production']
  requireTestsForProduction: boolean;
  blockNonMainProduction: boolean;
  allowOverrides: boolean;
  maxDeploymentSizeMB: number;
  recentFailureThresholdHours: number;
  requireManualConfirmation: boolean;
}

export interface GuardrailCheckContext {
  projectId: string;
  branch: string;
  targetEnvironment: 'production' | 'preview';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  deploymentSize?: number | undefined;
  hasTests?: boolean | undefined;
  commitSha: string;
  requestedBy: string;
  overrideToken?: string | undefined;
}

export class VercelDeploymentGuardrailService {
  private loggingService: ServerLoggingService;

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
  }

  /**
   * Check deployment against guardrails and return warnings/blocks
   */
  async checkDeploymentGuardrails(context: GuardrailCheckContext): Promise<DeploymentWarning[]> {
    const warnings: DeploymentWarning[] = [];

    try {
      // Get guardrail configuration for project
      const config = await this.getGuardrailConfig(context.projectId);
      
      if (!config.enabled) {
        return warnings;
      }

      // Check branch-based rules
      if (context.targetEnvironment === 'production') {
        const branchWarnings = await this.checkBranchRules(context, config);
        warnings.push(...branchWarnings);
      }

      // Check test requirements
      if (config.requireTestsForProduction && context.targetEnvironment === 'production') {
        const testWarnings = await this.checkTestRequirements(context);
        warnings.push(...testWarnings);
      }

      // Check deployment size limits
      if (config.maxDeploymentSizeMB > 0 && context.deploymentSize) {
        const sizeWarnings = this.checkDeploymentSize(context, config);
        warnings.push(...sizeWarnings);
      }

      // Check recent failure patterns
      const failureWarnings = await this.checkRecentFailures(context, config);
      warnings.push(...failureWarnings);

      // Check manual confirmation requirement
      if (config.requireManualConfirmation && context.targetEnvironment === 'production') {
        const confirmationWarnings = await this.checkManualConfirmation(context);
        warnings.push(...confirmationWarnings);
      }

      await this.logGuardrailCheck(context, warnings);

      return warnings;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'deployment_guardrail_check_error',
        error as Error,
        { projectId: context.projectId, branch: context.branch }
      );

      // Return a blocking warning if guardrail check fails
      return [{
        type: 'manual_confirmation',
        severity: 'error',
        message: 'Unable to verify deployment safety - manual confirmation required',
        blockDeployment: true,
        canOverride: true
      }];
    }
  }

  /**
   * Validate override token for bypassing warnings
   */
  async validateOverrideToken(
    projectId: string, 
    overrideToken: string, 
    userId: string
  ): Promise<{ valid: boolean; reason?: string; expiresAt?: Date }> {
    try {
      const result = await getPool().query(`
        SELECT 
          id, expires_at, used_at, override_reason,
          created_by, max_uses, current_uses
        FROM vercel_deployment_overrides 
        WHERE token = $1 AND project_id = $2 AND (expires_at IS NULL OR expires_at > NOW())
      `, [overrideToken, projectId]);

      if (result.rows.length === 0) {
        return { valid: false, reason: 'Invalid or expired override token' };
      }

      const override = result.rows[0];

      // Check if token has been used too many times
      if (override.max_uses && override.current_uses >= override.max_uses) {
        return { valid: false, reason: 'Override token has been used maximum number of times' };
      }

      // Increment usage count
      await getPool().query(
        'UPDATE vercel_deployment_overrides SET current_uses = current_uses + 1, used_at = NOW() WHERE id = $1',
        [override.id]
      );

      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Deployment override token used',
        {
          projectId,
          userId,
          overrideId: override.id,
          reason: override.override_reason
        }
      );

      return {
        valid: true,
        reason: override.override_reason,
        expiresAt: override.expires_at
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'override_token_validation_error',
        error as Error,
        { projectId, userId }
      );
      return { valid: false, reason: 'Error validating override token' };
    }
  }

  /**
   * Create override token for bypassing deployment warnings
   */
  async createOverrideToken(
    projectId: string,
    userId: string,
    reason: string,
    expiresInHours: number = 24,
    maxUses: number = 1
  ): Promise<string> {
    const token = randomUUID() + '-' + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await getPool().query(`
      INSERT INTO vercel_deployment_overrides (
        id, project_id, token, created_by, override_reason,
        expires_at, max_uses, current_uses, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW())
    `, [
      randomUUID(),
      projectId,
      token,
      userId,
      reason,
      expiresAt,
      maxUses
    ]);

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Deployment override token created',
      {
        projectId,
        userId,
        reason,
        expiresInHours,
        maxUses
      }
    );

    return token;
  }

  /**
   * Get guardrail configuration for project
   */
  private async getGuardrailConfig(projectId: string): Promise<DeploymentGuardrailConfig> {
    const result = await getPool().query(`
      SELECT vpm.metadata
      FROM vercel_project_mappings vpm
      WHERE vpm.project_id = $1
    `, [projectId]);

    if (result.rows.length === 0) {
      throw new Error('Project mapping not found');
    }

    const metadata = result.rows[0].metadata || {};
    const guardrails = metadata.guardrails || {};

    return {
      enabled: guardrails.enabled !== false, // Default to enabled
      productionBranches: guardrails.productionBranches || ['main', 'master'],
      requireTestsForProduction: guardrails.requireTests || false,
      blockNonMainProduction: guardrails.blockNonMainProduction !== false, // Default to true
      allowOverrides: guardrails.allowOverrides !== false, // Default to true
      maxDeploymentSizeMB: guardrails.maxDeploymentSizeMB || 100,
      recentFailureThresholdHours: guardrails.recentFailureThresholdHours || 1,
      requireManualConfirmation: guardrails.requireManualConfirmation || false
    };
  }

  /**
   * Check branch-based deployment rules
   */
  private async checkBranchRules(
    context: GuardrailCheckContext,
    config: DeploymentGuardrailConfig
  ): Promise<DeploymentWarning[]> {
    const warnings: DeploymentWarning[] = [];

    // Check if branch is allowed for production
    const isProductionBranch = config.productionBranches.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(context.branch);
      }
      return pattern === context.branch;
    });

    if (!isProductionBranch && config.blockNonMainProduction) {
      warnings.push({
        type: 'non_main_production',
        severity: 'error',
        message: `Production deployments are restricted to these branches: ${config.productionBranches.join(', ')}`,
        details: {
          currentBranch: context.branch,
          allowedBranches: config.productionBranches
        },
        blockDeployment: true,
        canOverride: config.allowOverrides
      });
    } else if (!isProductionBranch) {
      warnings.push({
        type: 'branch_mismatch',
        severity: 'warning',
        message: `Deploying branch '${context.branch}' to production. Consider using: ${config.productionBranches.join(', ')}`,
        details: {
          currentBranch: context.branch,
          recommendedBranches: config.productionBranches
        },
        blockDeployment: false,
        canOverride: true
      });
    }

    return warnings;
  }

  /**
   * Check test requirements
   */
  private async checkTestRequirements(context: GuardrailCheckContext): Promise<DeploymentWarning[]> {
    const warnings: DeploymentWarning[] = [];

    // Check if tests are present and passing
    if (context.hasTests === false) {
      warnings.push({
        type: 'missing_tests',
        severity: 'warning',
        message: 'No tests detected for production deployment',
        details: {
          recommendation: 'Add automated tests to ensure code quality'
        },
        blockDeployment: false,
        canOverride: true
      });
    }

    // TODO: Could integrate with CI/CD systems to check test status
    // For now, this is a placeholder for test validation

    return warnings;
  }

  /**
   * Check deployment size limits
   */
  private checkDeploymentSize(
    context: GuardrailCheckContext,
    config: DeploymentGuardrailConfig
  ): DeploymentWarning[] {
    const warnings: DeploymentWarning[] = [];

    if (context.deploymentSize && context.deploymentSize > config.maxDeploymentSizeMB) {
      warnings.push({
        type: 'large_deployment',
        severity: 'warning',
        message: `Large deployment detected (${context.deploymentSize}MB > ${config.maxDeploymentSizeMB}MB limit)`,
        details: {
          deploymentSize: context.deploymentSize,
          limit: config.maxDeploymentSizeMB,
          recommendation: 'Consider optimizing build size or splitting deployment'
        },
        blockDeployment: false,
        canOverride: true
      });
    }

    return warnings;
  }

  /**
   * Check for recent deployment failures
   */
  private async checkRecentFailures(
    context: GuardrailCheckContext,
    config: DeploymentGuardrailConfig
  ): Promise<DeploymentWarning[]> {
    const warnings: DeploymentWarning[] = [];

    const cutoffTime = new Date(Date.now() - config.recentFailureThresholdHours * 60 * 60 * 1000);

    const recentFailures = await getPool().query(`
      SELECT COUNT(*) as failure_count
      FROM vercel_deployments
      WHERE 
        project_id = $1 
        AND deployment_state = 'ERROR'
        AND created_at > $2
    `, [context.projectId, cutoffTime]);

    const failureCount = parseInt(recentFailures.rows[0].failure_count);

    if (failureCount > 0) {
      warnings.push({
        type: 'recent_failure',
        severity: failureCount >= 3 ? 'error' : 'warning',
        message: `${failureCount} recent deployment failure(s) in the last ${config.recentFailureThresholdHours} hour(s)`,
        details: {
          failureCount,
          timeWindowHours: config.recentFailureThresholdHours,
          recommendation: 'Review recent failures before deploying'
        },
        blockDeployment: failureCount >= 3,
        canOverride: true
      });
    }

    return warnings;
  }

  /**
   * Check manual confirmation requirement
   */
  private async checkManualConfirmation(context: GuardrailCheckContext): Promise<DeploymentWarning[]> {
    const warnings: DeploymentWarning[] = [];

    // If no override token provided, require confirmation
    if (!context.overrideToken) {
      warnings.push({
        type: 'manual_confirmation',
        severity: 'info',
        message: 'Production deployment requires manual confirmation',
        details: {
          instruction: 'Please confirm this deployment by providing an override token or using the confirmation UI'
        },
        blockDeployment: true,
        canOverride: true
      });
    }

    return warnings;
  }

  /**
   * Log guardrail check results
   */
  private async logGuardrailCheck(context: GuardrailCheckContext, warnings: DeploymentWarning[]): Promise<void> {
    const blockingWarnings = warnings.filter(w => w.blockDeployment);
    const nonBlockingWarnings = warnings.filter(w => !w.blockDeployment);

    await this.loggingService.logServerEvent(
      'capacity',
      blockingWarnings.length > 0 ? 'warn' : 'info',
      'Deployment guardrail check completed',
      {
        projectId: context.projectId,
        branch: context.branch,
        targetEnvironment: context.targetEnvironment,
        totalWarnings: warnings.length,
        blockingWarnings: blockingWarnings.length,
        nonBlockingWarnings: nonBlockingWarnings.length,
        warningTypes: warnings.map(w => w.type),
        hasOverrideToken: !!context.overrideToken
      }
    );

    // Store guardrail check in database for audit trail
    await getPool().query(`
      INSERT INTO vercel_deployment_guardrail_checks (
        id, project_id, branch, target_environment, commit_sha, requested_by,
        warnings, blocking_warnings, override_token_used, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `, [
      randomUUID(),
      context.projectId,
      context.branch,
      context.targetEnvironment,
      context.commitSha,
      context.requestedBy,
      JSON.stringify(warnings),
      blockingWarnings.length,
      !!context.overrideToken
    ]);
  }
}

// Database schema for deployment guardrails
export const DEPLOYMENT_GUARDRAILS_SCHEMA_SQL = `
-- Deployment override tokens
CREATE TABLE IF NOT EXISTS vercel_deployment_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  override_reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deployment guardrail audit log
CREATE TABLE IF NOT EXISTS vercel_deployment_guardrail_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch VARCHAR(255) NOT NULL,
  target_environment VARCHAR(20) NOT NULL,
  commit_sha VARCHAR(255) NOT NULL,
  requested_by VARCHAR(255) NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  blocking_warnings INTEGER DEFAULT 0,
  override_token_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for guardrail tables
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_overrides_project 
  ON vercel_deployment_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_vercel_deployment_overrides_token 
  ON vercel_deployment_overrides(token) WHERE expires_at > NOW();
CREATE INDEX IF NOT EXISTS idx_vercel_guardrail_checks_project 
  ON vercel_deployment_guardrail_checks(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_guardrail_checks_blocking 
  ON vercel_deployment_guardrail_checks(project_id, blocking_warnings) 
  WHERE blocking_warnings > 0;
`;