import * as fs from 'fs/promises';
import * as path from 'path';
import { ErrorCategory } from './errorInterceptor';

export interface ErrorPattern {
  id: string;
  pattern: RegExp | string;
  category: ErrorCategory;
  fix: FixStrategy;
  successRate: number;
  lastUsed: Date;
  usageCount: number;
  metadata: Record<string, any>;
  description: string;
  tags: string[];
}

export interface FixStrategy {
  type: 'function' | 'command' | 'file_edit' | 'multi_step';
  handler?: string;
  command?: string;
  file?: {
    path: string;
    search: string;
    replace: string;
  };
  steps?: Array<{
    type: 'function' | 'command' | 'file_edit';
    handler?: string;
    command?: string;
    file?: {
      path: string;
      search: string;
      replace: string;
    };
  }>;
  validation?: {
    type: 'command' | 'function';
    command?: string;
    handler?: string;
  };
  rollback?: {
    type: 'snapshot' | 'git_reset' | 'file_restore';
    target?: string;
  };
}

export interface PatternMatchResult {
  pattern: ErrorPattern;
  confidence: number;
  matchDetails: {
    matchedText: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    groups?: string[] | undefined;
    position?: number | undefined;
  };
  suggestedFix: FixStrategy;
  estimatedTime: number;
}

export interface PatternSearchOptions {
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  category?: ErrorCategory | undefined;
  minConfidence?: number | undefined;
  maxResults?: number | undefined;
  tags?: string[] | undefined;
}

export class ErrorPatternDatabase {
  private patterns: Map<string, ErrorPattern> = new Map();
  private readonly dataPath: string;
  private loaded = false;

  constructor(dataPath?: string) {
    this.dataPath = dataPath || path.join(process.cwd(), 'data', 'error-patterns.json');
  }

  async initialize(): Promise<void> {
    await this.loadPatterns();
    this.addBuiltInPatterns();
    this.loaded = true;
    console.log(`✅ Error Pattern Database initialized with ${this.patterns.size} patterns`);
  }

  private async loadPatterns(): Promise<void> {
    try {
      await fs.access(this.dataPath);
      const data = await fs.readFile(this.dataPath, 'utf8');
      const storedPatterns = JSON.parse(data) as Array<{
        pattern: ErrorPattern;
        serializedRegex?: string;
      }>;

      for (const item of storedPatterns) {
        const pattern = { ...item.pattern };
        
        // Deserialize regex patterns
        if (item.serializedRegex) {
          const match = item.serializedRegex.match(/^\/(.+)\/([gimuy]*)$/);
          if (match && match[1]) {
            pattern.pattern = new RegExp(match[1], match[2] ?? '');
          }
        }

        // Restore Date objects
        pattern.lastUsed = new Date(pattern.lastUsed);
        
        this.patterns.set(pattern.id, pattern);
      }
      
      console.log(`Loaded ${storedPatterns.length} stored error patterns`);
    } catch (error) {
      console.log('No existing pattern database found, starting fresh');
    }
  }

  private addBuiltInPatterns(): void {
    const builtInPatterns: ErrorPattern[] = [
      // JSON Format Errors
      {
        id: 'json-markdown-wrapper',
        pattern: /```json[\s\S]*?```/,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'healJSON',
          validation: {
            type: 'function',
            handler: 'validateJSON'
          }
        },
        successRate: 0.95,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          aiGenerated: true,
          commonInFrameworks: ['all']
        },
        description: 'JSON content wrapped in markdown code blocks',
        tags: ['json', 'parsing', 'format', 'ai-generated']
      },
      
