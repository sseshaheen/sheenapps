import { ErrorContext } from './errorInterceptor';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ClaudeCLIProvider } from '../providers/claudeCLIProvider';

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface ClaudeResolution {
  diagnosis: string;
  confidence: number; // 0.0-1.0
  fixes: Array<{
    type: 'file_edit' | 'command' | 'config_change' | 'dependency_add' | 'dependency_remove';
    target: string;
    action: string;
    reason: string;
    content?: string | undefined; // For file_edit type
    before?: string | undefined;  // For verification
    after?: string | undefined;   // For verification
  }>;
  validation: string;
  estimatedTime: number; // seconds
  riskLevel: 'low' | 'medium' | 'high';
  rollbackPlan?: string | undefined;
}

export interface ClaudeContext {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  errorDetails: {
    type: string;
    message: string;
    stackTrace?: string | undefined;
    source: string;
    stage?: string | undefined;
  };
  projectContext: {
    framework?: string | undefined;
    dependencies?: Record<string, string> | undefined;
    recentChanges?: string[] | undefined;
    projectStructure?: string[] | undefined;
  };
  affectedFiles: Array<{
    path: string;
    content?: string | undefined;
    size?: number | undefined;
    lastModified?: Date | undefined;
  }>;
  attemptHistory: Array<{
    strategy: string;
    result: 'success' | 'failure';
    changes?: string[] | undefined;
    error?: string | undefined;
  }>;
  systemInfo: {
    nodeVersion?: string;
    platform?: string;
    memoryUsage?: NodeJS.MemoryUsage;
  };
}

export interface ClaudeConfig {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  apiKey?: string | undefined;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number; // milliseconds
  retryAttempts: number;
  costLimit: number; // dollars per resolution
}

export class ClaudeErrorResolver {
  private config: ClaudeConfig;
  private claudeProvider?: ClaudeCLIProvider;
  private providerInitialized = false;
  private usageStats = {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0,
    successfulResolutions: 0,
    failedResolutions: 0
  };

  constructor(config?: Partial<ClaudeConfig>) {
    this.config = {
      apiKey: process.env.CLAUDE_API_KEY,
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.2, // Lower temperature for more deterministic fixes
      timeout: 60000, // 1 minute
      retryAttempts: 3,
      costLimit: 1.00, // $1 per resolution limit
      ...config
    };
    // Defer provider creation until needed
  }

  private async ensureProviderInitialized(): Promise<void> {
    if (!this.providerInitialized) {
      this.claudeProvider = new ClaudeCLIProvider();
      await this.claudeProvider.initialize();
      this.providerInitialized = true;
    }
  }

  async resolveError(errorContext: ErrorContext): Promise<ClaudeResolution> {
    console.log(`[ClaudeResolver] Analyzing error: ${errorContext.errorId}`);
    
    // Initialize provider on first use
    await this.ensureProviderInitialized();
    
    // Note: Claude CLI doesn't need API key - it uses system authentication

    // Build comprehensive context
    const context = await this.buildErrorContext(errorContext);
    
    // Create focused prompt
    const prompt = this.createErrorResolutionPrompt(context);
    
    // Get Claude's analysis and fix
    const response = await this.queryClaudeWithRetry(prompt);
    
    // Parse and validate response
    const resolution = await this.parseResolution(response, errorContext);
    
    // Update usage stats
    this.updateUsageStats(true);
    
    return resolution;
  }

  private async buildErrorContext(errorContext: ErrorContext): Promise<ClaudeContext> {
    const context: ClaudeContext = {
      errorDetails: {
        type: errorContext.errorType,
        message: errorContext.errorMessage,
        stackTrace: errorContext.stackTrace,
        source: errorContext.source,
        stage: errorContext.stage
      },
      projectContext: {
        framework: errorContext.projectContext?.framework,
        dependencies: errorContext.projectContext?.dependencies,
        recentChanges: errorContext.projectContext?.recentChanges || []
      },
      affectedFiles: [],
      attemptHistory: errorContext.attemptHistory || [],
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage()
      }
    };

