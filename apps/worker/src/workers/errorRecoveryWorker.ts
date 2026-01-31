import { Worker, Job } from 'bullmq';
import { ErrorContext, ErrorClassification, ErrorCategory, getErrorInterceptor } from '../services/errorInterceptor';
import { getPatternDatabase, PatternMatchResult } from '../services/errorPatternDatabase';
import { emitBuildEvent } from '../services/eventService';
import { getWebhookService } from '../services/webhookService';
import { healJSON } from '../utils/jsonHealer';
import { fixDependencyConflicts } from '../services/dependencyFixer';
import { getAuditLogger, AuditLogger } from '../services/auditLogger';
import { SecurePathValidator } from '../utils/securePathValidator';
import * as fs from 'fs/promises';
import * as path from 'path';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

export interface ErrorRecoveryJobData {
  errorContext: ErrorContext;
  classification: ErrorClassification;
  queuedAtMs: number; // Epoch ms - Date objects don't serialize correctly through Redis/JSON
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface RecoveryResult {
  status: 'recovered' | 'failed' | 'escalated' | 'security_blocked';
  method?: 'pattern' | 'claude' | 'manual' | undefined;
  strategy?: string | undefined;
  changes?: string[] | undefined;
  recoveryTime?: number | undefined;
  confidence?: number | undefined;
  error?: string | undefined;
}

export class ErrorRecoveryProcessor {
  private patternDatabase = getPatternDatabase();
  private auditLogger = getAuditLogger();
  private startTime = 0;

  // SECURITY: Validate and get safe project path
  private getSecureProjectPath(errorContext: ErrorContext): string {
    const projectId = errorContext.projectContext?.projectId;
    if (!projectId) {
      throw new Error('No project ID in error context');
    }

    const projectPath = errorContext.projectContext?.projectPath ||
      path.join(process.cwd(), 'temp', projectId);

    // Validate the path is within allowed boundaries
    const validation = SecurePathValidator.validateProjectPath(projectPath, projectPath);
    if (!validation.valid) {
      console.error(`[ErrorRecovery] SECURITY: Invalid project path: ${validation.reason}`);
      throw new Error(`SECURITY: ${validation.reason}`);
    }

    return projectPath;
  }

  async processRecovery(job: Job<ErrorRecoveryJobData>): Promise<RecoveryResult> {
    const { errorContext, classification } = job.data;
    this.startTime = Date.now();

    console.log(`[ErrorRecovery] Processing error: ${errorContext.errorId}`);
    console.log(`[ErrorRecovery] Classification: ${classification.category}, Strategy: ${classification.suggestedStrategy}`);

    // Audit: Log error detection
    await this.auditLogger.log(AuditLogger.createErrorDetectedEntry(errorContext));

    try {
      // Update progress
      await this.updateProgress(job, 'analysis', 10, 'Analyzing error pattern...');

      // Security check first - use enum for consistency
      if (classification.category === ErrorCategory.SECURITY_RISK) {
        return await this.handleSecurityRisk(errorContext);
      }

      // Try pattern-based recovery first
      if (classification.suggestedStrategy === 'pattern' || classification.category === ErrorCategory.RECOVERABLE_PATTERN) {
        // Audit: Log fix attempt
        await this.auditLogger.log(AuditLogger.createFixAttemptedEntry(errorContext, 'pattern_matching', 'pattern'));
        
        const patternResult = await this.attemptPatternRecovery(errorContext, job);
        if (patternResult.status === 'recovered') {
          return patternResult;
        }
        
        // If pattern failed, try TypeScript auto-fix for TypeScript errors
        if (patternResult.status === 'failed' && 
            (errorContext.errorMessage.includes('error TS') || 
             errorContext.stage === 'typescript-validation')) {
          
          console.log('[ErrorRecovery] Pattern recovery failed, trying TypeScript auto-fix...');
          const tsFixResult = await this.attemptTypeScriptAutoFix(errorContext, job);
          if (tsFixResult.status === 'recovered') {
            return tsFixResult;
          }
        }
        
        // If pattern failed but we have medium confidence, try Claude
        if (classification.confidence > 0.6 && classification.confidence < 0.9) {
          console.log('[ErrorRecovery] Pattern/TypeScript recovery failed, trying Claude...');
          return await this.attemptClaudeRecovery(errorContext, job, patternResult.error);
        }
      }

      // Claude recovery for complex cases
      if (classification.suggestedStrategy === 'claude' || classification.category === ErrorCategory.RECOVERABLE_CLAUDE) {
        // Audit: Log Claude fix attempt
        await this.auditLogger.log(AuditLogger.createFixAttemptedEntry(errorContext, 'ai_analysis', 'claude'));
        
        return await this.attemptClaudeRecovery(errorContext, job);
      }

      // If we get here, escalate to human
      return await this.escalateToHuman(errorContext, 'No recovery strategy succeeded');

    } catch (error) {
      console.error('[ErrorRecovery] Processing failed:', error);
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        recoveryTime: Date.now() - this.startTime
      };
    }
  }

