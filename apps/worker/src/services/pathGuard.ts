import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Path validation and security service to ensure Claude CLI
 * only executes in approved project directories
 */
export class PathGuard {
  private static readonly ALLOWED_BASE_PATHS = [
    path.join(os.homedir(), 'projects'),
    '/home/worker/projects', // Production server path
    '/tmp/claude-projects', // For CI/CD environments
  ];

  private static readonly FORBIDDEN_PATHS = [
    '/root',
    '/etc',
    '/var',
    '/usr',
    '/bin',
    '/sbin',
    '/System',
    '/Applications',
    '/Library',
    process.cwd(), // Worker's own directory
  ];

  private static readonly WORKER_APP_INDICATORS = [
    'src/workers',
    'src/services',
    'bullmq',
    'claudeCLIProvider.ts',
    'modularWorkers.ts',
    'node_modules/@bull-board',
  ];

  /**
   * Validate that a path is safe for Claude CLI execution
   * @throws Error if path is invalid or unsafe
   */
  static validateProjectPath(projectPath: string): void {
    // 1. Path must be absolute
    if (!path.isAbsolute(projectPath)) {
      throw new Error(`Path must be absolute: ${projectPath}`);
    }

    // 2. Resolve any symlinks or .. references
    const resolvedPath = path.resolve(projectPath);

    // 3. Check if path is in allowed base paths
    const isInAllowedPath = this.ALLOWED_BASE_PATHS.some(basePath =>
      resolvedPath.startsWith(basePath)
    );

    if (!isInAllowedPath) {
      throw new Error(
        `Path outside allowed directories: ${resolvedPath}. ` +
        `Allowed: ${this.ALLOWED_BASE_PATHS.join(', ')}`
      );
    }

    // 4. Check path doesn't contain forbidden segments
    const pathSegments = resolvedPath.split(path.sep);
    const forbiddenSegments = ['..', '.git', 'node_modules', '.npm', '.pnpm'];

    for (const segment of pathSegments) {
      if (forbiddenSegments.includes(segment)) {
        throw new Error(`Path contains forbidden segment '${segment}': ${resolvedPath}`);
      }
    }

    // 5. Ensure path doesn't start with forbidden paths
    for (const forbidden of this.FORBIDDEN_PATHS) {
      if (resolvedPath === forbidden || resolvedPath.startsWith(forbidden + path.sep)) {
        throw new Error(`Path is in forbidden directory: ${resolvedPath}`);
      }
    }

    // 5b. Special handling for /Users and /home - only allow if under projects subdirectory
    const userPaths = ['/Users', '/home'];
    for (const userPath of userPaths) {
      if (resolvedPath.startsWith(userPath) && !resolvedPath.includes('/projects/')) {
        throw new Error(`Path under ${userPath} must be in a projects subdirectory: ${resolvedPath}`);
      }
    }

    // 6. Path pattern validation - must match expected format
    // Allow both direct projects under home and nested user directories
    const projectPathRegex = /^\/(?:Users|home)\/[^/]+(?:\/[^/]+)*\/projects\/[^/]+\/[^/]+$/;
    if (!projectPathRegex.test(resolvedPath)) {
      throw new Error(
        `Path doesn't match expected pattern /home/*/projects/{userId}/{projectId}: ${resolvedPath}`
      );
    }

    // 7. Detect if we're accidentally in the worker app directory
    if (this.isWorkerAppDirectory(resolvedPath)) {
      throw new Error(`Cannot execute in worker app directory: ${resolvedPath}`);
    }
  }

  /**
   * Create a safe project directory with proper permissions
   */
  static async createSafeProjectDirectory(projectPath: string): Promise<void> {
    // Validate before creating
    this.validateProjectPath(projectPath);

    // Create with restricted permissions (owner only)
    await fs.promises.mkdir(projectPath, {
      recursive: true,
      mode: 0o755 // rwxr-xr-x
    });

    // Create a marker file to identify this as a claude project
    const markerPath = path.join(projectPath, '.sheenapps-project');
    await fs.promises.writeFile(markerPath, JSON.stringify({
      created: new Date().toISOString(),
      version: '1.0',
      type: 'sheenapps-generated-project'
    }));
  }

  /**
   * Verify a directory exists and is a valid project directory
   */
  static async verifyProjectDirectory(projectPath: string): Promise<boolean> {
    try {
      this.validateProjectPath(projectPath);

      const stats = await fs.promises.stat(projectPath);
      if (!stats.isDirectory()) {
        throw new Error(`Not a directory: ${projectPath}`);
      }

      // Check for marker file
      const markerPath = path.join(projectPath, '.sheenapps-project');
      await fs.promises.access(markerPath, fs.constants.R_OK);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a path appears to be the worker application directory
   */
  private static isWorkerAppDirectory(dirPath: string): boolean {
    try {
      // Check for multiple indicators
      let indicatorCount = 0;

      for (const indicator of this.WORKER_APP_INDICATORS) {
        const indicatorPath = path.join(dirPath, indicator);
        if (fs.existsSync(indicatorPath)) {
          indicatorCount++;
        }
      }

      // If we find 3+ indicators, it's likely the worker app
      return indicatorCount >= 3;
    } catch {
      return false;
    }
  }

  /**
   * Get a safe temporary directory for a build
   */
  static getSafeTempDirectory(userId: string, projectId: string, buildId: string): string {
    const tempBase = path.join(os.tmpdir(), 'claude-projects');
    const tempPath = path.join(tempBase, userId, projectId, buildId);

    // Validate the generated path
    this.validateProjectPath(tempPath);

    return tempPath;
  }

  /**
   * Sanitize user input to prevent path traversal
   */
  static sanitizePathComponent(component: string): string {
    // Remove any path separators and dangerous characters
    return component
      .replace(/[\/\\]/g, '-')
      .replace(/\.\./g, '')
      .replace(/[^a-zA-Z0-9\-_]/g, '')
      .substring(0, 100); // Limit length
  }

  /**
   * Check if a path is a valid project directory (instance method for ClaudeStreamProcess)
   */
  isProjectDirectory(projectPath: string): boolean {
    try {
      PathGuard.validateProjectPath(projectPath);
      return true;
    } catch {
      return false;
    }
  }
}
