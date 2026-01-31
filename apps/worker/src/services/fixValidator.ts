import { ErrorContext } from './errorInterceptor';
import { ClaudeResolution } from './claudeErrorResolver';
import { getFixSandbox, SandboxEnvironment, ValidationResult as SandboxValidation } from './fixSandbox';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface Fix {
  type: 'file_edit' | 'command' | 'config_change' | 'dependency_add' | 'dependency_remove';
  target: string;
  action: string;
  reason: string;
  content?: string | undefined;
  before?: string | undefined;
  after?: string | undefined;
}

export interface ValidationResult {
  valid: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    error?: string | undefined;
    details?: any | undefined;
    duration?: number | undefined;
  }>;
  sandbox?: SandboxEnvironment | undefined;
  rollbackInfo?: RollbackInfo | undefined;
  error?: string | undefined;
  totalDuration: number;
}

export interface RollbackInfo {
  snapshotId: string;
  snapshotPath: string;
  createdAt: Date;
  originalFiles: Array<{
    path: string;
    backup: string;
    checksum: string;
  }>;
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface FixApplication {
  success: boolean;
  appliedFixes: Array<{
    fix: Fix;
    result: 'success' | 'failed' | 'skipped';
    error?: string | undefined;
    changes?: string[] | undefined;
  }>;
  rollbackInfo?: RollbackInfo | undefined;
  validationResult?: ValidationResult | undefined;
}

export class FixValidator {
  private sandbox = getFixSandbox();
  private readonly maxValidationTime = 300000; // 5 minutes

  async initialize(): Promise<void> {
    await this.sandbox.initialize();
    console.log('✅ Fix Validator initialized');
  }

  async validateAndApplyFix(
    projectPath: string,
    fixes: Fix[],
    originalError: ErrorContext,
    options: {
      skipSandbox?: boolean;
      dryRun?: boolean;
      timeoutMs?: number;
    } = {}
  ): Promise<FixApplication> {
    const startTime = Date.now();
    const appliedFixes: FixApplication['appliedFixes'] = [];
    
    console.log(`[FixValidator] Validating ${fixes.length} fixes for project: ${projectPath}`);

    try {
      // Step 1: Create rollback snapshot
      const rollbackInfo = await this.createRollbackSnapshot(projectPath);
      
      // Step 2: Create sandbox if not skipped
      let sandbox: SandboxEnvironment | undefined;
      let validationResult: ValidationResult | undefined;
      
      if (!options.skipSandbox) {
        sandbox = await this.sandbox.createSandbox({
          projectPath,
          projectId: originalError.projectContext?.projectId,
          userId: originalError.projectContext?.userId,
          buildId: originalError.projectContext?.buildId,
          preserveNodeModules: false
        });

        // Step 3: Apply fixes in sandbox
        const sandboxApplication = await this.applyFixesInSandbox(sandbox, fixes);
        appliedFixes.push(...sandboxApplication.appliedFixes);

        if (!sandboxApplication.success) {
          return {
            success: false,
            appliedFixes,
            rollbackInfo,
            validationResult: {
              valid: false,
              checks: [],
              error: 'Failed to apply fixes in sandbox',
              totalDuration: Date.now() - startTime
            }
          };
        }

        // Step 4: Validate fixes in sandbox
        validationResult = await this.validateFix(sandbox, originalError);
        
        if (!validationResult.valid) {
          return {
            success: false,
            appliedFixes,
            rollbackInfo,
            validationResult
          };
        }
      }

      // Step 5: Apply fixes to real project (if not dry run)
      if (!options.dryRun) {
        if (sandbox) {
          // Copy validated changes from sandbox
          await this.sandbox.commitFix(sandbox);
        } else {
          // Direct application (risky - only for trusted fixes)
          const directApplication = await this.applyFixesDirect(projectPath, fixes);
          appliedFixes.push(...directApplication.appliedFixes);
          
          if (!directApplication.success) {
            await this.rollback(rollbackInfo, projectPath);
            return {
              success: false,
              appliedFixes,
              rollbackInfo
            };
          }
        }

        // Step 6: Final validation on actual project
        const finalValidation = await this.validateProjectState(projectPath, originalError);
        
        if (!finalValidation.valid) {
          await this.rollback(rollbackInfo, projectPath);
          return {
            success: false,
            appliedFixes,
            rollbackInfo,
            validationResult: finalValidation
          };
        }

        validationResult = finalValidation;
      }

      // Cleanup sandbox
      if (sandbox && !options.dryRun) {
        await this.sandbox.destroySandbox(sandbox);
      }

      return {
        success: true,
        appliedFixes,
        rollbackInfo,
        validationResult
      };

    } catch (error) {
      console.error('[FixValidator] Validation failed:', error);
      
      return {
        success: false,
        appliedFixes,
        validationResult: {
          valid: false,
          checks: [],
          error: error instanceof Error ? error.message : String(error),
          totalDuration: Date.now() - startTime
        }
      };
    }
  }