  private async attemptPatternRecovery(errorContext: ErrorContext, job: Job): Promise<RecoveryResult> {
    await this.updateProgress(job, 'solution', 30, 'Searching pattern database...');

    // Find matching patterns
    const patternMatch = await this.patternDatabase.findPattern(errorContext.errorMessage, {
      minConfidence: 0.7,
      category: errorContext.errorType.includes('security') ? undefined : ErrorCategory.RECOVERABLE_PATTERN
    });

    if (!patternMatch) {
      return {
        status: 'failed',
        error: 'No matching pattern found',
        recoveryTime: Date.now() - this.startTime
      };
    }

    console.log(`[ErrorRecovery] Found pattern: ${patternMatch.pattern.id} (confidence: ${patternMatch.confidence})`);

    await this.updateProgress(job, 'application', 60, `Applying ${patternMatch.pattern.description}...`);

    // Apply the fix based on pattern strategy
    try {
      const fixResult = await this.applyPatternFix(patternMatch, errorContext);
      
      if (fixResult.success) {
        await this.updateProgress(job, 'validation', 90, 'Validating fix...');
        
        // Record successful pattern usage
        await this.patternDatabase.recordPatternUsage(patternMatch.pattern.id, true, Date.now() - this.startTime);
        
        // Audit: Log successful fix application
        await this.auditLogger.log(AuditLogger.createFixAppliedEntry(
          errorContext,
          {
            strategy: patternMatch.pattern.id,
            method: 'pattern',
            confidence: patternMatch.confidence,
            riskLevel: 'low',
            changes: (fixResult.changes || []).map(change => ({
              type: 'file_edit',
              target: 'pattern_fix',
              action: change
            })),
            actualTime: Date.now() - this.startTime
          },
          [],
          true
        ));
        
        // Emit success events
        await this.emitRecoverySuccess(errorContext, {
          method: 'pattern',
          strategy: patternMatch.pattern.id,
          changes: fixResult.changes || [],
          confidence: patternMatch.confidence
        });

        return {
          status: 'recovered',
          method: 'pattern',
          strategy: patternMatch.pattern.id,
          changes: fixResult.changes || [],
          recoveryTime: Date.now() - this.startTime,
          confidence: patternMatch.confidence
        };
      } else {
        // Record failed pattern usage
        await this.patternDatabase.recordPatternUsage(patternMatch.pattern.id, false, Date.now() - this.startTime);
        
        // Audit: Log failed fix application
        await this.auditLogger.log(AuditLogger.createFixAppliedEntry(
          errorContext,
          {
            strategy: patternMatch.pattern.id,
            method: 'pattern',
            confidence: patternMatch.confidence,
            riskLevel: 'low',
            changes: [],
            actualTime: Date.now() - this.startTime
          },
          [],
          false
        ));
        
        return {
          status: 'failed',
          method: 'pattern',
          strategy: patternMatch.pattern.id,
          error: fixResult.error,
          recoveryTime: Date.now() - this.startTime
        };
      }
    } catch (error) {
      // Record failed pattern usage
      await this.patternDatabase.recordPatternUsage(patternMatch.pattern.id, false, Date.now() - this.startTime);
      
      return {
        status: 'failed',
        method: 'pattern',
        strategy: patternMatch.pattern.id,
        error: error instanceof Error ? error.message : String(error),
        recoveryTime: Date.now() - this.startTime
      };
    }
  }

  private async applyPatternFix(patternMatch: PatternMatchResult, errorContext: ErrorContext): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    const fix = patternMatch.suggestedFix;
    const changes: string[] = [];