    // Build project structure if we have a project path
    if (errorContext.projectContext?.projectId) {
      try {
        const projectPath = this.getProjectPath(errorContext.projectContext.projectId, errorContext.projectContext.projectPath);
        context.projectContext.projectStructure = await this.getProjectStructure(projectPath);
        
        // Load affected files content (limited to relevant files)
        if (errorContext.affectedFiles && errorContext.affectedFiles.length > 0) {
          context.affectedFiles = await this.loadFileContents(errorContext.affectedFiles, projectPath);
        } else {
          // Auto-detect relevant files based on error
          context.affectedFiles = await this.detectRelevantFiles(errorContext, projectPath);
        }
      } catch (error) {
        console.warn('[ClaudeResolver] Could not load project context:', error);
      }
    }

    return context;
  }

  private getProjectPath(projectId: string, projectPath?: string): string {
    // Use provided project path if available, otherwise use default
    if (projectPath) {
      return projectPath;
    }
    // This should match the path structure used in your system
    return path.join(process.cwd(), 'temp', projectId);
  }

  private async getProjectStructure(projectPath: string, maxDepth = 3): Promise<string[]> {
    const structure: string[] = [];
    const excludeDirs = new Set(['node_modules', '.git', 'temp', 'tmp', 'dist', 'build']);
    
    const scanDirectory = async (currentPath: string, currentDepth = 0, relativePath = ''): Promise<void> => {
      if (currentDepth > maxDepth) return;
      
      try {
        const items = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const item of items) {
          const itemRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;
          
          if (item.isDirectory() && !excludeDirs.has(item.name)) {
            structure.push(`📁 ${itemRelativePath}/`);
            if (currentDepth < maxDepth) {
              await scanDirectory(path.join(currentPath, item.name), currentDepth + 1, itemRelativePath);
            }
          } else if (item.isFile()) {
            const ext = path.extname(item.name);
            const icon = this.getFileIcon(ext);
            structure.push(`${icon} ${itemRelativePath}`);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    await scanDirectory(projectPath);
    return structure.slice(0, 50); // Limit to first 50 items
  }

  private getFileIcon(extension: string): string {
    const icons: Record<string, string> = {
      '.js': '📜', '.ts': '📘', '.json': '📋', '.html': '🌐', '.css': '🎨',
      '.md': '📖', '.txt': '📄', '.yml': '⚙️', '.yaml': '⚙️', '.xml': '📰',
      '.png': '🖼️', '.jpg': '🖼️', '.jpeg': '🖼️', '.gif': '🖼️', '.svg': '🖼️'
    };
    return icons[extension] || '📄';
  }

  private async loadFileContents(affectedFiles: ErrorContext['affectedFiles'], projectPath: string): Promise<ClaudeContext['affectedFiles']> {
    const files: ClaudeContext['affectedFiles'] = [];
    const maxFileSize = 10 * 1024; // 10KB max per file
    const maxFiles = 5; // Maximum 5 files

    if (!affectedFiles) return files;

    // Resolve and normalize the project path for comparison
    const normalizedProjectPath = path.resolve(projectPath);

    for (let i = 0; i < Math.min(affectedFiles.length, maxFiles); i++) {
      const file = affectedFiles[i];
      if (!file) continue; // Guard for noUncheckedIndexedAccess
      const fullPath = path.resolve(projectPath, file.path);

      // SECURITY: Validate that resolved path is still under projectPath
      // Prevents path traversal attacks via ../../ in file.path
      if (!fullPath.startsWith(normalizedProjectPath + path.sep) && fullPath !== normalizedProjectPath) {
        console.warn('[ClaudeResolver] PATH TRAVERSAL BLOCKED:', {
          requestedPath: file.path,
          resolvedPath: fullPath,
          projectPath: normalizedProjectPath
        });
        files.push({
          path: file.path,
          content: '[Access denied - path outside project directory]'
        });
        continue;
      }

      try {
        const stats = await fs.stat(fullPath);

        if (stats.size > maxFileSize) {
          files.push({
            path: file.path,
            size: stats.size,
            lastModified: stats.mtime,
            content: '[File too large to include]'
          });
        } else {
          const content = await fs.readFile(fullPath, 'utf8');
          files.push({
            path: file.path,
            content,
            size: stats.size,
            lastModified: stats.mtime
          });
        }
      } catch (error) {
        files.push({
          path: file.path,
          content: '[Could not read file]'
        });
      }
    }

    return files;
  }

  private async detectRelevantFiles(errorContext: ErrorContext, projectPath: string): Promise<ClaudeContext['affectedFiles']> {
    const relevantFiles: string[] = [];
    
    // Always include package.json if it exists
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fs.access(packageJsonPath).then(() => true).catch(() => false)) {
      relevantFiles.push('package.json');
    }
    
    // Include config files based on error type
    if (errorContext.errorMessage.includes('typescript') || errorContext.errorMessage.includes('tsc')) {
      relevantFiles.push('tsconfig.json');
    }
    
    if (errorContext.errorMessage.includes('eslint')) {
      relevantFiles.push('.eslintrc.js', '.eslintrc.json', '.eslintrc.yml');
    }
    
    if (errorContext.errorMessage.includes('vite')) {
      relevantFiles.push('vite.config.js', 'vite.config.ts');
    }
    
    if (errorContext.errorMessage.includes('webpack')) {
      relevantFiles.push('webpack.config.js', 'webpack.config.ts');
    }
    
    // Filter to files that actually exist and load their content
    const existingFiles: Array<{ path: string }> = [];
    for (const file of relevantFiles) {
      const fullPath = path.join(projectPath, file);
      if (await fs.access(fullPath).then(() => true).catch(() => false)) {
        existingFiles.push({ path: file });
      }
    }
    
    return await this.loadFileContents(existingFiles, projectPath);
  }

  private createErrorResolutionPrompt(context: ClaudeContext): string {
    return `You are an expert software engineer debugging a build/deployment error. Analyze the error and provide a precise fix.

ERROR DETAILS:
- Type: ${context.errorDetails.type}
- Message: ${context.errorDetails.message}
- Source: ${context.errorDetails.source}${context.errorDetails.stage ? ` (${context.errorDetails.stage})` : ''}
- Stack Trace: ${context.errorDetails.stackTrace || 'Not available'}

PROJECT CONTEXT:
- Framework: ${context.projectContext.framework || 'Unknown'}
- Platform: ${context.systemInfo.platform}
- Node Version: ${context.systemInfo.nodeVersion}

${context.projectContext.dependencies ? `
DEPENDENCIES:
${Object.entries(context.projectContext.dependencies).slice(0, 20).map(([name, version]) => `- ${name}: ${version}`).join('\n')}
` : ''}

${context.projectContext.projectStructure ? `
PROJECT STRUCTURE:
${context.projectContext.projectStructure.slice(0, 20).join('\n')}
` : ''}

${context.affectedFiles.length > 0 ? `
RELEVANT FILES:
${context.affectedFiles.map(file => `
--- ${file.path} ---
${file.content || '[Content not available]'}
`).join('\n')}
` : ''}

${context.attemptHistory.length > 0 ? `
PREVIOUS ATTEMPTS:
${context.attemptHistory.map(attempt => `- ${attempt.strategy}: ${attempt.result}${attempt.error ? ` (${attempt.error})` : ''}`).join('\n')}
` : ''}

${context.projectContext.recentChanges && context.projectContext.recentChanges.length > 0 ? `
RECENT CHANGES:
${context.projectContext.recentChanges.join('\n')}
` : ''}

INSTRUCTIONS:
1. Analyze the root cause of the error
2. Provide a specific, actionable solution
3. Consider the project context and previous attempts
4. Ensure the fix is safe and won't break other functionality
5. Provide validation steps to confirm the fix worked

Respond with a JSON object in this exact format:
{
  "diagnosis": "Clear explanation of the root cause in 1-2 sentences",
  "confidence": 0.0-1.0,
  "fixes": [
    {
      "type": "file_edit|command|config_change|dependency_add|dependency_remove",
      "target": "specific file path or command name",
      "action": "exact change to make",
      "reason": "why this fixes the issue",
      "content": "new file content (only for file_edit type)",
      "before": "text to find (for file_edit verification)",
      "after": "text to replace with (for file_edit verification)"
    }
  ],
  "validation": "How to verify the fix worked (specific command or test)",
  "estimatedTime": 60,
  "riskLevel": "low|medium|high",
  "rollbackPlan": "How to undo this fix if needed"
}

Only provide the JSON response, no additional text.`;
  }

  private async queryClaudeWithRetry(prompt: string): Promise<string> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        console.log(`[ClaudeResolver] Attempt ${attempt}/${this.config.retryAttempts}`);
        
        // Ensure provider is initialized
        await this.ensureProviderInitialized();
        
        // Use existing Claude CLI provider
        const response = await (this.claudeProvider as any).runClaudeCLI(prompt);
        
        this.usageStats.totalRequests++;
        // Update usage stats if available
        if ((this.claudeProvider as any).lastUsage) {
          const usage = (this.claudeProvider as any).lastUsage;
          this.usageStats.totalTokens += usage.promptTokens + usage.completionTokens;
          this.usageStats.totalCost += usage.totalCost;
        }
        
        return response;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[ClaudeResolver] Attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < this.config.retryAttempts) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    this.updateUsageStats(false);
    throw new Error(`Claude CLI failed after ${this.config.retryAttempts} attempts: ${lastError!.message}`);
  }


  private async mockClaudeResponse(prompt: string): Promise<string> {
    // This is a mock response - in production this would call the actual Claude API
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Analyze the prompt to provide appropriate mock response
    if (prompt.includes('JSON') || prompt.includes('```json')) {
      return JSON.stringify({
        diagnosis: "The package.json file contains malformed JSON with markdown code blocks wrapping the content.",
        confidence: 0.95,
        fixes: [
          {
            type: "file_edit",
            target: "package.json",
            action: "Remove markdown code blocks and fix JSON formatting",
            reason: "The JSON parser cannot handle markdown code blocks and requires proper JSON format",
            before: "```json",
            after: ""
          }
        ],
        validation: "Parse the package.json file to ensure it's valid JSON",
        estimatedTime: 30,
        riskLevel: "low",
        rollbackPlan: "Restore the original package.json from backup"
      });
    }
    
    if (prompt.includes('ERESOLVE') || prompt.includes('peer dep')) {
      return JSON.stringify({
        diagnosis: "NPM dependency resolution conflict due to incompatible peer dependencies between packages.",
        confidence: 0.85,
        fixes: [
          {
            type: "dependency_add",
            target: "package.json",
            action: "Add missing peer dependencies or adjust version ranges",
            reason: "Resolves the dependency tree conflicts by satisfying peer dependency requirements"
          },
          {
            type: "command",
            target: "npm install --legacy-peer-deps",
            action: "Install with legacy peer dependency resolution",
            reason: "Fallback option that bypasses strict peer dependency checking"
          }
        ],
        validation: "Run 'npm ls --depth=0' to verify no dependency conflicts",
        estimatedTime: 120,
        riskLevel: "medium",
        rollbackPlan: "Restore original package.json and package-lock.json"
      });
    }
    
    if (prompt.includes('terser') && prompt.includes('vite')) {
      return JSON.stringify({
        diagnosis: "Vite 5.x requires the terser package for minification, but it's not installed as terser became an optional dependency.",
        confidence: 0.95,
        fixes: [
          {
            type: "dependency_add",
            target: "package.json",
            action: "Add terser to devDependencies",
            reason: "Vite 5.x requires terser for production builds but no longer includes it by default",
            content: "Add 'terser': '^5.24.0' to devDependencies"
          }
        ],
        validation: "Run 'npm run build' to verify the build completes successfully",
        estimatedTime: 60,
        riskLevel: "low",
        rollbackPlan: "Remove terser from devDependencies if issues arise"
      });
    }
    
    // Generic response for unknown errors
    return JSON.stringify({
      diagnosis: "Unable to determine a specific fix for this error pattern. This may require manual investigation.",
      confidence: 0.3,
      fixes: [
        {
          type: "command",
          target: "npm audit fix",
          action: "Run automated dependency fixes",
          reason: "May resolve some common dependency issues"
        }
      ],
      validation: "Check if the original error still occurs",
      estimatedTime: 180,
      riskLevel: "medium",
      rollbackPlan: "Restore project from backup if changes cause issues"
    });
  }

  private async parseResolution(response: string, errorContext: ErrorContext): Promise<ClaudeResolution> {
    try {
      // Clean up the response - remove any markdown or extra text
      const jsonStart = response.indexOf('{');
      const jsonEnd = response.lastIndexOf('}') + 1;
      
      if (jsonStart === -1 || jsonEnd === 0) {
        throw new Error('No JSON found in Claude response');
      }
      
      const jsonContent = response.substring(jsonStart, jsonEnd);
      const parsed = JSON.parse(jsonContent);
      
      // Validate required fields
      if (!parsed.diagnosis || typeof parsed.confidence !== 'number' || !Array.isArray(parsed.fixes)) {
        throw new Error('Invalid Claude response format');
      }
      
      // Sanitize and validate the response
      const resolution: ClaudeResolution = {
        diagnosis: this.sanitizeString(parsed.diagnosis),
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        fixes: parsed.fixes.map((fix: any) => ({
          type: fix.type,
          target: this.sanitizeString(fix.target),
          action: this.sanitizeString(fix.action),
          reason: this.sanitizeString(fix.reason),
          // Use sanitizeContent for content fields as they may contain file content
          content: fix.content ? this.sanitizeContent(fix.content) : undefined,
          before: fix.before ? this.sanitizeContent(fix.before) : undefined,
          after: fix.after ? this.sanitizeContent(fix.after) : undefined
        })),
        validation: this.sanitizeString(parsed.validation),
        estimatedTime: Math.max(30, Math.min(1800, parsed.estimatedTime || 300)), // 30s to 30min
        riskLevel: ['low', 'medium', 'high'].includes(parsed.riskLevel) ? parsed.riskLevel : 'medium',
        rollbackPlan: parsed.rollbackPlan ? this.sanitizeString(parsed.rollbackPlan) : undefined
      };
      
      // Security validation
      this.validateResolutionSecurity(resolution);
      
      return resolution;
      
    } catch (error) {
      console.error('[ClaudeResolver] Failed to parse Claude response:', error);
      console.error('[ClaudeResolver] Raw response:', response.substring(0, 500));
      
      // Return a safe fallback response
      return {
        diagnosis: 'Failed to parse Claude resolution response',
        confidence: 0.1,
        fixes: [],
        validation: 'Manual verification required',
        estimatedTime: 300,
        riskLevel: 'high',
        rollbackPlan: 'Restore from backup'
      };
    }
  }

  private sanitizeString(str: string, maxLength: number = 1000): string {
    if (typeof str !== 'string') return '';

    // Remove potentially dangerous patterns
    return str
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/data:/gi, '') // Remove data: URLs
      .replace(/file:/gi, '') // Remove file: URLs
      .trim()
      .substring(0, maxLength);
  }

  /**
   * Sanitize content fields that may contain file content.
   * Allows much larger content than regular strings (100KB limit).
   */
  private sanitizeContent(str: string): string {
    return this.sanitizeString(str, 100 * 1024); // 100KB limit for file content
  }

  private validateResolutionSecurity(resolution: ClaudeResolution): void {
    const dangerousPatterns = [
      /rm\s+-rf/i,
      /\.\.\/\.\.\//,
      /\/etc\/passwd/i,
      /sudo/i,
      /chmod\s+777/i,
      /eval\s*\(/i,
      /exec\s*\(/i,
      /system\s*\(/i
    ];

    // Build text to check - note: spread the array, not the joined string
    const fixesText = resolution.fixes.map(fix => `${fix.action} ${fix.content || ''}`).join(' ');
    const textToCheck = [
      resolution.diagnosis,
      resolution.validation,
      resolution.rollbackPlan || '',
      fixesText
    ].join(' ');
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(textToCheck)) {
        throw new Error(`Security risk detected in Claude resolution: ${pattern.source}`);
      }
    }
    
    // Validate fix types
    const allowedFixTypes = ['file_edit', 'command', 'config_change', 'dependency_add', 'dependency_remove'];
    for (const fix of resolution.fixes) {
      if (!allowedFixTypes.includes(fix.type)) {
        throw new Error(`Invalid fix type: ${fix.type}`);
      }
    }
  }

  private updateUsageStats(success: boolean): void {
    if (success) {
      this.usageStats.successfulResolutions++;
    } else {
      this.usageStats.failedResolutions++;
    }
  }

  getUsageStats(): typeof this.usageStats {
    return { ...this.usageStats };
  }

  async checkApiHealth(): Promise<{
    available: boolean;
    latency?: number;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      
      // Simple check - just verify Claude CLI exists
      const { execSync } = require('child_process');
      try {
        execSync('which claude', { encoding: 'utf8' });
        return {
          available: true,
          latency: Date.now() - startTime
        };
      } catch {
        return {
          available: false,
          error: 'Claude CLI not found in PATH'
        };
      }
      
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  resetUsageStats(): void {
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      successfulResolutions: 0,
      failedResolutions: 0
    };
  }
}

// Singleton instance
let claudeResolverInstance: ClaudeErrorResolver | null = null;

export function getClaudeResolver(config?: Partial<ClaudeConfig>): ClaudeErrorResolver {
  if (!claudeResolverInstance) {
    claudeResolverInstance = new ClaudeErrorResolver(config);
  }
  return claudeResolverInstance;
}