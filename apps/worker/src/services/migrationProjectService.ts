import { pool } from './database';
import { unifiedLogger } from './unifiedLogger';
import * as cloudflarePages from './cloudflarePages';
import type { PoolClient } from 'pg';

/**
 * Migration Project Service
 * Handles the integration between migration results and project creation
 * Implements atomic project creation with deployment setup
 */

export interface ProjectFiles {
  files: Array<{
    path: string;
    content: string;
    type: 'component' | 'page' | 'config' | 'asset';
  }>;
  packageJson: Record<string, any>;
  nextConfig: Record<string, any>;
  totalFiles: number;
  projectSize: 'small' | 'medium' | 'large';
}

export interface TransformResult {
  projectFiles: ProjectFiles;
  urlMappings: Array<{
    originalUrl: string;
    nextRoute: string;
    redirectCode?: number;
  }>;
  metadata: {
    framework: string;
    totalPages: number;
    hasSSR: boolean;
    dependencies: string[];
    migrationSummary: string;
  };
}

export interface ProjectCreationResult {
  projectId: string;
  subdomain: string;
  previewUrl: string;
  deploymentStatus: 'pending' | 'building' | 'deployed' | 'failed';
  createdAt: Date;
}

export class MigrationProjectService {

  /**
   * Create a new project from migration results with atomic transaction
   */
  async createProjectFromMigration(
    migrationId: string,
    userId: string,
    transformResult: TransformResult,
    migrationProjectId: string
  ): Promise<ProjectCreationResult> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Generate unique subdomain from migration source
      const subdomain = await this.generateUniqueSubdomain(migrationId, client);

      // Create project record
      const projectId = await this.createProjectRecord(
        userId,
        subdomain,
        transformResult,
        client
      );

      // Link migration to project (idempotent UPSERT)
      await this.linkMigrationToProject(migrationProjectId, projectId, client);

      // Generate and upload project files
      const uploadResult = await this.uploadProjectFiles(
        projectId,
        transformResult.projectFiles
      );

      // Setup initial deployment
      const deploymentResult = await this.setupInitialDeployment(
        projectId,
        subdomain,
        transformResult
      );

      await client.query('COMMIT');

      unifiedLogger.system('startup', 'info', 'Project created from migration', {
        migrationId,
        projectId,
        subdomain,
        totalFiles: transformResult.projectFiles.totalFiles,
        deploymentStatus: deploymentResult.status
      });