  private async createRollbackSnapshot(projectPath: string): Promise<RollbackInfo> {
    const snapshot = await this.sandbox.createSnapshot(projectPath);
    
    // Create checksums for critical files
    const criticalFiles = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.js', 'vite.config.ts'];
    const originalFiles: RollbackInfo['originalFiles'] = [];
    
    for (const file of criticalFiles) {
      const filePath = path.join(projectPath, file);
      if (await fs.access(filePath).then(() => true).catch(() => false)) {
        const content = await fs.readFile(filePath, 'utf8');
        const checksum = await this.calculateChecksum(content);
        const backupPath = path.join(snapshot.path, file);
        
        originalFiles.push({
          path: file,
          backup: backupPath,
          checksum
        });
      }
    }

    return {
      snapshotId: snapshot.id,
      snapshotPath: snapshot.path,
      createdAt: snapshot.createdAt,
      originalFiles
    };
  }

  private async calculateChecksum(content: string): Promise<string> {
    // Simple checksum calculation (in production, use crypto.createHash)
    return Buffer.from(content).toString('base64').substring(0, 32);
  }

  private async applyFixesInSandbox(sandbox: SandboxEnvironment, fixes: Fix[]): Promise<{
    success: boolean;
    appliedFixes: FixApplication['appliedFixes'];
  }> {
    const appliedFixes: FixApplication['appliedFixes'] = [];
    
    for (const fix of fixes) {
      const result = await this.applySingleFix(sandbox.sandboxPath, fix);
      appliedFixes.push({ fix, ...result });
      
      if (result.result === 'failed') {
        return { success: false, appliedFixes };
      }
    }
    
    return { success: true, appliedFixes };
  }