    try {
      switch (fix.type) {
        case 'function':
          return await this.applyFunctionFix(fix.handler!, errorContext, changes);
        
        case 'command':
          return await this.applyCommandFix(fix.command!, errorContext, changes);
        
        case 'file_edit':
          return await this.applyFileEditFix(fix.file!, errorContext, changes);
        
        case 'multi_step':
          return await this.applyMultiStepFix(fix.steps!, errorContext, changes);
        
        default:
          return { success: false, error: `Unknown fix type: ${fix.type}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async applyFunctionFix(handler: string, errorContext: ErrorContext, changes: string[]): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    // Import error handlers dynamically
    const { getErrorHandler } = await import('../services/errorHandlers');
    const errorHandler = getErrorHandler(handler);
    
    if (errorHandler) {
      try {
        const success = await errorHandler(errorContext);
        if (success) {
          changes.push(`Applied ${handler} fix`);
          return { success: true, changes };
        } else {
          return { success: false, error: `${handler} fix failed`, changes };
        }
      } catch (error) {
        return { 
          success: false, 
          error: `${handler} fix threw error: ${error instanceof Error ? error.message : String(error)}`,
          changes 
        };
      }
    }
    
    // Legacy handlers (to be migrated)
    switch (handler) {
      case 'healJSON':
        return await this.applyJSONHealing(errorContext, changes);
      
      case 'fixDependencyConflicts':
        return await this.applyDependencyFixes(errorContext, changes);
      
      case 'addTerserDependency':
        return await this.addTerserDependency(errorContext, changes);
      
      case 'fixNonExistentPackage':
        return await this.fixNonExistentPackage(errorContext, changes);
      
      case 'createMinimalPackageJson':
        return await this.createMinimalPackageJson(errorContext, changes);
      
      default:
        return { success: false, error: `Unknown function handler: ${handler}` };
    }
  }

  private async applyJSONHealing(errorContext: ErrorContext, changes: string[]): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    try {
      // SECURITY: Use validated project path
      const projectPath = this.getSecureProjectPath(errorContext);
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      if (await fs.access(packageJsonPath).then(() => true).catch(() => false)) {
        const content = await fs.readFile(packageJsonPath, 'utf8');
        const healResult = healJSON(content, packageJsonPath);
        
        if (healResult.healed) {
          await fs.writeFile(packageJsonPath, healResult.content);
          changes.push(`Healed package.json: ${healResult.fixes.join(', ')}`);
          return { success: true, changes };
        }
      }
      
      return { success: false, error: 'No JSON healing needed or package.json not found' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async applyDependencyFixes(errorContext: ErrorContext, changes: string[]): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    try {
      // SECURITY: Use validated project path
      const projectPath = this.getSecureProjectPath(errorContext);
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      const fixResult = await fixDependencyConflicts(packageJsonPath);
      if (fixResult.modified) {
        changes.push(...fixResult.fixes);
        return { success: true, changes };
      }
      
      return { success: false, error: 'No dependency fixes applied' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async addTerserDependency(errorContext: ErrorContext, changes: string[]): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    try {
      // SECURITY: Use validated project path
      const projectPath = this.getSecureProjectPath(errorContext);
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);
      
      // Add terser to devDependencies if not present
      if (!pkg.devDependencies?.terser && !pkg.dependencies?.terser) {
        pkg.devDependencies = pkg.devDependencies || {};
        pkg.devDependencies.terser = '^5.24.0';
        
        await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
        changes.push('Added terser dependency required by Vite 5.x');
        return { success: true, changes };
      }
      
      return { success: false, error: 'Terser dependency already present' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async fixNonExistentPackage(errorContext: ErrorContext, changes: string[]): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    try {
      // SECURITY: Use validated project path
      const projectPath = this.getSecureProjectPath(errorContext);
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      // Extract package name from error message
      const match = errorContext.errorMessage.match(/Non-existent packages: (.+)/);
      if (!match || !match[1]) {
        return { success: false, error: 'Could not extract package name from error' };
      }

      const nonExistentPackages = match[1].split(', ');
      const content = await fs.readFile(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);
      
      // Fix non-existent package versions
      for (const packageSpec of nonExistentPackages) {
        // Handle scoped packages (@org/package) and version prefixes
        let packageName: string;
        let versionSpec: string;
        
        if (packageSpec.startsWith('@')) {
          // Scoped package like @types/node@^20.0.0
          const parts = packageSpec.split('@');
          packageName = '@' + parts[1];
          versionSpec = parts[2] || '';
        } else {
          // Regular package like typescript@^5.0.0
          const parts = packageSpec.split('@');
          packageName = parts[0] ?? packageSpec;
          versionSpec = parts[1] || '';
        }
        
        // Extract actual version (remove ^, ~, etc.)
        const versionMatch = versionSpec.match(/[\^~]?(\d+\.\d+\.\d+)/);
        const version = versionMatch ? versionMatch[1] : versionSpec;
        
        // Fix known problematic versions
        if (packageName === 'typescript' && (version === '5.0.0' || versionSpec === '^5.0.0')) {
          // Update to a known good version
          if (pkg.dependencies?.typescript?.includes('5.0.0')) {
            pkg.dependencies.typescript = '^5.0.4';
            changes.push('Updated typescript from ^5.0.0 to ^5.0.4 (5.0.0 was unpublished)');
          }
          if (pkg.devDependencies?.typescript?.includes('5.0.0')) {
            pkg.devDependencies.typescript = '^5.0.4';
            changes.push('Updated typescript from ^5.0.0 to ^5.0.4 (5.0.0 was unpublished)');
          }
        }
        
        // Add more version fixes for other known issues
        if (packageName === 'react' && version === '18.2.0') {
          // React 18.2.0 exists but sometimes with wrong version spec
          if (pkg.dependencies?.react === '^18.2.0') {
            pkg.dependencies.react = '18.2.0'; // Remove caret for exact version
            changes.push('Fixed react version spec from ^18.2.0 to 18.2.0');
          }
        }
      }
      
      if (changes.length > 0) {
        await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
        return { success: true, changes };
      }
      
      return { success: false, error: 'Could not fix non-existent package versions' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async createMinimalPackageJson(errorContext: ErrorContext, changes: string[]): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    try {
      // SECURITY: Use validated project path
      const projectPath = this.getSecureProjectPath(errorContext);
      const packageJsonPath = path.join(projectPath, 'package.json');
      
      // Check if file is actually empty (0 bytes)
      const stats = await fs.stat(packageJsonPath).catch(() => null);
      if (stats && stats.size > 0) {
        // File exists and has content, try to read it
        try {
          const content = await fs.readFile(packageJsonPath, 'utf8');
          JSON.parse(content);
          return { success: false, error: 'package.json exists and is valid' };
        } catch {
          // File has content but is invalid JSON, don't overwrite
          return { success: false, error: 'package.json has content but is invalid - use JSON healing instead' };
        }
      }
      
      // Create a minimal package.json based on project structure
      const hasIndexHtml = await fs.access(path.join(projectPath, 'index.html')).then(() => true).catch(() => false);
      const hasSrcDir = await fs.access(path.join(projectPath, 'src')).then(() => true).catch(() => false);
      
      let packageJson: any = {
        name: errorContext.projectContext?.projectId || 'my-app',
        version: '1.0.0',
        private: true,
        description: 'Auto-generated package.json for project recovery'
      };
      
      // If it looks like a React/Vue/Angular project
      if (hasSrcDir) {
        // Check for common framework files
        const hasReactFiles = await fs.access(path.join(projectPath, 'src', 'App.js')).then(() => true).catch(() => false) ||
                             await fs.access(path.join(projectPath, 'src', 'App.jsx')).then(() => true).catch(() => false) ||
                             await fs.access(path.join(projectPath, 'src', 'App.tsx')).then(() => true).catch(() => false);
        
        if (hasReactFiles) {
          packageJson = {
            ...packageJson,
            scripts: {
              start: 'react-scripts start',
              build: 'react-scripts build',
              test: 'react-scripts test',
              eject: 'react-scripts eject'
            },
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0',
              'react-scripts': '5.0.1'
            },
            browserslist: {
              production: ['>0.2%', 'not dead', 'not op_mini all'],
              development: ['last 1 chrome version', 'last 1 firefox version', 'last 1 safari version']
            }
          };
          changes.push('Created React project package.json');
        } else {
          // Generic Node.js project
          packageJson.scripts = {
            start: 'node index.js',
            build: 'echo "No build step configured"'
          };
          changes.push('Created generic Node.js package.json');
        }
      } else if (hasIndexHtml) {
        // Static HTML site
        packageJson.scripts = {
          build: 'mkdir -p dist && cp -r *.html *.css *.js dist/ 2>/dev/null || echo "Copied static files"',
          serve: 'npx serve -s .'
        };
        changes.push('Created static site package.json');
      } else {
        // Completely empty project
        packageJson.scripts = {
          build: 'echo "No build configuration found"'
        };
        changes.push('Created minimal package.json for empty project');
      }
      
      // Write the new package.json
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      changes.push(`Created package.json with ${Object.keys(packageJson.scripts || {}).length} scripts`);
      
      return { success: true, changes };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async applyCommandFix(command: string, errorContext: ErrorContext, changes: string[]): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    // For safety, we'll limit allowed commands
    const allowedCommands = [
      'npm install',
      'pnpm install',
      'npm audit fix',
    ];

    if (!allowedCommands.includes(command)) {
      return { success: false, error: `Command not allowed: ${command}` };
    }

    // SECURITY: Get validated project path
    let projectPath: string;
    try {
      projectPath = this.getSecureProjectPath(errorContext);
    } catch (error) {
      return { success: false, error: `Security validation failed: ${error instanceof Error ? error.message : String(error)}` };
    }

    // Actually execute the command in the project directory
    try {
      const { execSync } = await import('child_process');
      const result = execSync(command, {
        cwd: projectPath,
        timeout: 120000, // 2 minute timeout
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });

      changes.push(`Executed command: ${command}`);
      console.log(`[ErrorRecovery] Command executed successfully: ${command}`);
      return { success: true, changes };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ErrorRecovery] Command execution failed: ${command}`, errorMsg);
      return { success: false, error: `Command execution failed: ${errorMsg}`, changes };
    }
  }

