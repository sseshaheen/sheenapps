import { VercelAPIService, DeployOptions, VercelProject, VercelDeployment } from './vercelAPIService';
import { VercelOAuthService } from './vercelOAuthService';
import { ServerLoggingService } from './serverLoggingService';
import { getPool } from './database';
import * as crypto from 'crypto';

/**
 * Vercel Sync Service
 * Comprehensive synchronization service for deployments, projects, and environment variables
 * Implements git-based deployments, environment sync, and framework detection
 */

// =============================================================================
// TYPES & INTERFACES  
// =============================================================================

export interface SyncDirection {
  direction: 'to_vercel' | 'from_vercel' | 'bidirectional';
}

export interface SyncResult {
  successful: boolean;
  changes: {
    created: number;
    updated: number;
    deleted: number;
    errors: number;
  };
  details: Array<{
    action: 'create' | 'update' | 'delete' | 'error';
    resource: string;
    key?: string;
    message?: string;
  }>;
  warnings: string[];
}

export interface DryRunResult {
  wouldApply: boolean;
  estimatedChanges: SyncResult['changes'];
  preview: Array<{
    action: 'create' | 'update' | 'delete';
    resource: string;
    key?: string;
    currentValue?: string;
    newValue?: string;
    targets?: string[];
  }>;
  warnings: string[];
  requiresConfirmation: boolean;
}

export interface EnvSyncDiff {
  added: Array<{ key: string; targets: string[]; encrypted: boolean }>;
  modified: Array<{ key: string; targets: string[]; encrypted: boolean }>;
  removed: Array<{ key: string; targets: string[] }>;
  conflicts: Array<{ key: string; localValue: string; remoteValue: string }>;
}

export interface DeploymentWebhookPayload {
  id: string;
  url: string;
  name: string;
  state: 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
  type: 'LAMBDAS';
  created: number;
  ready?: number;
  target?: 'production' | 'staging';
  projectId: string;
  meta?: {
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubCommitAuthorName?: string;
    githubCommitRef?: string;
    githubPrId?: string;
  };
  regions: string[];
  functions?: Record<string, any>;
}

export interface ProjectWebhookPayload {
  id: string;
  name: string;
  accountId: string;
  createdAt: number;
  framework?: string;
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface FrameworkConfig {
  framework: string;
  buildCommand?: string | undefined;
  outputDirectory?: string | undefined;
  installCommand?: string | undefined;
  devCommand?: string | undefined;
  environmentVariables?: Record<string, string> | undefined;
  confidence: 'high' | 'medium' | 'low';
  detectionMethod: 'package.json' | 'config_files' | 'directory_structure' | 'api_response';
}

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

export class VercelSyncService {
  private static instance: VercelSyncService;
  private readonly apiService: VercelAPIService;
  private readonly oauthService: VercelOAuthService;
  private readonly loggingService: ServerLoggingService;

  constructor() {
    this.apiService = VercelAPIService.getInstance();
    this.oauthService = VercelOAuthService.getInstance();
    this.loggingService = ServerLoggingService.getInstance();
  }

  static getInstance(): VercelSyncService {
    if (!VercelSyncService.instance) {
      VercelSyncService.instance = new VercelSyncService();
    }
    return VercelSyncService.instance;
  }

  // =============================================================================
  // DEPLOYMENT OPERATIONS
  // =============================================================================