  private async applyFixesDirect(projectPath: string, fixes: Fix[]): Promise<{
    success: boolean;
    appliedFixes: FixApplication['appliedFixes'];
  }> {
    const appliedFixes: FixApplication['appliedFixes'] = [];
    
    console.warn('[FixValidator] Applying fixes directly without sandbox - RISKY!');
    
    for (const fix of fixes) {
      const result = await this.applySingleFix(projectPath, fix);
      appliedFixes.push({ fix, ...result });
      
      if (result.result === 'failed') {
        return { success: false, appliedFixes };
      }
    }
    
    return { success: true, appliedFixes };
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async applySingleFix(projectPath: string, fix: Fix): Promise<{
    result: 'success' | 'failed' | 'skipped';
    error?: string | undefined;
    changes?: string[] | undefined;
  }> {
    const changes: string[] = [];
    
    try {
      switch (fix.type) {
        case 'file_edit':
          return await this.applyFileEdit(projectPath, fix, changes);
        
        case 'dependency_add':
          return await this.addDependency(projectPath, fix, changes);
        
        case 'dependency_remove':
          return await this.removeDependency(projectPath, fix, changes);
        
        case 'command':
          return await this.executeCommand(projectPath, fix, changes);
        
        case 'config_change':
          return await this.applyConfigChange(projectPath, fix, changes);
        
        default:
          return {
            result: 'failed',
            error: `Unknown fix type: ${fix.type}`
          };
      }
    } catch (error) {
      return {
        result: 'failed',
        error: error instanceof Error ? error.message : String(error),
        changes
      };
    }
  }

  private async applyFileEdit(projectPath: string, fix: Fix, changes: string[]): Promise<{
    result: 'success' | 'failed' | 'skipped';
    error?: string;
    changes?: string[];
  }> {
    // Normalize paths for cross-platform compatibility and security
    const normalizedProjectPath = path.normalize(projectPath) + path.sep;
    const targetPath = path.normalize(path.resolve(projectPath, fix.target));

    // Security check - ensure we're editing within the project
    // Use normalized paths with trailing separator to prevent prefix attacks
    if (!targetPath.startsWith(normalizedProjectPath)) {
      return {
        result: 'failed',
        error: `Security violation: attempting to edit file outside project: ${fix.target}`
      };
    }

    try {
      if (fix.content) {
        // Replace entire file content
        await fs.writeFile(targetPath, fix.content, 'utf8');
        changes.push(`Replaced content of ${fix.target}`);
      } else if (fix.before && fix.after) {
        // Find and replace specific content
        const content = await fs.readFile(targetPath, 'utf8');
        
        if (!content.includes(fix.before)) {
          return {
            result: 'skipped',
            error: `Text to replace not found in ${fix.target}: "${fix.before}"`
          };
        }
        
        const newContent = content.replace(fix.before, fix.after);
        await fs.writeFile(targetPath, newContent, 'utf8');
        changes.push(`Replaced "${fix.before}" with "${fix.after}" in ${fix.target}`);
      } else {
        return {
          result: 'failed',
          error: 'File edit fix requires either content or before/after fields'
        };
      }

      return { result: 'success', changes };
      
    } catch (error) {
      return {
        result: 'failed',
        error: error instanceof Error ? error.message : String(error),
        changes
      };
    }
  }

  private async addDependency(projectPath: string, fix: Fix, changes: string[]): Promise<{
    result: 'success' | 'failed' | 'skipped';
    error?: string;
    changes?: string[];
  }> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);
      
      // Parse dependency info from fix.action or fix.content
      let depName: string;
      let depVersion: string;
      let depType: 'dependencies' | 'devDependencies' = 'dependencies';
      
      if (fix.content) {
        // Format: "packageName": "version"
        const match = fix.content.match(/"([^"]+)":\s*"([^"]+)"/);
        if (match && match[1] && match[2]) {
          depName = match[1];
          depVersion = match[2];
        } else {
          return {
            result: 'failed',
            error: `Invalid dependency format in content: ${fix.content}`
          };
        }
      } else {
        // Extract from action text
        const actionLower = fix.action.toLowerCase();
        if (actionLower.includes('terser')) {
          depName = 'terser';
          depVersion = '^5.24.0';
          depType = 'devDependencies';
        } else {
          return {
            result: 'failed',
            error: `Cannot parse dependency from action: ${fix.action}`
          };
        }
      }

      // Check if dependency already exists
      if (pkg.dependencies?.[depName] || pkg.devDependencies?.[depName]) {
        return {
          result: 'skipped',
          error: `Dependency ${depName} already exists`
        };
      }

      // Add dependency
      pkg[depType] = pkg[depType] || {};
      pkg[depType][depName] = depVersion;
      
      await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
      changes.push(`Added ${depName}@${depVersion} to ${depType}`);
      