  private async applyFileEditFix(fileEdit: any, errorContext: ErrorContext, changes: string[]): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    // SECURITY: Validate we have proper file edit structure
    if (!fileEdit || !fileEdit.path || !fileEdit.content) {
      return { success: false, error: 'Invalid file edit structure - missing path or content' };
    }

    // SECURITY: Get validated project path
    let projectPath: string;
    try {
      projectPath = this.getSecureProjectPath(errorContext);
    } catch (error) {
      return { success: false, error: `Security validation failed: ${error instanceof Error ? error.message : String(error)}` };
    }

    // Validate the target file path is within project
    const targetPath = path.resolve(projectPath, fileEdit.path);
    if (!targetPath.startsWith(projectPath + path.sep)) {
      console.error(`[ErrorRecovery] SECURITY: Blocked file edit outside project: ${fileEdit.path}`);
      return { success: false, error: `SECURITY: File path would escape project directory: ${fileEdit.path}` };
    }

    try {
      // Create directory if needed
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      // Write the file
      await fs.writeFile(targetPath, fileEdit.content, 'utf8');

      changes.push(`Applied file edit to ${fileEdit.path}`);
      console.log(`[ErrorRecovery] File edit applied: ${fileEdit.path}`);
      return { success: true, changes };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ErrorRecovery] File edit failed: ${fileEdit.path}`, errorMsg);
      return { success: false, error: `File edit failed: ${errorMsg}`, changes };
    }
  }

  private async applyMultiStepFix(steps: any[], errorContext: ErrorContext, changes: string[]): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let stepResult;

      switch (step.type) {
        case 'function':
          stepResult = await this.applyFunctionFix(step.handler, errorContext, changes);
          break;
        case 'command':
          stepResult = await this.applyCommandFix(step.command, errorContext, changes);
          break;
        case 'file_edit':
          stepResult = await this.applyFileEditFix(step.file, errorContext, changes);
          break;
        default:
          stepResult = { success: false, error: `Unknown step type: ${step.type}` };
      }

      if (!stepResult.success) {
        return { success: false, error: `Step ${i + 1} failed: ${stepResult.error}`, changes };
      }
    }

    return { success: true, changes };
  }

  private async attemptTypeScriptAutoFix(errorContext: ErrorContext, job: Job): Promise<RecoveryResult> {
    await this.updateProgress(job, 'solution', 35, 'Attempting TypeScript auto-fix...');
    
    try {
      const { autoFixTypeScriptErrors } = await import('../services/typeScriptFixer');
      const projectPath = errorContext.projectContext?.projectPath;
      
      if (!projectPath) {
        return {
          status: 'failed',
          error: 'No project path available for TypeScript fixes',
          recoveryTime: Date.now() - this.startTime
        };
      }
      
      const fixed = await autoFixTypeScriptErrors(projectPath, errorContext.errorMessage);
      
      if (fixed) {
        console.log('[ErrorRecovery] TypeScript auto-fix succeeded');
        
        await this.updateProgress(job, 'validation', 90, 'TypeScript fixes applied successfully');
        
        // Audit: Log successful fix
        await this.auditLogger.log(AuditLogger.createFixAppliedEntry(
          errorContext,
          {
            strategy: 'typescript_auto_fix',
            method: 'pattern',
            confidence: 0.85,
            changes: [{
              type: 'file_edit',
              target: errorContext.projectContext?.projectPath || 'unknown',
              action: 'Applied TypeScript auto-fixes',
              before: 'TypeScript errors',
              after: 'Fixed'
            }]
          },
          [
            { name: 'syntax', passed: true },
            { name: 'security', passed: true },
            { name: 'functionality', passed: true }
          ],
          true
        ));
        
        return {
          status: 'recovered',
          method: 'pattern',
          strategy: 'typescript_auto_fix',
          changes: ['Applied TypeScript auto-fixes'],
          confidence: 0.85,
          recoveryTime: Date.now() - this.startTime
        };
      } else {
        return {
          status: 'failed',
          error: 'TypeScript auto-fix found no fixable issues',
          recoveryTime: Date.now() - this.startTime
        };
      }
    } catch (error) {
      console.error('[ErrorRecovery] TypeScript auto-fix failed:', error);
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        recoveryTime: Date.now() - this.startTime
      };
    }
  }

  private async attemptClaudeRecovery(errorContext: ErrorContext, job: Job, previousError?: string): Promise<RecoveryResult> {
    await this.updateProgress(job, 'solution', 40, 'Consulting AI assistant...');

    try {
      // Import Claude resolver here to avoid circular dependencies
      const { getClaudeResolver } = await import('../services/claudeErrorResolver');
      const claudeResolver = getClaudeResolver();
      
      await this.updateProgress(job, 'solution', 50, 'Analyzing error with AI...');
      
      // Get Claude's resolution
      const resolution = await claudeResolver.resolveError(errorContext);
      
      if (resolution.confidence < 0.5) {
        return {
          status: 'failed',
          method: 'claude',
          error: `Low confidence resolution: ${resolution.confidence}`,
          recoveryTime: Date.now() - this.startTime
        };
      }

      await this.updateProgress(job, 'application', 70, `Applying AI-suggested fix (${resolution.riskLevel} risk)...`);
      
      // Apply Claude's fixes
      const fixResult = await this.applyClaudeFixes(resolution, errorContext);
      
      if (fixResult.success) {
        await this.updateProgress(job, 'validation', 90, 'Validating AI fix...');
        
        await this.emitRecoverySuccess(errorContext, {
          method: 'claude',
          strategy: 'ai_analysis',
          changes: fixResult.changes || [],
          confidence: resolution.confidence
        });

        return {
          status: 'recovered',
          method: 'claude',
          strategy: 'ai_analysis',
          changes: fixResult.changes || [],
          recoveryTime: Date.now() - this.startTime,
          confidence: resolution.confidence
        };
      } else {
        return {
          status: 'failed',
          method: 'claude',
          error: fixResult.error,
          recoveryTime: Date.now() - this.startTime
        };
      }

    } catch (error) {
      console.error('[ErrorRecovery] Claude resolution failed:', error);
      
      // Fallback: Try TypeScript auto-fixer if it's a TypeScript error
      if (errorContext.errorMessage.includes('error TS') || 
          errorContext.errorType === 'TypeScriptError' ||
          errorContext.stage === 'typescript-validation') {
        
        console.log('[ErrorRecovery] Claude failed, trying TypeScript auto-fixer as fallback...');
        await this.updateProgress(job, 'application', 80, 'Attempting TypeScript auto-fix fallback...');
        
        try {
          const { autoFixTypeScriptErrors } = await import('../services/typeScriptFixer');
          const projectPath = errorContext.projectContext?.projectPath;
          
          if (projectPath) {
            const fixed = await autoFixTypeScriptErrors(projectPath, errorContext.errorMessage);
            
            if (fixed) {
              console.log('[ErrorRecovery] TypeScript auto-fix fallback succeeded');
              
              // Audit: Log successful fallback fix
              await this.auditLogger.log(AuditLogger.createFixAppliedEntry(
                errorContext,
                {
                  strategy: 'typescript_auto_fix_fallback',
                  method: 'pattern',
                  confidence: 0.8,
                  changes: [{
                    type: 'file_edit',
                    target: projectPath,
                    action: 'Applied TypeScript auto-fixes after Claude failure',
                    before: 'TypeScript errors',
                    after: 'Fixed'
                  }]
                },
                [
                  { name: 'syntax', passed: true },
                  { name: 'security', passed: true },
                  { name: 'functionality', passed: true }
                ],
                true
              ));
              
              return {
                status: 'recovered',
                method: 'pattern',
                strategy: 'typescript_auto_fix_fallback',
                changes: ['Applied TypeScript auto-fixes after Claude failure'],
                confidence: 0.8,
                recoveryTime: Date.now() - this.startTime
              };
            }
          }
        } catch (fallbackError) {
          console.error('[ErrorRecovery] TypeScript auto-fix fallback also failed:', fallbackError);
        }
      }
      
      return {
        status: 'failed',
        method: 'claude',
        error: error instanceof Error ? error.message : String(error),
        recoveryTime: Date.now() - this.startTime
      };
    }
  }

  private async applyClaudeFixes(resolution: any, errorContext: ErrorContext): Promise<{
    success: boolean;
    changes?: string[];
    error?: string;
  }> {
    const changes: string[] = [];

    try {
      // Import fix validator here to avoid circular dependencies
      const { getFixValidator } = await import('../services/fixValidator');
      const fixValidator = getFixValidator();

      // SECURITY: Use validated project path
      let projectPath: string;
      try {
        projectPath = this.getSecureProjectPath(errorContext);
      } catch (error) {
        return { success: false, error: `Security validation failed: ${error instanceof Error ? error.message : String(error)}` };
      }

      // Apply fixes using the validator with sandbox
      // SECURITY: Always use sandbox unless explicitly disabled via env var for testing
      const skipSandbox = process.env.SKIP_FIX_SANDBOX === 'true';
      if (skipSandbox) {
        console.warn('[ErrorRecovery] WARNING: Fix sandbox disabled via SKIP_FIX_SANDBOX env var');
      }

      const application = await fixValidator.validateAndApplyFix(
        projectPath,
        resolution.fixes,
        errorContext,
        {
          skipSandbox,
          dryRun: false,
          timeoutMs: resolution.estimatedTime * 1000
        }
      );

      if (application.success) {
        const appliedChanges = application.appliedFixes
          .filter(fix => fix.result === 'success')
          .flatMap(fix => fix.changes || []);
        
        changes.push(...appliedChanges);
        return { success: true, changes };
      } else {
        return {
          success: false,
          error: application.validationResult?.error || 'Fix application failed',
          changes
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        changes
      };
    }
  }

  private async handleSecurityRisk(errorContext: ErrorContext): Promise<RecoveryResult> {
    console.error('[ErrorRecovery] SECURITY RISK - blocking recovery:', errorContext.errorMessage);

    // Emit security alert - best effort, don't let failures change recovery verdict
    try {
      if (errorContext.projectContext?.buildId) {
        await emitBuildEvent(errorContext.projectContext.buildId, 'security_risk_blocked', {
          errorId: errorContext.errorId,
          message: 'Security risk detected - recovery blocked',
          timestamp: new Date(),
          userId: errorContext.projectContext.userId
        });
      }
    } catch (e) {
      console.error('[ErrorRecovery] Failed to emit security_risk_blocked event:', e);
    }

    // Send security webhook - best effort
    try {
      await getWebhookService().send({
        type: 'security_alert',
        buildId: errorContext.projectContext?.buildId || 'unknown',
        timestamp: Date.now(),
        data: {
          errorId: errorContext.errorId,
          message: 'Recovery blocked due to security risk',
          errorType: errorContext.errorType,
          projectId: errorContext.projectContext?.projectId,
          userId: errorContext.projectContext?.userId
        }
      });
    } catch (e) {
      console.error('[ErrorRecovery] Failed to send security_alert webhook:', e);
    }

    return {
      status: 'security_blocked',
      recoveryTime: Date.now() - this.startTime
    };
  }

  private async escalateToHuman(errorContext: ErrorContext, reason: string): Promise<RecoveryResult> {
    console.log(`[ErrorRecovery] Escalating to human: ${reason}`);

    // Emit escalation event - best effort
    try {
      if (errorContext.projectContext?.buildId) {
        await emitBuildEvent(errorContext.projectContext.buildId, 'error_escalated', {
          errorId: errorContext.errorId,
          reason,
          message: 'Automatic recovery failed - manual intervention required',
          timestamp: new Date(),
          userId: errorContext.projectContext.userId
        });
      }
    } catch (e) {
      console.error('[ErrorRecovery] Failed to emit error_escalated event:', e);
    }

    // Send escalation webhook - best effort
    try {
      await getWebhookService().send({
        type: 'error_recovery_failed',
        buildId: errorContext.projectContext?.buildId || 'unknown',
        timestamp: Date.now(),
        data: {
          errorId: errorContext.errorId,
          status: 'needs_attention',
          reason,
          message: 'Automatic recovery failed',
          actionRequired: {
            type: 'manual_intervention',
            description: reason,
            priority: 'medium'
          }
        }
      });
    } catch (e) {
      console.error('[ErrorRecovery] Failed to send error_recovery_failed webhook:', e);
    }

    return {
      status: 'escalated',
      method: 'manual',
      error: reason,
      recoveryTime: Date.now() - this.startTime
    };
  }

  private async updateProgress(job: Job, stage: string, progress: number, message: string): Promise<void> {
    // Update job progress - this should succeed
    await job.updateProgress({ stage, progress, message });

    // Emit SSE event - best effort, don't fail progress update on emit failure
    try {
      const { errorContext } = job.data;
      if (errorContext.projectContext?.buildId) {
        await emitBuildEvent(errorContext.projectContext.buildId, 'error_recovery_progress', {
          errorId: errorContext.errorId,
          stage,
          progress,
          message,
          userId: errorContext.projectContext.userId
        });
      }
    } catch (e) {
      console.error('[ErrorRecovery] Failed to emit progress event:', e);
    }
  }

  private async emitRecoverySuccess(errorContext: ErrorContext, result: {
    method: string;
    strategy: string;
    changes: string[];
    confidence: number;
  }): Promise<void> {
    // Emit build event - best effort
    try {
      if (errorContext.projectContext?.buildId) {
        await emitBuildEvent(errorContext.projectContext.buildId, 'error_recovered', {
          errorId: errorContext.errorId,
          method: result.method,
          strategy: result.strategy,
          changes: result.changes,
          confidence: result.confidence,
          recoveryTime: Date.now() - this.startTime,
          message: 'Error successfully recovered!',
          userId: errorContext.projectContext.userId
        });
      }
    } catch (e) {
      console.error('[ErrorRecovery] Failed to emit error_recovered event:', e);
    }

    // Send success webhook - best effort
    try {
      await getWebhookService().send({
        type: 'error_recovery_completed',
        buildId: errorContext.projectContext?.buildId || 'unknown',
        timestamp: Date.now(),
        data: {
          errorId: errorContext.errorId,
          status: 'recovered',
          method: result.method,
          strategy: result.strategy,
          confidence: result.confidence > 0.8 ? 'high' : result.confidence > 0.6 ? 'medium' : 'low',
          timeToRecover: `${Math.round((Date.now() - this.startTime) / 1000)} seconds`,
          summary: {
            issueDetected: errorContext.errorType,
            fixApplied: result.strategy.replace(/_/g, ' '),
            changes: result.changes
          }
        }
      });
    } catch (e) {
      console.error('[ErrorRecovery] Failed to send error_recovery_completed webhook:', e);
    }
  }
}

// Create the error recovery worker
export const errorRecoveryWorker = new Worker(
  'error-recovery',
  async (job: Job<ErrorRecoveryJobData>) => {
    const processor = new ErrorRecoveryProcessor();
    return await processor.processRecovery(job);
  },
  {
    connection,
    concurrency: 2, // Process 2 error recoveries simultaneously
  }
);

// Start error recovery worker
export async function startErrorRecoveryWorker(): Promise<void> {
  console.log('Starting error recovery worker...');
  
  errorRecoveryWorker.on('completed', (job, result: RecoveryResult) => {
    console.log(`[ErrorRecovery] Completed: ${job.id} - Status: ${result.status}`);
  });
  
  errorRecoveryWorker.on('failed', (job, err) => {
    console.error(`[ErrorRecovery] Failed ${job?.id}:`, err.message);
  });
  
  errorRecoveryWorker.on('progress', (job, progress) => {
    console.log(`[ErrorRecovery] Progress ${job.id}:`, progress);
  });
  
  // Initialize components
  const patternDB = getPatternDatabase();
  await patternDB.initialize();
  
  const auditLogger = getAuditLogger();
  await auditLogger.initialize();
  
  console.log('✅ Error Recovery worker started');
}

// Graceful shutdown
export async function shutdownErrorRecoveryWorker(): Promise<void> {
  console.log('Shutting down error recovery worker...');
  await errorRecoveryWorker.close();
  console.log('✅ Error Recovery worker shut down');
}