      {
        id: 'json-trailing-comma',
        pattern: /unexpected token.*,.*json/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'healJSON',
          validation: {
            type: 'function',
            handler: 'validateJSON'
          }
        },
        successRate: 0.92,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          commonInFrameworks: ['all']
        },
        description: 'JSON with trailing commas (invalid in strict JSON)',
        tags: ['json', 'parsing', 'syntax']
      },

      {
        id: 'json-single-quotes',
        pattern: /unexpected token.*'.*json/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'healJSON',
          validation: {
            type: 'function',
            handler: 'validateJSON'
          }
        },
        successRate: 0.90,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          commonInFrameworks: ['all']
        },
        description: 'JSON using single quotes instead of double quotes',
        tags: ['json', 'parsing', 'quotes']
      },

      // Dependency Resolution Errors
      {
        id: 'npm-eresolve',
        pattern: /ERESOLVE unable to resolve dependency tree/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'fixDependencyConflicts',
          validation: {
            type: 'command',
            command: 'npm ls --depth=0'
          },
          rollback: {
            type: 'file_restore',
            target: 'package.json'
          }
        },
        successRate: 0.85,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          packageManagers: ['npm', 'pnpm'],
          commonInFrameworks: ['react', 'vue', 'angular']
        },
        description: 'NPM dependency resolution conflicts',
        tags: ['npm', 'dependencies', 'resolution', 'peer-deps']
      },

      {
        id: 'peer-dependency-warning',
        pattern: /peer dep.*missing/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'fixDependencyConflicts',
          validation: {
            type: 'command',
            command: 'npm ls --depth=0'
          }
        },
        successRate: 0.88,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          severity: 'warning'
        },
        description: 'Missing peer dependency warnings',
        tags: ['npm', 'peer-dependencies', 'warnings']
      },

      // Build Tool Dependency Evolution
      {
        id: 'vite-terser-missing',
        pattern: /\[vite:terser\] terser not found/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'multi_step',
          steps: [
            {
              type: 'function',
              handler: 'addTerserDependency'
            },
            {
              type: 'command',
              command: 'npm install'
            }
          ],
          validation: {
            type: 'command',
            command: 'npm run build'
          }
        },
        successRate: 0.95,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          viteVersion: '5.x',
          dependencyEvolution: true
        },
        description: 'Vite 5.x requiring terser for minification',
        tags: ['vite', 'terser', 'build', 'minification', 'evolution']
      },

      {
        id: 'webpack-loader-missing',
        pattern: /cannot resolve loader/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'addMissingWebpackLoader',
          validation: {
            type: 'command',
            command: 'npm run build'
          }
        },
        successRate: 0.80,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          dependencyEvolution: true
        },
        description: 'Missing webpack loaders (Webpack 5.x evolution)',
        tags: ['webpack', 'loaders', 'build', 'evolution']
      },

      // Module Resolution Errors
      {
        id: 'module-not-found',
        pattern: /module not found.*error.*can't resolve/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'resolveModule',
          validation: {
            type: 'command',
            command: 'npm run build'
          }
        },
        successRate: 0.75,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in'
        },
        description: 'Module resolution failures',
        tags: ['modules', 'resolution', 'imports']
      },

      // Non-existent package errors
      {
        id: 'non-existent-package',
        pattern: /Non-existent packages: (.+)/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'fixNonExistentPackage',
          validation: {
            type: 'command',
            command: 'npm run build'
          }
        },
        successRate: 0.90,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          commonCause: 'Version typos or unpublished versions'
        },
        description: 'Package version does not exist in registry',
        tags: ['npm', 'packages', 'version', 'registry']
      },

      {
        id: 'empty-package-json',
        pattern: /Invalid package\.json.*Unexpected end of JSON input|File size: 0 bytes/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'createMinimalPackageJson',
          validation: {
            type: 'command',
            command: 'cat package.json'
          }
        },
        successRate: 0.95,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: {
          source: 'built-in',
          commonCause: 'Empty or missing package.json file'
        },
        description: 'Empty package.json file needs initialization',
        tags: ['package.json', 'empty', 'initialization']
      },

      // TypeScript Errors
      {
        id: 'typescript-version-conflict',
        pattern: /typescript.*version.*incompatible/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'fixTypeScriptVersion',
          validation: {
            type: 'command',
            command: 'npx tsc --noEmit'
          }
        },
        successRate: 0.82,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in'
        },
        description: 'TypeScript version conflicts with other packages',
        tags: ['typescript', 'version', 'compatibility']
      },

      {
        id: 'react-scripts-typescript',
        pattern: /react-scripts.*typescript.*5/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'fixReactScriptsTypeScript',
          validation: {
            type: 'command',
            command: 'npm run build'
          }
        },
        successRate: 0.90,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          framework: 'react'
        },
        description: 'React Scripts incompatible with TypeScript 5.x',
        tags: ['react-scripts', 'typescript', 'compatibility']
      },

      // Git and Path Errors
      {
        id: 'git-not-initialized',
        pattern: /not a git repository/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'command',
          command: 'git init',
          validation: {
            type: 'command',
            command: 'git status'
          }
        },
        successRate: 0.98,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in'
        },
        description: 'Git repository not initialized',
        tags: ['git', 'initialization', 'setup']
      },

      {
        id: 'permission-denied',
        pattern: /permission denied.*eacces/i,
        category: ErrorCategory.RECOVERABLE_CLAUDE,
        fix: {
          type: 'function',
          handler: 'claudeResolvePermissions'
        },
        successRate: 0.65,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          requiresElevation: false
        },
        description: 'File permission errors',
        tags: ['permissions', 'access', 'filesystem']
      },

      // Network and Deployment Errors
      {
        id: 'wrangler-fetch-failed',
        pattern: /wrangler.*fetch failed/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'retryDeployment',
          validation: {
            type: 'command',
            command: 'wrangler --version'
          }
        },
        successRate: 0.9,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          retryable: true,
          maxRetries: 3
        },
        description: 'Wrangler deployment failed due to network issues',
        tags: ['wrangler', 'network', 'deployment', 'fetch', 'cloudflare']
      },

      {
        id: 'npm-network-timeout',
        pattern: /npm.*ETIMEDOUT|npm.*network|npm.*timeout/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'retryNpmInstall',
          validation: {
            type: 'command',
            command: 'npm ls --depth=0'
          }
        },
        successRate: 0.85,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          retryable: true,
          networkRelated: true
        },
        description: 'NPM network timeout or connection issues',
        tags: ['npm', 'network', 'timeout', 'install', 'registry']
      },

      {
        id: 'connection-reset',
        pattern: /ECONNRESET|connection reset|ENOTFOUND/i,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'retryWithBackoff',
          validation: {
            type: 'function',
            handler: 'validateNetworkAccess'
          }
        },
        successRate: 0.8,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          retryable: true,
          networkRelated: true
        },
        description: 'Network connection reset or DNS resolution failed',
        tags: ['network', 'connection', 'dns', 'reset']
      },

      // TypeScript Compilation Errors
      {
        id: 'typescript-unused-variable',
        pattern: /error TS6133:.*is declared but its value is never read/,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'removeUnusedVariables',
          validation: {
            type: 'command',
            command: 'npx tsc --noEmit'
          }
        },
        successRate: 0.9,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          autoFixable: true,
          commonInAI: true
        },
        description: 'TypeScript unused variable errors',
        tags: ['typescript', 'unused', 'variables', 'ai-generated']
      },

      {
        id: 'typescript-no-default-export',
        pattern: /error TS1192:.*has no default export/,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'fixExportMismatch',
          validation: {
            type: 'command',
            command: 'npx tsc --noEmit'
          }
        },
        successRate: 0.85,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          autoFixable: true,
          commonInAI: true
        },
        description: 'TypeScript import/export mismatch',
        tags: ['typescript', 'imports', 'exports', 'modules', 'ai-generated']
      },

      {
        id: 'typescript-duplicate-jsx-attribute',
        pattern: /error TS17001:.*JSX elements cannot have multiple attributes with the same name/,
        category: ErrorCategory.RECOVERABLE_PATTERN,
        fix: {
          type: 'function',
          handler: 'removeDuplicateJSXAttributes',
          validation: {
            type: 'command',
            command: 'npx tsc --noEmit'
          }
        },
        successRate: 0.95,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          autoFixable: true,
          commonInAI: true
        },
        description: 'JSX duplicate attribute error',
        tags: ['typescript', 'jsx', 'react', 'attributes', 'ai-generated']
      },

      {
        id: 'typescript-compilation-failed',
        pattern: /Command failed with code 2:.*tsc/,
        category: ErrorCategory.RECOVERABLE_CLAUDE,
        fix: {
          type: 'function',
          handler: 'claudeFixTypeScript',
          validation: {
            type: 'command',
            command: 'npx tsc --noEmit'
          }
        },
        successRate: 0.75,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          requiresClaude: true,
          timeLimit: 600000 // 10 minutes
        },
        description: 'TypeScript compilation failed - requires Claude fix',
        tags: ['typescript', 'compilation', 'build', 'claude']
      },

      // Security Risk Patterns
      {
        id: 'path-traversal-attempt',
        pattern: /\.\.\/\.\.\//,
        category: ErrorCategory.SECURITY_RISK,
        fix: {
          type: 'function',
          handler: 'blockAndReport'
        },
        successRate: 1.0,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          severity: 'critical'
        },
        description: 'Path traversal attack attempt',
        tags: ['security', 'path-traversal', 'attack']
      },

      {
        id: 'code-injection-attempt',
        pattern: /eval\s*\(|Function\s*\(|exec\s*\(/,
        category: ErrorCategory.SECURITY_RISK,
        fix: {
          type: 'function',
          handler: 'blockAndReport'
        },
        successRate: 1.0,
        lastUsed: new Date(),
        usageCount: 0,
        metadata: { 
          source: 'built-in',
          severity: 'critical'
        },
        description: 'Code injection attempt detected',
        tags: ['security', 'injection', 'attack']
      }
    ];

    for (const pattern of builtInPatterns) {
      this.patterns.set(pattern.id, pattern);
    }

    console.log(`Added ${builtInPatterns.length} built-in error patterns`);
  }

  async findPattern(errorMessage: string, options?: PatternSearchOptions): Promise<PatternMatchResult | null> {
    if (!this.loaded) {
      await this.initialize();
    }

    let bestMatch: PatternMatchResult | null = null;
    let bestConfidence = 0;

    for (const pattern of this.patterns.values()) {
      // Filter by category if specified
      if (options?.category && pattern.category !== options.category) {
        continue;
      }

      // Filter by tags if specified
      if (options?.tags?.length && !options.tags.some(tag => pattern.tags.includes(tag))) {
        continue;
      }

      const matchResult = this.testPattern(errorMessage, pattern);
      if (matchResult && matchResult.confidence > bestConfidence) {
        if (!options?.minConfidence || matchResult.confidence >= options.minConfidence) {
          bestMatch = matchResult;
          bestConfidence = matchResult.confidence;
        }
      }
    }

    return bestMatch;
  }

  async findPatterns(errorMessage: string, options?: PatternSearchOptions): Promise<PatternMatchResult[]> {
    if (!this.loaded) {
      await this.initialize();
    }

    const matches: PatternMatchResult[] = [];

    for (const pattern of this.patterns.values()) {
      // Filter by category if specified
      if (options?.category && pattern.category !== options.category) {
        continue;
      }

      // Filter by tags if specified
      if (options?.tags?.length && !options.tags.some(tag => pattern.tags.includes(tag))) {
        continue;
      }

      const matchResult = this.testPattern(errorMessage, pattern);
      if (matchResult) {
        if (!options?.minConfidence || matchResult.confidence >= options.minConfidence) {
          matches.push(matchResult);
        }
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    // Limit results if specified
    if (options?.maxResults && matches.length > options.maxResults) {
      return matches.slice(0, options.maxResults);
    }

    return matches;
  }

  private testPattern(errorMessage: string, pattern: ErrorPattern): PatternMatchResult | null {
    let match: RegExpMatchArray | null = null;
    let confidence = 0;

    if (pattern.pattern instanceof RegExp) {
      match = errorMessage.match(pattern.pattern);
      if (match) {
        // Base confidence from pattern success rate
        confidence = pattern.successRate;
        
        // Boost confidence for exact matches
        if (match[0].length > errorMessage.length * 0.5) {
          confidence = Math.min(1.0, confidence + 0.1);
        }

        // Boost confidence for frequently used patterns
        if (pattern.usageCount > 10) {
          confidence = Math.min(1.0, confidence + 0.05);
        }

        // Boost confidence for recently successful patterns
        const daysSinceLastUse = (Date.now() - pattern.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastUse < 7) {
          confidence = Math.min(1.0, confidence + 0.05);
        }
      }
    } else if (typeof pattern.pattern === 'string') {
      if (errorMessage.includes(pattern.pattern)) {
        match = [pattern.pattern];
        confidence = pattern.successRate * 0.9; // Slightly lower for string matches
      }
    }

    if (match && confidence > 0) {
      return {
        pattern,
        confidence,
        matchDetails: {
          matchedText: match[0],
          groups: match.slice(1),
          position: match.index
        },
        suggestedFix: pattern.fix,
        estimatedTime: this.estimateFixTime(pattern)
      };
    }

    return null;
  }

  private estimateFixTime(pattern: ErrorPattern): number {
    const baseTime = {
      'function': 30,
      'command': 60,
      'file_edit': 45,
      'multi_step': 120
    };

    let time = baseTime[pattern.fix.type] || 60;

    // Adjust based on success rate (lower success rate = more time for retries)
    if (pattern.successRate < 0.8) {
      time *= 1.5;
    }

    // Adjust for multi-step fixes
    if (pattern.fix.steps?.length) {
      time = pattern.fix.steps.length * 45;
    }

    return Math.round(time);
  }

  async recordPatternUsage(patternId: string, success: boolean, actualTime?: number): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    // Update usage statistics
    pattern.usageCount++;
    pattern.lastUsed = new Date();

    // Update success rate with exponential moving average
    const weight = 0.1; // How much weight to give to new data
    if (success) {
      pattern.successRate = pattern.successRate * (1 - weight) + 1.0 * weight;
    } else {
      pattern.successRate = pattern.successRate * (1 - weight) + 0.0 * weight;
    }

    // Ensure success rate stays in bounds
    pattern.successRate = Math.max(0.0, Math.min(1.0, pattern.successRate));

    // Store updated data
    await this.savePatterns();
  }

  async addCustomPattern(pattern: Omit<ErrorPattern, 'lastUsed' | 'usageCount'>): Promise<void> {
    const fullPattern: ErrorPattern = {
      ...pattern,
      lastUsed: new Date(),
      usageCount: 0
    };

    this.patterns.set(pattern.id, fullPattern);
    await this.savePatterns();
    
    console.log(`Added custom error pattern: ${pattern.id}`);
  }

  async removePattern(patternId: string): Promise<boolean> {
    const removed = this.patterns.delete(patternId);
    if (removed) {
      await this.savePatterns();
      console.log(`Removed error pattern: ${patternId}`);
    }
    return removed;
  }

  private async savePatterns(): Promise<void> {
    try {
      const patternsToStore = Array.from(this.patterns.values()).map(pattern => {
        const item: any = { pattern };
        
        // Serialize regex patterns
        if (pattern.pattern instanceof RegExp) {
          item.serializedRegex = pattern.pattern.toString();
        }
        
        return item;
      });

      // Ensure directory exists
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      
      await fs.writeFile(this.dataPath, JSON.stringify(patternsToStore, null, 2));
    } catch (error) {
      console.error('Failed to save error patterns:', error);
    }
  }

  getPatternStats(): {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    bySuccessRate: { high: number; medium: number; low: number };
    mostUsed: Array<{ id: string; count: number; successRate: number }>;
  } {
    const stats = {
      total: this.patterns.size,
      byCategory: {
        [ErrorCategory.RECOVERABLE_PATTERN]: 0,
        [ErrorCategory.RECOVERABLE_CLAUDE]: 0,
        [ErrorCategory.NON_RECOVERABLE]: 0,
        [ErrorCategory.SECURITY_RISK]: 0
      },
      bySuccessRate: { high: 0, medium: 0, low: 0 },
      mostUsed: [] as Array<{ id: string; count: number; successRate: number }>
    };

    const patterns = Array.from(this.patterns.values());

    // Count by category
    for (const pattern of patterns) {
      stats.byCategory[pattern.category]++;
      
      if (pattern.successRate >= 0.8) stats.bySuccessRate.high++;
      else if (pattern.successRate >= 0.6) stats.bySuccessRate.medium++;
      else stats.bySuccessRate.low++;
    }

    // Most used patterns
    stats.mostUsed = patterns
      .filter(p => p.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map(p => ({
        id: p.id,
        count: p.usageCount,
        successRate: p.successRate
      }));

    return stats;
  }
}

// Singleton instance
let patternDatabaseInstance: ErrorPatternDatabase | null = null;

export function getPatternDatabase(): ErrorPatternDatabase {
  if (!patternDatabaseInstance) {
    patternDatabaseInstance = new ErrorPatternDatabase();
  }
  return patternDatabaseInstance;
}