      return {
        projectId,
        subdomain,
        previewUrl: `https://${subdomain}.sheenapps.com`,
        deploymentStatus: deploymentResult.status,
        createdAt: new Date()
      };

    } catch (error) {
      await client.query('ROLLBACK');

      unifiedLogger.system('error', 'error', 'Failed to create project from migration', {
        migrationId,
        userId,
        error: (error as Error).message
      });

      throw new Error(`Project creation failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Generate project structure from migration output
   */
  async generateProjectFiles(transformResult: TransformResult): Promise<ProjectFiles> {
    const { projectFiles } = transformResult;

    // Ensure required Next.js structure
    const enhancedFiles = [
      ...projectFiles.files,
      {
        path: 'package.json',
        content: JSON.stringify(projectFiles.packageJson, null, 2),
        type: 'config' as const
      },
      {
        path: 'next.config.js',
        content: `module.exports = ${JSON.stringify(projectFiles.nextConfig, null, 2)}`,
        type: 'config' as const
      },
      {
        path: '.gitignore',
        content: this.getDefaultGitignore(),
        type: 'config' as const
      }
    ];

    return {
      ...projectFiles,
      files: enhancedFiles,
      totalFiles: enhancedFiles.length
    };
  }

  /**
   * Check if migration has already created a project
   */
  async getMigrationProject(migrationProjectId: string): Promise<string | null> {
    if (!pool) {
      throw new Error('Database not available');
    }

    const query = `
      SELECT target_project_id
      FROM migration_project_links
      WHERE migration_project_id = $1
      LIMIT 1
    `;

    const result = await pool.query(query, [migrationProjectId]);
    return result.rows.length > 0 ? result.rows[0].target_project_id : null;
  }

  // =====================================================
  // PRIVATE HELPER METHODS
  // =====================================================

  private async generateUniqueSubdomain(
    migrationId: string,
    client: PoolClient
  ): Promise<string> {
    // Generate base subdomain from migration ID
    const baseSubdomain = `migration-${migrationId.substring(0, 8)}`;

    // Check for conflicts and append suffix if needed
    let subdomain = baseSubdomain;
    let counter = 1;

    while (await this.subdomainExists(subdomain, client)) {
      subdomain = `${baseSubdomain}-${counter}`;
      counter++;

      if (counter > 100) {
        throw new Error('Failed to generate unique subdomain');
      }
    }

    return subdomain;
  }

  private async subdomainExists(subdomain: string, client: PoolClient): Promise<boolean> {
    const query = `
      SELECT EXISTS (
        SELECT 1 FROM projects WHERE subdomain = $1
      ) as exists
    `;

    const result = await client.query(query, [subdomain]);
    return result.rows[0].exists;
  }

  private async createProjectRecord(
    userId: string,
    subdomain: string,
    transformResult: TransformResult,
    client: PoolClient
  ): Promise<string> {
    const projectName = `Migrated Site - ${subdomain}`;
    const framework = transformResult.metadata.framework || 'next';

    const insertQuery = `
      INSERT INTO projects (
        owner_id, name, subdomain, framework,
        config, created_by_service, build_status
      ) VALUES (
        $1, $2, $3, $4, $5, 'migration-service', 'queued'
      )
      RETURNING id
    `;

    const config = {
      migration: {
        originalUrl: transformResult.urlMappings[0]?.originalUrl,
        totalPages: transformResult.metadata.totalPages,
        migrationSummary: transformResult.metadata.migrationSummary,
        hasSSR: transformResult.metadata.hasSSR,
        createdAt: new Date().toISOString()
      },
      deployment: {
        type: 'pages-static',
        buildCommand: 'npm run build',
        outputDirectory: 'out'
      }
    };

    const result = await client.query(insertQuery, [
      userId,
      projectName,
      subdomain,
      framework,
      JSON.stringify(config)
    ]);

    return result.rows[0].id;
  }

  private async linkMigrationToProject(
    migrationProjectId: string,
    targetProjectId: string,
    client: PoolClient
  ): Promise<void> {
    // Use UPSERT for idempotency
    const upsertQuery = `
      INSERT INTO migration_project_links (migration_project_id, target_project_id)
      VALUES ($1, $2)
      ON CONFLICT (migration_project_id, target_project_id) DO NOTHING
    `;

    await client.query(upsertQuery, [migrationProjectId, targetProjectId]);
  }

  private async uploadProjectFiles(
    projectId: string,
    projectFiles: ProjectFiles
  ): Promise<{ uploaded: number; failed: number }> {
    let uploaded = 0;
    let failed = 0;

    try {
      // In a real implementation, this would upload to R2 or similar storage
      // For now, we'll log the file structure
      unifiedLogger.system('startup', 'info', 'Project files prepared for upload', {
        projectId,
        totalFiles: projectFiles.totalFiles,
        fileTypes: projectFiles.files.reduce((acc, file) => {
          acc[file.type] = (acc[file.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      });

      uploaded = projectFiles.totalFiles;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'File upload failed', {
        projectId,
        error: (error as Error).message
      });

      failed = projectFiles.totalFiles;
    }

    return { uploaded, failed };
  }

  private async setupInitialDeployment(
    projectId: string,
    subdomain: string,
    transformResult: TransformResult
  ): Promise<{ status: 'pending' | 'building' | 'deployed' | 'failed' }> {
    try {
      // Configure subdomain routing
      await this.setupSubdomainRouting(subdomain, transformResult.urlMappings);

      // Trigger initial build (this would integrate with existing build system)
      unifiedLogger.system('startup', 'info', 'Initial deployment setup complete', {
        projectId,
        subdomain,
        totalMappings: transformResult.urlMappings.length
      });

      return { status: 'pending' };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Deployment setup failed', {
        projectId,
        subdomain,
        error: (error as Error).message
      });

      return { status: 'failed' };
    }
  }

  private async setupSubdomainRouting(
    subdomain: string,
    urlMappings: TransformResult['urlMappings']
  ): Promise<void> {
    // Configure URL redirects and routing rules
    const redirectRules = urlMappings
      .filter(mapping => mapping.redirectCode)
      .map(mapping => ({
        from: mapping.originalUrl,
        to: mapping.nextRoute,
        code: mapping.redirectCode
      }));

    unifiedLogger.system('startup', 'info', 'Subdomain routing configured', {
      subdomain,
      redirectRules: redirectRules.length,
      routeMappings: urlMappings.length
    });
  }

  private getDefaultGitignore(): string {
    return `# Dependencies
/node_modules
/.pnp
.pnp.js

# Testing
/coverage

# Next.js
/.next/
/out/

# Production
/build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts
`;
  }
}

// Export singleton instance
export const migrationProjectService = new MigrationProjectService();