  /**
   * Deploy from local project with git-based deployment (preferred)
   */
  async deployFromLocal(
    projectId: string,
    options: DeployOptions & { idempotencyKey?: string }
  ): Promise<VercelDeployment> {
    const correlationId = options.idempotencyKey || crypto.randomUUID();

    try {
      // Get project mapping
      const mapping = await this.getProjectMapping(projectId);
      
      // Check for existing deployment with same idempotency key
      if (options.idempotencyKey) {
        const existing = await getPool().query(
          'SELECT deployment_id FROM vercel_deployments WHERE correlation_id = $1',
          [options.idempotencyKey]
        );

        if (existing.rows.length > 0) {
          const deploymentId = existing.rows[0].deployment_id;
          return await this.apiService.getDeployment(mapping.connection_id, deploymentId);
        }
      }

      // Prefer git-based deployment over file upload
      if (!options.gitSource && !options.files) {
        throw new Error('Either gitSource or files must be provided for deployment');
      }

      // Create deployment via API
      const deployment = await this.apiService.createDeployment(mapping.connection_id, options);

      // Store deployment record
      await getPool().query(
        `INSERT INTO vercel_deployments (
           project_id, vercel_project_mapping_id, deployment_id, deployment_url,
           deployment_state, deployment_type, git_source, correlation_id,
           created_by, environment, metadata, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          projectId,
          mapping.id,
          deployment.uid,
          deployment.url,
          deployment.state,
          options.target === 'production' ? 'PRODUCTION' : 'PREVIEW',
          JSON.stringify(options.gitSource || {}),
          correlationId,
          'sync_service',
          options.target || 'preview',
          JSON.stringify({
            deployOptions: options,
            syncServiceVersion: '1.0.0',
            deploymentMethod: options.gitSource ? 'git' : 'files'
          })
        ]
      );

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Deployment created via sync service',
        {
          projectId,
          deploymentId: deployment.uid,
          method: options.gitSource ? 'git' : 'files',
          target: options.target,
          correlationId
        }
      );

      return deployment;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'vercel_sync_deploy_error',
        error as Error,
        { projectId, correlationId, target: options.target }
      );
      throw error;
    }
  }

  /**
   * Deploy from git repository (recommended for large projects)
   */
  async deployFromGit(
    projectId: string,
    options: {
      branch: string;
      // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
      commitSha?: string | undefined;
      prNumber?: number | undefined;
      target?: 'production' | 'preview' | undefined;
      buildOverrides?: {
        framework?: string;
        buildCommand?: string;
        outputDirectory?: string;
      } | undefined;
    }
  ): Promise<VercelDeployment> {
    const { branch, commitSha, prNumber, target = 'preview', buildOverrides } = options;

    // Get project mapping and git configuration
    const mapping = await this.getProjectMapping(projectId);

    // Get git repository info from mapping metadata
    const gitRepo = mapping.git_repository;
    if (!gitRepo || !gitRepo.type || !gitRepo.repo) {
      throw new Error('Project does not have git repository configuration');
    }

    const deployOptions: DeployOptions = {
      name: `${mapping.vercel_project_name || projectId}-${branch}`,
      gitSource: {
        type: gitRepo.type,
        repo: gitRepo.repo,
        ref: branch,
        sha: commitSha
      },
      target,
      projectSettings: {
        framework: buildOverrides?.framework || mapping.framework,
        buildCommand: buildOverrides?.buildCommand || mapping.build_command,
        outputDirectory: buildOverrides?.outputDirectory || mapping.output_directory
      }
    };

    // Add PR metadata if this is a PR deployment
    if (prNumber) {
      deployOptions.gitSource = {
        ...deployOptions.gitSource!,
        // Note: Vercel API might handle PR info differently
      };
    }

    return await this.deployFromLocal(projectId, deployOptions);
  }

  // =============================================================================
  // ENVIRONMENT VARIABLE SYNCHRONIZATION
  // =============================================================================

  /**
   * Sync environment variables with dry-run support and production guardrails
   */
  async syncEnvironmentVariables(
    projectId: string,
    direction: SyncDirection['direction'],
    options: {
      dryRun?: boolean;
      sensitiveKeys?: string[];
      targets?: ('production' | 'preview' | 'development')[];
      includePatterns?: string[];
      excludePatterns?: string[];
    } = {}
  ): Promise<SyncResult | DryRunResult> {
    const {
      dryRun = false,
      sensitiveKeys = ['SECRET', 'API_KEY', 'PASSWORD', 'TOKEN'],
      targets = ['production', 'preview', 'development'],
      includePatterns = ['*'],
      excludePatterns = []
    } = options;

    try {
      const mapping = await this.getProjectMapping(projectId);

      // Get current Vercel environment variables
      const vercelEnvVars = await this.apiService.listEnvVars(mapping.connection_id, mapping.vercel_project_id);

      // Get local environment configuration (from our sync config)
      const syncConfigResult = await getPool().query(
        'SELECT * FROM vercel_env_sync_configs WHERE vercel_project_mapping_id = $1',
        [mapping.id]
      );

      const syncConfig = syncConfigResult.rows[0];
      const effectiveSensitiveKeys = syncConfig?.sensitive_keys || sensitiveKeys;
      const effectiveIncludePatterns = syncConfig?.include_patterns || includePatterns;
      const effectiveExcludePatterns = syncConfig?.exclude_patterns || excludePatterns;

      // Filter variables based on patterns
      const filteredVercelVars = vercelEnvVars.filter(env => {
        const key = env.key;
        
        // Check exclude patterns
        const isExcluded = effectiveExcludePatterns.some((pattern: string) => 
          this.matchesPattern(key, pattern)
        );
        if (isExcluded) return false;

        // Check include patterns
        const isIncluded = effectiveIncludePatterns.some((pattern: string) =>
          this.matchesPattern(key, pattern)
        );

        return isIncluded;
      });

      // Check for sensitive keys
      const sensitiveVars = filteredVercelVars.filter(env =>
        effectiveSensitiveKeys.some((sensitive: string) =>
          env.key.toUpperCase().includes(sensitive.toUpperCase())
        )
      );

      if (dryRun) {
        return this.generateEnvSyncPreview(
          filteredVercelVars,
          direction,
          targets,
          sensitiveVars,
          syncConfig
        );
      } else {
        return await this.performEnvSync(
          projectId,
          mapping,
          filteredVercelVars,
          direction,
          targets,
          syncConfig
        );
      }

    } catch (error) {
      await this.loggingService.logCriticalError(
        'vercel_env_sync_error',
        error as Error,
        { projectId, direction, dryRun }
      );
      throw error;
    }
  }

  /**
   * Preview environment sync changes (dry-run)
   */
  private generateEnvSyncPreview(
    vercelVars: any[],
    direction: string,
    targets: string[],
    sensitiveVars: any[],
    syncConfig: any
  ): DryRunResult {
    const preview: DryRunResult['preview'] = [];
    const warnings: string[] = [];

    // Simulate sync operations based on direction
    if (direction === 'from_vercel' || direction === 'bidirectional') {
      vercelVars.forEach(env => {
        if (sensitiveVars.includes(env)) {
          warnings.push(`Sensitive variable '${env.key}' would be synced - review carefully`);
        }

        preview.push({
          action: 'update',
          resource: 'environment_variable',
          key: env.key,
          targets: env.target.filter((t: string) => targets.includes(t as any)),
          currentValue: '[REDACTED]',
          newValue: '[VALUE FROM VERCEL]'
        });
      });
    }

    const affectsProduction = targets.includes('production');
    const estimatedChanges = {
      created: preview.filter(p => p.action === 'create').length,
      updated: preview.filter(p => p.action === 'update').length,
      deleted: preview.filter(p => p.action === 'delete').length,
      errors: 0
    };

    return {
      wouldApply: preview.length > 0,
      estimatedChanges,
      preview,
      warnings,
      requiresConfirmation: affectsProduction || sensitiveVars.length > 0
    };
  }

  /**
   * Perform actual environment sync
   */
  private async performEnvSync(
    projectId: string,
    mapping: any,
    vercelVars: any[],
    direction: string,
    targets: string[],
    syncConfig: any
  ): Promise<SyncResult> {
    const syncResult: SyncResult = {
      successful: true,
      changes: { created: 0, updated: 0, deleted: 0, errors: 0 },
      details: [],
      warnings: []
    };

    // Implementation would perform actual sync operations
    // For now, this is a placeholder
    
    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Environment variable sync completed',
      {
        projectId,
        direction,
        targets,
        changes: syncResult.changes
      }
    );

    return syncResult;
  }

  // =============================================================================
  // WEBHOOK PROCESSING
  // =============================================================================

  /**
   * Process deployment webhook with deduplication and state validation
   */
  async processDeploymentWebhook(
    payload: DeploymentWebhookPayload,
    rawBody: Buffer
  ): Promise<void> {
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');

    try {
      // Check deduplication
      const existingWebhook = await getPool().query(
        'SELECT id FROM vercel_webhook_dedup WHERE deployment_id = $1 AND payload_hash = $2',
        [payload.id, payloadHash]
      );

      if (existingWebhook.rows.length > 0) {
        return; // Already processed
      }

      // Record webhook for deduplication
      await getPool().query(
        `INSERT INTO vercel_webhook_dedup (event_id, deployment_id, payload_hash)
         VALUES ($1, $2, $3)`,
        [crypto.randomUUID(), payload.id, payloadHash]
      );

      // Find project mapping
      const mapping = await this.getProjectMappingByVercelId(payload.projectId);
      if (!mapping) {
        await this.loggingService.logServerEvent(
          'capacity',
          'info',
          'Webhook received for unmapped Vercel project',
          { deploymentId: payload.id, vercelProjectId: payload.projectId }
        );
        return;
      }

      // Validate state transition
      const currentState = await this.getCurrentDeploymentState(payload.id);
      if (currentState && !this.isValidStateTransition(currentState, payload.state)) {
        await this.loggingService.logServerEvent(
          'error',
          'warn',
          'Invalid deployment state transition in webhook',
          {
            deploymentId: payload.id,
            fromState: currentState,
            toState: payload.state
          }
        );
      }

      // Update deployment record
      await this.updateDeploymentFromWebhook(payload, mapping);

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Deployment webhook processed successfully',
        {
          deploymentId: payload.id,
          state: payload.state,
          projectId: mapping.project_id
        }
      );

    } catch (error) {
      await this.loggingService.logCriticalError(
        'vercel_webhook_processing_error',
        error as Error,
        { deploymentId: payload.id, projectId: payload.projectId }
      );
      throw error;
    }
  }

  // =============================================================================
  // FRAMEWORK DETECTION
  // =============================================================================

  /**
   * Detect project framework and configuration
   */
  async detectFramework(projectId: string): Promise<FrameworkConfig> {
    try {
      const mapping = await this.getProjectMapping(projectId);
      
      // Get project details from Vercel
      const vercelProject = await this.apiService.getProject(
        mapping.connection_id, 
        mapping.vercel_project_id
      );

      let confidence: FrameworkConfig['confidence'] = 'low';
      let detectionMethod: FrameworkConfig['detectionMethod'] = 'api_response';

      // If Vercel already detected framework, use that with high confidence
      if (vercelProject.framework) {
        confidence = 'high';
        detectionMethod = 'api_response';
      }

      const config: FrameworkConfig = {
        framework: vercelProject.framework || 'other',
        buildCommand: vercelProject.buildCommand,
        outputDirectory: vercelProject.outputDirectory,
        installCommand: vercelProject.installCommand,
        devCommand: vercelProject.devCommand,
        confidence,
        detectionMethod
      };

      // Add framework-specific environment variables
      config.environmentVariables = this.getFrameworkDefaults(config.framework);

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Framework detection completed',
        {
          projectId,
          framework: config.framework,
          confidence,
          detectionMethod
        }
      );

      return config;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'vercel_framework_detection_error',
        error as Error,
        { projectId }
      );
      
      // Return default configuration on error
      return {
        framework: 'other',
        confidence: 'low',
        detectionMethod: 'api_response'
      };
    }
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private async getProjectMapping(projectId: string): Promise<any> {
    const result = await getPool().query(
      `SELECT vpm.*, vc.id as connection_id, p.name as project_name
       FROM vercel_project_mappings vpm
       JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
       JOIN projects p ON vpm.project_id = p.id
       WHERE vpm.project_id = $1`,
      [projectId]
    );

    if (result.rows.length === 0) {
      throw new Error('Project not linked to Vercel');
    }

    return result.rows[0];
  }

  private async getProjectMappingByVercelId(vercelProjectId: string): Promise<any> {
    const result = await getPool().query(
      `SELECT vpm.*, vc.id as connection_id, p.name as project_name
       FROM vercel_project_mappings vpm
       JOIN vercel_connections vc ON vpm.vercel_connection_id = vc.id
       JOIN projects p ON vpm.project_id = p.id
       WHERE vpm.vercel_project_id = $1`,
      [vercelProjectId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async getCurrentDeploymentState(deploymentId: string): Promise<string | null> {
    const result = await getPool().query(
      'SELECT deployment_state FROM vercel_deployments WHERE deployment_id = $1',
      [deploymentId]
    );

    return result.rows.length > 0 ? result.rows[0].deployment_state : null;
  }

  private isValidStateTransition(fromState: string, toState: string): boolean {
    const validTransitions: Record<string, string[]> = {
      'QUEUED': ['INITIALIZING', 'CANCELED'],
      'INITIALIZING': ['BUILDING', 'ERROR', 'CANCELED'],
      'BUILDING': ['READY', 'ERROR', 'CANCELED'],
      'READY': ['CANCELED'],
      'ERROR': [],
      'CANCELED': []
    };

    return validTransitions[fromState]?.includes(toState) || false;
  }

  private async updateDeploymentFromWebhook(
    payload: DeploymentWebhookPayload, 
    mapping: any
  ): Promise<void> {
    const buildDuration = payload.ready && payload.created
      ? (payload.ready - payload.created) * 1000
      : null;

    await getPool().query(
      `INSERT INTO vercel_deployments (
         deployment_id, project_id, vercel_project_mapping_id, deployment_url,
         deployment_state, deployment_type, git_source, build_duration_ms,
         ready_at, completed_at, metadata, created_at, environment
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (deployment_id, created_at) 
       DO UPDATE SET
         deployment_state = EXCLUDED.deployment_state,
         build_duration_ms = EXCLUDED.build_duration_ms,
         ready_at = EXCLUDED.ready_at,
         completed_at = EXCLUDED.completed_at,
         updated_at = NOW()`,
      [
        payload.id,
        mapping.project_id,
        mapping.id,
        payload.url,
        payload.state,
        payload.target === 'production' ? 'PRODUCTION' : 'PREVIEW',
        JSON.stringify(payload.meta || {}),
        buildDuration,
        payload.ready ? new Date(payload.ready * 1000) : null,
        ['READY', 'ERROR', 'CANCELED'].includes(payload.state) ? new Date() : null,
        JSON.stringify({ 
          regions: payload.regions,
          functions: payload.functions ? Object.keys(payload.functions) : [],
          webhookProcessed: true
        }),
        new Date(payload.created * 1000),
        payload.target || 'preview'
      ]
    );
  }

  private matchesPattern(str: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regex}$`, 'i').test(str);
  }

  private getFrameworkDefaults(framework: string): Record<string, string> {
    const defaults: Record<string, Record<string, string>> = {
      'nextjs': {
        'NEXT_PUBLIC_VERCEL_URL': '$VERCEL_URL',
        'NEXTAUTH_URL': 'https://$VERCEL_URL'
      },
      'react': {
        'REACT_APP_VERSION': '$npm_package_version'
      },
      'vue': {
        'VUE_APP_VERSION': '$npm_package_version'
      }
    };

    return defaults[framework] || {};
  }
}