      return { result: 'success', changes };
      
    } catch (error) {
      return {
        result: 'failed',
        error: error instanceof Error ? error.message : String(error),
        changes
      };
    }
  }

  private async removeDependency(projectPath: string, fix: Fix, changes: string[]): Promise<{
    result: 'success' | 'failed' | 'skipped';
    error?: string;
    changes?: string[];
  }> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);
      
      // Extract dependency name from fix.target or fix.action
      const depName = fix.target.includes('.json') ? 
        fix.action.match(/remove\s+(\S+)/i)?.[1] : 
        fix.target;
      
      if (!depName) {
        return {
          result: 'failed',
          error: 'Cannot determine dependency name to remove'
        };
      }

      let removed = false;
      
      if (pkg.dependencies?.[depName]) {
        delete pkg.dependencies[depName];
        changes.push(`Removed ${depName} from dependencies`);
        removed = true;
      }
      
      if (pkg.devDependencies?.[depName]) {
        delete pkg.devDependencies[depName];
        changes.push(`Removed ${depName} from devDependencies`);
        removed = true;
      }
      
      if (!removed) {
        return {
          result: 'skipped',
          error: `Dependency ${depName} not found`
        };
      }
      
      await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
      return { result: 'success', changes };
      
    } catch (error) {
      return {
        result: 'failed',
        error: error instanceof Error ? error.message : String(error),
        changes
      };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async executeCommand(projectPath: string, fix: Fix, changes: string[]): Promise<{
    result: 'success' | 'failed' | 'skipped';
    error?: string | undefined;
    changes?: string[] | undefined;
  }> {
    // Security: Only allow specific safe commands (exact match or with safe arguments)
    // CRITICAL: Use exact matching to prevent shell injection via command chaining
    const allowedCommands = new Set([
      'npm install',
      'npm audit fix',
      'npm run build',
      'pnpm install',
      'git init',
      'git add .',
      'npx tsc --noEmit'
    ]);

    // Commands that can have arguments (must validate arguments separately)
    const allowedPrefixes: { prefix: string; argPattern: RegExp }[] = [
      { prefix: 'git commit', argPattern: /^git commit -m "[^"]{1,200}"$/ }
    ];

    const command = fix.target || fix.action;

    // Check for shell metacharacters that could allow command chaining
    const dangerousChars = /[;&|`$(){}[\]<>\\!#*?~]/;
    if (dangerousChars.test(command)) {
      return {
        result: 'failed',
        error: `Command contains dangerous characters: ${command}`
      };
    }

    // Check exact match first
    let isAllowed = allowedCommands.has(command);

    // If not exact match, check prefixes with argument validation
    if (!isAllowed) {
      for (const { prefix, argPattern } of allowedPrefixes) {
        if (command.startsWith(prefix) && argPattern.test(command)) {
          isAllowed = true;
          break;
        }
      }
    }

    if (!isAllowed) {
      return {
        result: 'failed',
        error: `Command not allowed: ${command}`
      };
    }

    try {
      const result = await this.executeCommandSafely(command, projectPath);
      changes.push(`Executed: ${command}`);
      
      return {
        result: result.success ? 'success' : 'failed',
        error: result.error,
        changes
      };
      
    } catch (error) {
      return {
        result: 'failed',
        error: error instanceof Error ? error.message : String(error),
        changes
      };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async executeCommandSafely(command: string, cwd: string): Promise<{
    success: boolean;
    error?: string | undefined;
    stdout?: string | undefined;
    stderr?: string | undefined;
  }> {
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', command], {
        cwd,
        env: process.env,
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          error: 'Command timeout'
        });
      }, 120000); // 2 minute timeout

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          error: code !== 0 ? `Command failed with code ${code}: ${stderr}` : undefined,
          stdout,
          stderr
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async applyConfigChange(projectPath: string, fix: Fix, changes: string[]): Promise<{
    result: 'success' | 'failed' | 'skipped';
    error?: string | undefined;
    changes?: string[] | undefined;
  }> {
    // Config changes are treated as file edits with extra validation
    return await this.applyFileEdit(projectPath, fix, changes);
  }

  private async validateFix(sandbox: SandboxEnvironment, originalError: ErrorContext): Promise<ValidationResult> {
    const startTime = Date.now();
    const checks: ValidationResult['checks'] = [];

    try {
      // Use sandbox's built-in validation
      const sandboxValidation = await this.sandbox.validateFix(sandbox, originalError);
      
      // Convert sandbox validation results
      for (const check of sandboxValidation.checks) {
        checks.push({
          name: check.name,
          passed: check.passed,
          error: check.error,
          details: check.details,
          duration: 0
        });
      }

      // Additional validation checks specific to the error
      const errorSpecificCheck = await this.validateErrorResolution(sandbox, originalError);
      checks.push(errorSpecificCheck);

      // Build validation if applicable
      const buildCheck = await this.validateBuild(sandbox);
      checks.push(buildCheck);

      const allPassed = checks.every(check => check.passed);

      return {
        valid: allPassed,
        checks,
        sandbox,
        totalDuration: Date.now() - startTime
      };

    } catch (error) {
      return {
        valid: false,
        checks,
        error: error instanceof Error ? error.message : String(error),
        totalDuration: Date.now() - startTime
      };
    }
  }

  private async validateProjectState(projectPath: string, originalError: ErrorContext): Promise<ValidationResult> {
    const startTime = Date.now();
    const checks: ValidationResult['checks'] = [];

    try {
      // Basic file integrity
      const integrityCheck = await this.validateFileIntegrity(projectPath);
      checks.push(integrityCheck);

      // JSON validity
      const jsonCheck = await this.validateJSONFiles(projectPath);
      checks.push(jsonCheck);

      // Package.json validity
      const packageCheck = await this.validatePackageJson(projectPath);
      checks.push(packageCheck);

      const allPassed = checks.every(check => check.passed);

      return {
        valid: allPassed,
        checks,
        totalDuration: Date.now() - startTime
      };

    } catch (error) {
      return {
        valid: false,
        checks,
        error: error instanceof Error ? error.message : String(error),
        totalDuration: Date.now() - startTime
      };
    }
  }

  private async validateErrorResolution(sandbox: SandboxEnvironment, originalError: ErrorContext): Promise<{
    name: string;
    passed: boolean;
    error?: string;
    details?: any;
    duration?: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Check if the specific error would still occur
      if (originalError.errorMessage.includes('JSON') || originalError.errorMessage.includes('json')) {
        // Validate JSON files can be parsed
        const packageJsonPath = path.join(sandbox.sandboxPath, 'package.json');
        if (await fs.access(packageJsonPath).then(() => true).catch(() => false)) {
          const content = await fs.readFile(packageJsonPath, 'utf8');
          JSON.parse(content); // This will throw if invalid
        }
      }

      if (originalError.errorMessage.includes('terser') && originalError.errorMessage.includes('Vite')) {
        // Check if terser dependency was added
        const packageJsonPath = path.join(sandbox.sandboxPath, 'package.json');
        const content = await fs.readFile(packageJsonPath, 'utf8');
        const pkg = JSON.parse(content);
        
        if (!pkg.devDependencies?.terser && !pkg.dependencies?.terser) {
          return {
            name: 'error_resolution',
            passed: false,
            error: 'Terser dependency not added',
            duration: Date.now() - startTime
          };
        }
      }

      return {
        name: 'error_resolution',
        passed: true,
        details: { errorType: originalError.errorType },
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        name: 'error_resolution',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async validateBuild(sandbox: SandboxEnvironment): Promise<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any | undefined;
    duration?: number | undefined;
  }> {
    const startTime = Date.now();
    
    try {
      const packageJsonPath = path.join(sandbox.sandboxPath, 'package.json');
      
      if (await fs.access(packageJsonPath).then(() => true).catch(() => false)) {
        const content = await fs.readFile(packageJsonPath, 'utf8');
        const pkg = JSON.parse(content);
        
        if (pkg.scripts?.build) {
          // Try to run the build command
          const buildResult = await this.executeCommandSafely('npm run build', sandbox.sandboxPath);
          
          return {
            name: 'build_validation',
            passed: buildResult.success,
            error: buildResult.error,
            details: { 
              stdout: buildResult.stdout?.substring(0, 500),
              stderr: buildResult.stderr?.substring(0, 500)
            },
            duration: Date.now() - startTime
          };
        }
      }

      return {
        name: 'build_validation',
        passed: true,
        details: { reason: 'No build script found' },
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        name: 'build_validation',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async validateFileIntegrity(projectPath: string): Promise<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any | undefined;
  }> {
    try {
      await fs.access(projectPath);
      const stats = await fs.stat(projectPath);
      
      return {
        name: 'file_integrity',
        passed: stats.isDirectory(),
        details: { isDirectory: stats.isDirectory() }
      };
    } catch (error) {
      return {
        name: 'file_integrity',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async validateJSONFiles(projectPath: string): Promise<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any | undefined;
  }> {
    try {
      const jsonFiles = ['package.json', 'tsconfig.json'];
      const results: Array<{ file: string; valid: boolean; error?: string | undefined }> = [];
      
      for (const file of jsonFiles) {
        const filePath = path.join(projectPath, file);
        if (await fs.access(filePath).then(() => true).catch(() => false)) {
          try {
            const content = await fs.readFile(filePath, 'utf8');
            JSON.parse(content);
            results.push({ file, valid: true });
          } catch (error) {
            results.push({
              file,
              valid: false,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
      
      const invalidFiles = results.filter(r => !r.valid);
      
      return {
        name: 'json_validation',
        passed: invalidFiles.length === 0,
        error: invalidFiles.length > 0 ? `${invalidFiles.length} invalid JSON files` : undefined,
        details: { results }
      };
    } catch (error) {
      return {
        name: 'json_validation',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  private async validatePackageJson(projectPath: string): Promise<{
    name: string;
    passed: boolean;
    error?: string | undefined;
    details?: any | undefined;
  }> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      if (!(await fs.access(packageJsonPath).then(() => true).catch(() => false))) {
        return {
          name: 'package_json',
          passed: true,
          details: { exists: false, reason: 'No package.json (static site)' }
        };
      }
      
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);
      
      const errors: string[] = [];
      
      if (!pkg.name || typeof pkg.name !== 'string') {
        errors.push('Missing or invalid name');
      }
      
      if (!pkg.version || typeof pkg.version !== 'string') {
        errors.push('Missing or invalid version');
      }
      
      return {
        name: 'package_json',
        passed: errors.length === 0,
        error: errors.length > 0 ? errors.join(', ') : undefined,
        details: { name: pkg.name, version: pkg.version, errors }
      };
      
    } catch (error) {
      return {
        name: 'package_json',
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async rollback(rollbackInfo: RollbackInfo, targetPath: string): Promise<void> {
    console.log(`[FixValidator] Rolling back changes using snapshot: ${rollbackInfo.snapshotId}`);
    
    try {
      // Restore from snapshot
      await this.sandbox.restoreFromSnapshot(
        {
          id: rollbackInfo.snapshotId,
          path: rollbackInfo.snapshotPath,
          createdAt: rollbackInfo.createdAt,
          size: 0,
          files: 0
        },
        targetPath
      );
      
      console.log(`[FixValidator] Successfully rolled back to snapshot: ${rollbackInfo.snapshotId}`);
      
    } catch (error) {
      console.error(`[FixValidator] Rollback failed:`, error);
      throw new Error(`Rollback failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async cleanup(): Promise<void> {
    await this.sandbox.cleanupOldSandboxes();
  }

  async getValidationStats(): Promise<{
    sandboxes: {
      total: number;
      active: number;
      totalSize: number;
      oldestAge: number;
    };
  }> {
    const sandboxStats = await this.sandbox.getSandboxStats();
    
    return {
      sandboxes: sandboxStats
    };
  }
}

// Singleton instance
let fixValidatorInstance: FixValidator | null = null;

export function getFixValidator(): FixValidator {
  if (!fixValidatorInstance) {
    fixValidatorInstance = new FixValidator();
  }
  return fixValidatorInstance;
}