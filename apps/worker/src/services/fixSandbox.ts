import * as fs from 'fs/promises';
import * as path from 'path';

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface SandboxEnvironment {
  id: string;
  originalPath: string;
  sandboxPath: string;
  createdAt: Date;
  metadata: {
    projectId?: string | undefined;
    userId?: string | undefined;
    buildId?: string | undefined;
  };
}

export interface SandboxOptions {
  projectPath: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  projectId?: string | undefined;
  userId?: string | undefined;
  buildId?: string | undefined;
  preserveNodeModules?: boolean | undefined;
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface ValidationResult {
  valid: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any | undefined;
  }>;
  error?: string | undefined;
}

export interface SnapshotInfo {
  id: string;
  path: string;
  createdAt: Date;
  size: number;
  files: number;
}

export class FixSandbox {
  private readonly sandboxRoot: string;
  private readonly maxSandboxAge = 2 * 60 * 60 * 1000; // 2 hours

  constructor(sandboxRoot?: string) {
    this.sandboxRoot = sandboxRoot || path.join(process.cwd(), 'temp', 'recovery-sandboxes');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.sandboxRoot, { recursive: true });
    console.log(`✅ Fix Sandbox initialized at ${this.sandboxRoot}`);
  }

  async createSandbox(options: SandboxOptions): Promise<SandboxEnvironment> {
    const sandboxId = `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sandboxPath = path.join(this.sandboxRoot, sandboxId);

    try {
      // Ensure sandbox directory exists
      await fs.mkdir(sandboxPath, { recursive: true });

      // Copy project files to sandbox (excluding node_modules by default)
      await this.copyProjectFiles(options.projectPath, sandboxPath, {
        excludeNodeModules: !options.preserveNodeModules
      });

      const sandbox: SandboxEnvironment = {
        id: sandboxId,
        originalPath: options.projectPath,
        sandboxPath,
        createdAt: new Date(),
        metadata: {
          projectId: options.projectId,
          userId: options.userId,
          buildId: options.buildId
        }
      };

      console.log(`[FixSandbox] Created sandbox: ${sandboxId}`);
      return sandbox;

    } catch (error) {
      // Cleanup on failure
      await this.destroySandbox({ sandboxPath } as SandboxEnvironment).catch(() => {});
      throw new Error(`Failed to create sandbox: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async copyProjectFiles(sourcePath: string, targetPath: string, options: {
    excludeNodeModules?: boolean;
  } = {}): Promise<void> {
    const excludePatterns = [
      '.git',
      '.DS_Store',
      'Thumbs.db',
      '*.log',
      'temp',
      'tmp'
    ];

    if (options.excludeNodeModules) {
      excludePatterns.push('node_modules');
    }

    await this.copyDirectory(sourcePath, targetPath, excludePatterns);
  }

  private async copyDirectory(source: string, target: string, excludePatterns: string[]): Promise<void> {
    await fs.mkdir(target, { recursive: true });

    const items = await fs.readdir(source, { withFileTypes: true });

    for (const item of items) {
      const sourcePath = path.join(source, item.name);
      const targetPath = path.join(target, item.name);

      // Check if item should be excluded
      const shouldExclude = excludePatterns.some(pattern => {
        if (pattern.startsWith('*')) {
          return item.name.endsWith(pattern.substring(1));
        }
        return item.name === pattern;
      });

      if (shouldExclude) {
        continue;
      }

      if (item.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath, excludePatterns);
      } else if (item.isFile()) {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  async validateFix(sandbox: SandboxEnvironment, originalError: any): Promise<ValidationResult> {
    const checks: ValidationResult['checks'] = [];

    try {
      // Check 1: Basic file structure integrity
      const structureCheck = await this.validateFileStructure(sandbox);
      checks.push(structureCheck);

      // Check 2: JSON files can be parsed
      const jsonCheck = await this.validateJSONFiles(sandbox);
      checks.push(jsonCheck);

      // Check 3: Package.json is valid
      const packageCheck = await this.validatePackageJson(sandbox);
      checks.push(packageCheck);

      // Check 4: No security issues introduced
      const securityCheck = await this.validateSecurity(sandbox);
      checks.push(securityCheck);

      // Check 5: Try basic operations (if applicable)
      const operationCheck = await this.validateOperations(sandbox);
      checks.push(operationCheck);

      const allPassed = checks.every(check => check.passed);

      return {
        valid: allPassed,
        checks
      };

    } catch (error) {
      return {
        valid: false,
        checks,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async validateFileStructure(sandbox: SandboxEnvironment): Promise<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any | undefined;
  }> {
    try {
      const stats = await fs.stat(sandbox.sandboxPath);
      if (!stats.isDirectory()) {
        return {
          name: 'file_structure',
          passed: false,
          error: 'Sandbox path is not a directory'
        };
      }

      // Check if we can read the directory
      await fs.readdir(sandbox.sandboxPath);

      return {
        name: 'file_structure',
        passed: true
      };

    } catch (error) {
      return {
        name: 'file_structure',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async validateJSONFiles(sandbox: SandboxEnvironment): Promise<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any | undefined;
  }> {
    try {
      const jsonFiles = await this.findJSONFiles(sandbox.sandboxPath);
      const results: Array<{ file: string; valid: boolean; error?: string | undefined }> = [];

      for (const jsonFile of jsonFiles) {
        try {
          const content = await fs.readFile(jsonFile, 'utf8');
          JSON.parse(content);
          results.push({ file: jsonFile, valid: true });
        } catch (error) {
          results.push({
            file: jsonFile,
            valid: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      const invalidFiles = results.filter(r => !r.valid);

      return {
        name: 'json_validation',
        passed: invalidFiles.length === 0,
        error: invalidFiles.length > 0 ? `${invalidFiles.length} invalid JSON files` : undefined,
        details: { total: results.length, invalid: invalidFiles }
      };

    } catch (error) {
      return {
        name: 'json_validation',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async findJSONFiles(dirPath: string): Promise<string[]> {
    const jsonFiles: string[] = [];

    async function scanDirectory(currentPath: string) {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(currentPath, item.name);

        if (item.isDirectory()) {
          // Skip node_modules and other large directories
          if (!['node_modules', '.git', 'temp', 'tmp'].includes(item.name)) {
            await scanDirectory(fullPath);
          }
        } else if (item.isFile() && item.name.endsWith('.json')) {
          jsonFiles.push(fullPath);
        }
      }
    }

    await scanDirectory(dirPath);
    return jsonFiles;
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async validatePackageJson(sandbox: SandboxEnvironment): Promise<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any | undefined;
  }> {
    const packageJsonPath = path.join(sandbox.sandboxPath, 'package.json');

    try {
      await fs.access(packageJsonPath);
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);

      // Basic package.json structure validation
      const errors: string[] = [];

      if (!pkg.name || typeof pkg.name !== 'string') {
        errors.push('Missing or invalid name field');
      }

      if (!pkg.version || typeof pkg.version !== 'string') {
        errors.push('Missing or invalid version field');
      }

      return {
        name: 'package_json',
        passed: errors.length === 0,
        error: errors.length > 0 ? errors.join(', ') : undefined,
        details: { name: pkg.name, version: pkg.version }
      };

    } catch (error) {
      if (error instanceof Error && (error as any).code === 'ENOENT') {
        // package.json doesn't exist - might be a static site
        return {
          name: 'package_json',
          passed: true,
          details: { exists: false, reason: 'Static site without package.json' }
        };
      }

      return {
        name: 'package_json',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async validateSecurity(sandbox: SandboxEnvironment): Promise<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any | undefined;
  }> {
    try {
      const suspiciousPatterns = [
        /\.\.\/\.\.\//g, // Path traversal
        /rm\s+-rf\s+\//g, // Dangerous deletions
        /eval\s*\(/g, // Code eval
        /exec\s*\(/g, // Code execution
        /\/etc\/passwd/g, // System files
        /\.ssh/g // SSH files
      ];

      const textFiles = await this.findTextFiles(sandbox.sandboxPath);
      const issues: Array<{ file: string; pattern: string; matches: number }> = [];

      for (const textFile of textFiles) {
        try {
          const content = await fs.readFile(textFile, 'utf8');

          for (const pattern of suspiciousPatterns) {
            const matches = content.match(pattern);
            if (matches && matches.length > 0) {
              issues.push({
                file: textFile,
                pattern: pattern.source,
                matches: matches.length
              });
            }
          }
        } catch (error) {
          // Skip files that can't be read as text
        }
      }

      return {
        name: 'security_check',
        passed: issues.length === 0,
        error: issues.length > 0 ? `${issues.length} security issues detected` : undefined,
        details: { issues: issues.slice(0, 10) } // Limit to first 10 issues
      };

    } catch (error) {
      return {
        name: 'security_check',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async findTextFiles(dirPath: string): Promise<string[]> {
    const textFiles: string[] = [];
    const textExtensions = ['.js', '.ts', '.json', '.md', '.txt', '.yml', '.yaml', '.xml', '.html', '.css'];

    async function scanDirectory(currentPath: string) {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(currentPath, item.name);

        if (item.isDirectory()) {
          if (!['node_modules', '.git'].includes(item.name)) {
            await scanDirectory(fullPath);
          }
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (textExtensions.includes(ext)) {
            textFiles.push(fullPath);
          }
        }
      }
    }

    await scanDirectory(dirPath);
    return textFiles;
  }

  private async validateOperations(sandbox: SandboxEnvironment): Promise<{
    name: string;
    passed: boolean;
    error?: string;
    details?: any;
  }> {
    try {
      // Check if we can perform basic operations in the sandbox
      const testFile = path.join(sandbox.sandboxPath, '.sandbox-test');

      // Test write
      await fs.writeFile(testFile, 'test content');

      // Test read
      const content = await fs.readFile(testFile, 'utf8');

      // Test delete
      await fs.unlink(testFile);

      return {
        name: 'operations_check',
        passed: content === 'test content',
        details: { write: true, read: true, delete: true }
      };

    } catch (error) {
      return {
        name: 'operations_check',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async commitFix(sandbox: SandboxEnvironment): Promise<void> {
    console.log(`[FixSandbox] Committing changes from sandbox: ${sandbox.id}`);

    try {
      // Get file lists from both locations to detect deletions
      const sandboxFiles = await this.getAllFiles(sandbox.sandboxPath, ['.git', 'node_modules']);
      const originalFiles = await this.getAllFiles(sandbox.originalPath, ['.git', 'node_modules']);

      // Find files that were deleted in the sandbox
      const sandboxRelativePaths = new Set(
        sandboxFiles.map(f => path.relative(sandbox.sandboxPath, f))
      );

      for (const originalFile of originalFiles) {
        const relativePath = path.relative(sandbox.originalPath, originalFile);
        if (!sandboxRelativePaths.has(relativePath)) {
          // File was deleted in sandbox - remove from original
          await fs.unlink(originalFile).catch(() => {});
          console.log(`[FixSandbox] Deleted file: ${relativePath}`);
        }
      }

      // Copy files back from sandbox to original location
      await this.copyDirectory(sandbox.sandboxPath, sandbox.originalPath, ['.git']);
      console.log(`[FixSandbox] Successfully committed changes to ${sandbox.originalPath}`);

    } catch (error) {
      throw new Error(`Failed to commit sandbox changes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getAllFiles(dirPath: string, excludePatterns: string[]): Promise<string[]> {
    const files: string[] = [];

    const scanDirectory = async (currentPath: string) => {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        // Check exclusions
        if (excludePatterns.includes(item.name)) continue;

        const fullPath = path.join(currentPath, item.name);

        if (item.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (item.isFile()) {
          files.push(fullPath);
        }
      }
    };

    await scanDirectory(dirPath);
    return files;
  }

  async createSnapshot(projectPath: string): Promise<SnapshotInfo> {
    const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const snapshotPath = path.join(this.sandboxRoot, 'snapshots', snapshotId);

    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await this.copyDirectory(projectPath, snapshotPath, []);

    const stats = await this.getDirectoryStats(snapshotPath);

    return {
      id: snapshotId,
      path: snapshotPath,
      createdAt: new Date(),
      size: stats.size,
      files: stats.files
    };
  }

  async restoreFromSnapshot(snapshotInfo: SnapshotInfo, targetPath: string): Promise<void> {
    await this.copyDirectory(snapshotInfo.path, targetPath, []);
    console.log(`[FixSandbox] Restored from snapshot: ${snapshotInfo.id}`);
  }

  private async getDirectoryStats(dirPath: string): Promise<{ size: number; files: number }> {
    let totalSize = 0;
    let fileCount = 0;

    async function scanDirectory(currentPath: string) {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(currentPath, item.name);

        if (item.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (item.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
          fileCount++;
        }
      }
    }

    await scanDirectory(dirPath);
    return { size: totalSize, files: fileCount };
  }

  async destroySandbox(sandbox: SandboxEnvironment): Promise<void> {
    try {
      await fs.rm(sandbox.sandboxPath, { recursive: true, force: true });
      console.log(`[FixSandbox] Destroyed sandbox: ${sandbox.id}`);
    } catch (error) {
      console.error(`[FixSandbox] Failed to destroy sandbox ${sandbox.id}:`, error);
    }
  }

  async cleanupOldSandboxes(): Promise<void> {
    try {
      const now = Date.now();
      let cleaned = 0;

      // Clean up sandboxes in root directory
      const rootItems = await fs.readdir(this.sandboxRoot, { withFileTypes: true });
      for (const item of rootItems) {
        if (item.isDirectory() && item.name.startsWith('sandbox_')) {
          const itemPath = path.join(this.sandboxRoot, item.name);
          const stats = await fs.stat(itemPath);

          if (now - stats.birthtime.getTime() > this.maxSandboxAge) {
            await fs.rm(itemPath, { recursive: true, force: true });
            cleaned++;
          }
        }
      }

      // Clean up snapshots in the 'snapshots' subdirectory
      const snapshotsDir = path.join(this.sandboxRoot, 'snapshots');
      try {
        const snapshotItems = await fs.readdir(snapshotsDir, { withFileTypes: true });
        for (const item of snapshotItems) {
          if (item.isDirectory() && item.name.startsWith('snapshot_')) {
            const itemPath = path.join(snapshotsDir, item.name);
            const stats = await fs.stat(itemPath);

            if (now - stats.birthtime.getTime() > this.maxSandboxAge) {
              await fs.rm(itemPath, { recursive: true, force: true });
              cleaned++;
            }
          }
        }
      } catch (error) {
        // Snapshots directory may not exist yet
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      console.log(`[FixSandbox] Cleaned up ${cleaned} old sandboxes/snapshots`);
    } catch (error) {
      console.error('[FixSandbox] Failed to cleanup old sandboxes:', error);
    }
  }

  async getSandboxStats(): Promise<{
    total: number;
    active: number;
    totalSize: number;
    oldestAge: number;
  }> {
    try {
      const items = await fs.readdir(this.sandboxRoot, { withFileTypes: true });
      const now = Date.now();
      let total = 0;
      let active = 0;
      let totalSize = 0;
      let oldestAge = 0;

      for (const item of items) {
        if (item.isDirectory() && item.name.startsWith('sandbox_')) {
          total++;
          const itemPath = path.join(this.sandboxRoot, item.name);
          const stats = await fs.stat(itemPath);
          const age = now - stats.birthtime.getTime();

          if (age < this.maxSandboxAge) {
            active++;
          }

          oldestAge = Math.max(oldestAge, age);

          // Estimate size (this is expensive, so we'll just count directories)
          try {
            const dirStats = await this.getDirectoryStats(itemPath);
            totalSize += dirStats.size;
          } catch (error) {
            // Skip on error
          }
        }
      }

      return { total, active, totalSize, oldestAge };
    } catch (error) {
      return { total: 0, active: 0, totalSize: 0, oldestAge: 0 };
    }
  }
}

// Singleton instance
let fixSandboxInstance: FixSandbox | null = null;

export function getFixSandbox(): FixSandbox {
  if (!fixSandboxInstance) {
    fixSandboxInstance = new FixSandbox();
  }
  return fixSandboxInstance;
}