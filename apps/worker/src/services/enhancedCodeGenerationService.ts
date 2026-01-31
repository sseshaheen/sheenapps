/**
 * Enhanced Code Generation Service - Phase 5
 *
 * Implements expert-recommended patterns:
 * 1. Hierarchical generation (shared foundation → pages)
 * 2. Compile-repair loop (TypeScript feedback)
 * 3. AI-powered component generation via UnifiedClaudeService (CLI-based)
 * 4. Component caching by signature
 *
 * Expert insight: "Structured outputs = schema compliance, NOT code correctness"
 */

import { getUnifiedClaudeService, UnifiedClaudeService } from './unifiedClaudeService';
import { unifiedLogger } from './unifiedLogger';
import type { MigrationPlan, PagePlan, DesignSystem } from './migrationPlanningService';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import Redis from 'ioredis';

const execAsync = promisify(exec);

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Escape a string for safe interpolation in TypeScript single-quoted string literals.
 * Handles: single quotes, backslashes, newlines, carriage returns, template literals.
 */
function tsString(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')           // Escape backslashes first
    .replace(/'/g, "\\'")             // Escape single quotes
    .replace(/\n/g, '\\n')            // Escape newlines
    .replace(/\r/g, '\\r')            // Escape carriage returns
    .replace(/\t/g, '\\t')            // Escape tabs
    .replace(/\${/g, '\\${');         // Escape template literal interpolations
}

// =============================================================================
// TYPES
// =============================================================================

export interface GeneratedComponent {
  filename: string;
  code: string;
  imports: string[];
  type: string; // 'Button', 'Card', etc.
}

/**
 * Import specification for shared components
 * Used to tell Claude how to import a component, not just its filename
 */
export interface ComponentImportSpec {
  type: string;          // Component name: 'Button', 'Card'
  importPath: string;    // Full import path: '@/components/Button'
  filename: string;      // File name: 'Button.tsx'
}

export interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  message: string;
  code: string;
}

export interface GenerationResult {
  component: GeneratedComponent;
  success: boolean;
  attempts: number;
  errors?: TypeScriptError[];
  usedTemplate: boolean;
}

// Shared UI primitives that are generated once and reused
const SHARED_PRIMITIVE_TYPES = [
  'Button',
  'Card',
  'Input',
  'Textarea',
  'Select',
  'Checkbox',
  'Radio',
  'Badge',
  'Tag',
  'Modal',
  'Dialog',
  'Dropdown',
  'Tabs',
  'Accordion',
];

// Layout components that are generated once
const SHARED_LAYOUT_TYPES = [
  'Header',
  'Footer',
  'Navigation',
  'Sidebar',
];

// =============================================================================
// ENHANCED CODE GENERATION SERVICE
// =============================================================================

export class EnhancedCodeGenerationService {
  private claudeService: UnifiedClaudeService;
  private cache: Map<string, GeneratedComponent> = new Map();
  private redis?: Redis;
  private redisAvailable = false;
  private depsInstalledForProject: Set<string> = new Set(); // Track which projects have deps installed
  private installLocks: Map<string, Promise<void>> = new Map(); // EXPERT FIX: Concurrency guard for npm install

  // Cache configuration
  private readonly CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
  private readonly CACHE_KEY_PREFIX = 'migration:component:v1:'; // Version for cache invalidation

  // Cache statistics
  private cacheStats = {
    hits: 0,
    misses: 0,
    redisHits: 0,
    memoryHits: 0,
    writes: 0,
  };

  constructor() {
    this.claudeService = getUnifiedClaudeService();

    // Initialize Redis for component caching
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection for distributed component caching
   * Gracefully degrades to in-memory only if Redis unavailable
   */
  private initializeRedis(): void {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        unifiedLogger.system('startup', 'info', 'REDIS_URL not set, using in-memory cache only');
        return;
      }

      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            unifiedLogger.system('startup', 'warn', 'Redis connection failed, using in-memory cache only');
            return null; // Stop retrying
          }
          return Math.min(times * 100, 3000); // Exponential backoff
        },
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.redisAvailable = true;
        unifiedLogger.system('startup', 'info', 'Redis connected for component caching');
      });

      this.redis.on('error', (err) => {
        this.redisAvailable = false;
        unifiedLogger.system('startup', 'warn', 'Redis error, falling back to in-memory cache', {
          error: err.message,
        });
      });

      // Connect asynchronously (don't block constructor)
      this.redis.connect().catch((err) => {
        unifiedLogger.system('startup', 'warn', 'Redis connection failed', {
          error: err.message,
        });
      });

    } catch (error) {
      unifiedLogger.system('startup', 'warn', 'Failed to initialize Redis', {
        error: (error as Error).message,
      });
    }
  }

  // ===========================================================================
  // PATH SECURITY (Expert Priority: Critical)
  // ===========================================================================

  /**
   * Sanitize a relative path to prevent path traversal attacks.
   * Rejects absolute paths, removes leading ../, and throws on embedded ..
   */
  private sanitizeRelPath(p: string): string {
    // Normalize to forward slashes and remove any backslashes (Windows)
    const normalized = path.posix.normalize(p.replace(/\\/g, '/'));
    // Remove leading ../ sequences and leading /
    const stripped = normalized.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
    // Reject if still contains .. anywhere (could be embedded: foo/../../../etc)
    if (stripped.includes('..')) {
      throw new Error(`Unsafe filename detected: ${p}`);
    }
    // Reject empty paths
    if (!stripped || stripped === '.') {
      throw new Error(`Invalid filename: ${p}`);
    }
    return stripped;
  }

  /**
   * Safe path.join that ensures the result stays within baseDir.
   * Throws if the resulting path escapes the base directory.
   */
  private safeJoin(baseDir: string, ...pathsToJoin: string[]): string {
    const targetPath = path.normalize(path.join(baseDir, ...pathsToJoin));
    const base = path.normalize(baseDir + path.sep);
    if (!targetPath.startsWith(base)) {
      throw new Error(`Path traversal detected: ${targetPath} escapes ${baseDir}`);
    }
    return targetPath;
  }

  /**
   * Sanitize component type name to prevent path traversal and invalid filenames
   * Only allows letters, numbers, underscore. Must start with letter/underscore.
   */
  private toSafeTypeName(raw: unknown): string {
    const s = String(raw ?? '').trim();
    // Remove any characters that aren't alphanumeric or underscore
    const cleaned = s.replace(/[^A-Za-z0-9_]/g, '');
    if (!cleaned || !/^[A-Za-z_]/.test(cleaned)) {
      throw new Error(`Invalid component type: ${s}`);
    }
    return cleaned;
  }

  /**
   * Strip query strings and hash fragments from a route
   * Prevents invalid file paths like app/about?x=y/page.tsx
   */
  private cleanRoute(route: string): string {
    return route.split('?')[0]!.split('#')[0]!;
  }

  /**
   * Generate a cache key for a component based on its type and design system
   * This allows reusing generated components across builds with the same parameters
   */
  private getCacheKey(type: string, designSystem: DesignSystem): string {
    const signature = JSON.stringify({
      type,
      colors: designSystem.colors,
      typography: designSystem.typography,
      spacing: designSystem.spacing,
    });
    return crypto.createHash('sha256').update(signature).digest('hex').slice(0, 16);
  }

  /**
   * Get a cached component if available
   * Checks Redis first (distributed cache), falls back to in-memory
   */
  private async getCachedComponent(
    type: string,
    designSystem: DesignSystem
  ): Promise<GeneratedComponent | undefined> {
    const key = this.getCacheKey(type, designSystem);
    const redisKey = this.CACHE_KEY_PREFIX + key;

    // Check in-memory cache first (fastest)
    const memCached = this.cache.get(key);
    if (memCached) {
      this.cacheStats.hits++;
      this.cacheStats.memoryHits++;
      unifiedLogger.system('startup', 'info', 'Component cache hit (memory)', { type, key });
      return memCached;
    }

    // Check Redis cache (distributed)
    if (this.redisAvailable && this.redis) {
      try {
        const cached = await this.redis.get(redisKey);
        if (cached) {
          const component = JSON.parse(cached) as GeneratedComponent;
          // Populate in-memory cache for faster subsequent lookups
          this.cache.set(key, component);
          this.cacheStats.hits++;
          this.cacheStats.redisHits++;
          unifiedLogger.system('startup', 'info', 'Component cache hit (Redis)', { type, key });
          return component;
        }
      } catch (error) {
        unifiedLogger.system('startup', 'warn', 'Redis cache read failed', {
          error: (error as Error).message,
        });
      }
    }

    this.cacheStats.misses++;
    return undefined;
  }

  /**
   * Store a component in the cache (both Redis and in-memory)
   * Redis provides persistence and cross-worker sharing
   */
  private async cacheComponent(component: GeneratedComponent, designSystem: DesignSystem): Promise<void> {
    const key = this.getCacheKey(component.type, designSystem);
    const redisKey = this.CACHE_KEY_PREFIX + key;

    // Always cache in memory (fast access)
    this.cache.set(key, component);
    this.cacheStats.writes++;

    // Cache in Redis if available (persistence + sharing)
    if (this.redisAvailable && this.redis) {
      try {
        await this.redis.setex(
          redisKey,
          this.CACHE_TTL_SECONDS,
          JSON.stringify(component)
        );
        unifiedLogger.system('startup', 'info', 'Component cached (Redis + memory)', {
          type: component.type,
          key,
          ttl: this.CACHE_TTL_SECONDS,
        });
      } catch (error) {
        unifiedLogger.system('startup', 'warn', 'Redis cache write failed, using memory only', {
          error: (error as Error).message,
        });
      }
    } else {
      unifiedLogger.system('startup', 'info', 'Component cached (memory only)', {
        type: component.type,
        key,
      });
    }
  }

  /**
   * Get cache statistics for monitoring and optimization
   */
  getCacheStats(): {
    hits: number;
    misses: number;
    hitRate: string;
    redisHits: number;
    memoryHits: number;
    writes: number;
  } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? ((this.cacheStats.hits / total) * 100).toFixed(1) : '0.0';

    return {
      ...this.cacheStats,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * Clean up Redis connection when service is destroyed
   */
  async cleanup(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        unifiedLogger.system('startup', 'info', 'Redis connection closed');
      } catch (error) {
        unifiedLogger.system('startup', 'warn', 'Error closing Redis connection', {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Ensure dependencies are installed for a project (only once per project)
   * EXPERT FIX: Uses lock to prevent concurrent npm installs on same path
   */
  private async ensureDepsInstalled(projectPath: string): Promise<void> {
    if (this.depsInstalledForProject.has(projectPath)) {
      return; // Already installed
    }

    // Check if another task is already installing for this path
    const existingLock = this.installLocks.get(projectPath);
    if (existingLock) {
      return existingLock; // Wait for existing install to complete
    }

    // Create and store the install promise
    const installTask = (async () => {
      try {
        unifiedLogger.system('startup', 'info', 'Installing dependencies for TypeScript checking', {
          projectPath,
        });

        await execAsync('npm install --prefer-offline --no-audit --no-fund', {
          cwd: projectPath,
          timeout: 120000, // 2 minutes for npm install
        });
        this.depsInstalledForProject.add(projectPath);
        unifiedLogger.system('startup', 'info', 'Dependencies installed successfully');
      } catch (error) {
        unifiedLogger.system('startup', 'warn', 'Failed to install dependencies, TypeScript checks may fail', {
          error: (error as Error).message,
        });
      } finally {
        // Clean up lock after completion
        this.installLocks.delete(projectPath);
      }
    })();

    this.installLocks.set(projectPath, installTask);
    return installTask;
  }

  /**
   * Generate project with hierarchical two-pass approach (Expert-recommended)
   */
  async generateProjectEnhanced(
    plan: MigrationPlan,
    projectPath: string
  ): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];

    unifiedLogger.system('startup', 'info', 'Phase 5: Starting hierarchical component generation', {
      totalComponents: plan.componentLibrary.length,
      pages: plan.pages.length,
    });

    // PASS 1: Shared Foundation (layout + primitives)
    unifiedLogger.system('startup', 'info', 'Pass 1: Generating shared foundation');
    const sharedComponents = await this.generateSharedFoundation(plan, projectPath);
    results.push(...sharedComponents);

    // Build import specs from successful shared components (type + importPath, not just filename)
    const sharedComponentSpecs: ComponentImportSpec[] = sharedComponents
      .filter(r => r.success)
      .map(r => ({
        type: r.component.type,
        importPath: `@/components/${r.component.type}`,
        filename: r.component.filename,
      }));

    // PASS 2: Page Composition (uses shared components)
    unifiedLogger.system('startup', 'info', 'Pass 2: Generating page compositions', {
      availableShared: sharedComponentSpecs.length,
    });
    const pageResults = await this.generatePagesWithComposition(
      plan,
      projectPath,
      sharedComponentSpecs
    );
    results.push(...pageResults);

    const successRate = results.filter(r => r.success).length / results.length;
    const cacheStats = this.getCacheStats();

    unifiedLogger.system('startup', 'info', 'Component generation complete', {
      total: results.length,
      successful: results.filter(r => r.success).length,
      withRepairs: results.filter(r => r.attempts > 1).length,
      usedTemplates: results.filter(r => r.usedTemplate).length,
      successRate: `${(successRate * 100).toFixed(1)}%`,
      cacheHitRate: cacheStats.hitRate,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      redisHits: cacheStats.redisHits,
      memoryHits: cacheStats.memoryHits,
    });

    return results;
  }

  /**
   * PASS 1: Generate shared foundation (layout + primitives)
   * One API call for all shared components
   */
  private async generateSharedFoundation(
    plan: MigrationPlan,
    projectPath: string
  ): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];

    // Identify shared components from plan
    const sharedTypes = plan.componentLibrary.filter(type =>
      SHARED_PRIMITIVE_TYPES.includes(type) || SHARED_LAYOUT_TYPES.includes(type)
    );

    if (sharedTypes.length === 0) {
      unifiedLogger.system('startup', 'info', 'No shared components to generate');
      return results;
    }

    unifiedLogger.system('startup', 'info', 'Generating shared components', {
      types: sharedTypes,
      count: sharedTypes.length,
    });

    try {
      // Generate all shared components in one call (batch efficiency)
      const systemPrompt = this.buildSharedComponentsSystemPrompt();
      const userPrompt = this.buildSharedComponentsPrompt(sharedTypes, plan.designSystem);

      const result = await this.claudeService.execute<{ components: Array<{ type: string; code: string; imports?: string[] }> }>({
        systemPrompt,
        userPrompt,
        maxTokens: 16000, // Larger budget for batch
        outputFormat: 'json',
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'AI component generation failed');
      }

      // EXPERT FIX ROUND 15: Expect object format { "components": [...] }
      const components = result.data.components ?? [];
      if (!Array.isArray(components)) {
        throw new Error('Invalid components format: expected { "components": [...] }');
      }

      // Generate each component with compile-repair loop
      for (const componentData of components) {
        // EXPERT FIX ROUND 15: Sanitize type name (don't trust AI output)
        // This prevents path traversal and invalid filenames like "Button/evil"
        let safeType: string;
        try {
          safeType = this.toSafeTypeName(componentData.type);
        } catch {
          unifiedLogger.system('startup', 'warn', 'Invalid component type from Claude, skipping', {
            type: componentData.type,
          });
          continue;
        }

        // Skip if type is not one of the requested shared types
        if (!sharedTypes.includes(safeType)) {
          unifiedLogger.system('startup', 'warn', 'Unexpected component type from Claude, skipping', {
            type: safeType,
            expected: sharedTypes,
          });
          continue;
        }

        const component: GeneratedComponent = {
          filename: `${safeType}.tsx`,
          code: componentData.code,
          imports: componentData.imports || [],
          type: safeType,
        };

        const result = await this.generateWithRepair(
          component,
          projectPath,
          'components',
          plan.designSystem
        );
        results.push(result);
      }

    } catch (error) {
      unifiedLogger.system('startup', 'error', 'Shared component generation failed, using templates', {
        error: (error as Error).message,
      });

      // Fallback to templates
      for (const type of sharedTypes) {
        const template = await this.generateTemplateComponent(type, plan.designSystem);
        results.push({
          component: template,
          success: true,
          attempts: 1,
          usedTemplate: true,
        });
      }
    }

    return results;
  }

  /**
   * PASS 2: Generate page compositions
   * One API call per page (composes shared components)
   */
  private async generatePagesWithComposition(
    plan: MigrationPlan,
    projectPath: string,
    sharedComponents: ComponentImportSpec[]
  ): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];

    for (const page of plan.pages) {
      unifiedLogger.system('startup', 'info', 'Generating page', {
        route: page.targetRoute,
        components: page.components.length,
      });

      try {
        const systemPrompt = this.buildPageCompositionSystemPrompt();
        const userPrompt = this.buildPageCompositionPrompt(page, sharedComponents, plan.designSystem);

        const aiResult = await this.claudeService.execute<{ code: string; imports?: string[] }>({
          systemPrompt,
          userPrompt,
          maxTokens: 8000,
          outputFormat: 'json',
        });

        if (!aiResult.success || !aiResult.data) {
          throw new Error(aiResult.error || 'AI page generation failed');
        }

        const component: GeneratedComponent = {
          filename: this.routeToFilePath(page.targetRoute),
          code: aiResult.data.code,
          imports: aiResult.data.imports || [],
          type: 'page',
        };

        const generationResult = await this.generateWithRepair(
          component,
          projectPath,
          'app',
          plan.designSystem
        );
        results.push(generationResult);

      } catch (error) {
        unifiedLogger.system('startup', 'error', 'Page generation failed, using template', {
          route: page.targetRoute,
          error: (error as Error).message,
        });

        const template = this.generateTemplatePageComponent(page, plan.designSystem);
        results.push({
          component: template,
          success: true,
          attempts: 1,
          usedTemplate: true,
        });
      }
    }

    return results;
  }

  /**
   * Compile-Repair Loop (Expert Priority #1)
   * TypeScript errors → Claude fixes → max 2 attempts → template fallback
   * EXPERT FIX ROUND 15: Accept designSystem for consistent fallback templates
   */
  private async generateWithRepair(
    component: GeneratedComponent,
    projectPath: string,
    subdir: string,
    designSystem: DesignSystem,
    maxRepairs: number = 2
  ): Promise<GenerationResult> {
    let currentComponent = component;
    let attempts = 1;

    for (let attempt = 0; attempt <= maxRepairs; attempt++) {
      // Write file to disk with path traversal protection
      const safeFilename = this.sanitizeRelPath(currentComponent.filename);
      const filePath = this.safeJoin(projectPath, subdir, safeFilename);
      const fileDir = path.dirname(filePath);

      await fs.mkdir(fileDir, { recursive: true });
      await fs.writeFile(filePath, currentComponent.code, 'utf8');

      // Run TypeScript compiler check (checks entire project)
      const errors = await this.checkTypeScript(projectPath);

      if (errors.length === 0) {
        // Success!
        unifiedLogger.system('startup', 'info', 'Component generated successfully', {
          filename: currentComponent.filename,
          attempts,
        });

        return {
          component: currentComponent,
          success: true,
          attempts,
          usedTemplate: false,
        };
      }

      // Failed - check if errors are in this file
      // Use relative path suffix comparison to avoid false positives
      // e.g., "app/about/page.tsx" errors should NOT match "app/contact/page.tsx"
      // even though both have basename "page.tsx"
      const expectedRelPath = path.normalize(path.join(subdir, safeFilename));
      const relevantErrors = errors.filter(e => {
        // Normalize the error file path and check if it ends with our component path
        const normalizedErrorPath = path.normalize(e.file);
        return normalizedErrorPath.endsWith(expectedRelPath);
      });

      if (relevantErrors.length === 0) {
        // Errors elsewhere, not this component
        unifiedLogger.system('startup', 'info', 'Component OK, errors in other files', {
          filename: currentComponent.filename,
        });

        return {
          component: currentComponent,
          success: true,
          attempts,
          usedTemplate: false,
        };
      }

      if (attempt === maxRepairs) {
        // Max repairs exhausted
        unifiedLogger.system('startup', 'warn', 'Component generation failed after repairs, using template', {
          filename: currentComponent.filename,
          attempts: attempts,
          errors: relevantErrors.length,
        });

        // EXPERT FIX ROUND 15: Use actual design system, not hardcoded values
        const template = await this.generateTemplateComponent(currentComponent.type, designSystem);

        await fs.writeFile(filePath, template.code, 'utf8');

        return {
          component: template,
          success: false,
          attempts: attempts,
          errors: relevantErrors,
          usedTemplate: true,
        };
      }

      // Try to repair
      unifiedLogger.system('startup', 'info', 'Attempting repair', {
        filename: currentComponent.filename,
        attempt: attempt + 1,
        errors: relevantErrors.length,
      });

      try {
        currentComponent = await this.repairComponent(currentComponent, relevantErrors);
        attempts++;
      } catch (repairError) {
        unifiedLogger.system('startup', 'warn', 'Repair attempt failed', {
          error: (repairError as Error).message,
        });
        break;
      }
    }

    // Should not reach here, but fallback to template
    // EXPERT FIX ROUND 15: Use actual design system
    const template = await this.generateTemplateComponent(currentComponent.type, designSystem);

    return {
      component: template,
      success: false,
      attempts: attempts,
      usedTemplate: true,
    };
  }

  /**
   * Check TypeScript compilation for the entire project
   * Uses local tsc for faster execution (avoids npx overhead)
   * EXPERT FIX ROUND 15: Removed unused filePath parameter
   */
  private async checkTypeScript(projectPath: string): Promise<TypeScriptError[]> {
    // Ensure deps are installed (only runs once per project)
    await this.ensureDepsInstalled(projectPath);

    try {
      // Use local tsc directly instead of npx (faster)
      // EXPERT FIX: Windows uses .cmd extension
      const tscBin = process.platform === 'win32'
        ? '.\\node_modules\\.bin\\tsc.cmd'
        : './node_modules/.bin/tsc';
      const result = await execAsync(`${tscBin} --noEmit --pretty false`, {
        cwd: projectPath,
        timeout: 30000,
      });

      // No errors
      return [];

    } catch (error: any) {
      // Parse TypeScript errors from stderr/stdout (tsc outputs to stdout on error)
      const output = error.stdout || error.stderr || '';
      return this.parseTypeScriptErrors(output);
    }
  }

  /**
   * Parse TypeScript error output
   * Supports both common formats:
   * - Windows/pretty=false: filename(line,column): error TS####: message
   * - Unix/standard: filename:line:column - error TS####: message
   */
  private parseTypeScriptErrors(output: string): TypeScriptError[] {
    const errors: TypeScriptError[] = [];

    // Format 1: filename(line,column): error TS####: message (Windows/pretty=false)
    const windowsRegex = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;

    // Format 2: filename:line:column - error TS####: message (Unix/standard)
    const unixRegex = /^(.+?):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s+(.+)$/gm;

    // Try both formats
    let match;

    // Parse Windows format
    while ((match = windowsRegex.exec(output)) !== null) {
      const [, file, lineStr, colStr, code, message] = match;
      if (file && lineStr && colStr && code && message) {
        errors.push({
          file: file.trim(),
          line: parseInt(lineStr, 10),
          column: parseInt(colStr, 10),
          code,
          message: message.trim(),
        });
      }
    }

    // Parse Unix format (if Windows format didn't match anything)
    if (errors.length === 0) {
      while ((match = unixRegex.exec(output)) !== null) {
        const [, file, lineStr, colStr, code, message] = match;
        if (file && lineStr && colStr && code && message) {
          errors.push({
            file: file.trim(),
            line: parseInt(lineStr, 10),
            column: parseInt(colStr, 10),
            code,
            message: message.trim(),
          });
        }
      }
    }

    return errors;
  }

  /**
   * Repair component based on TypeScript errors
   * Uses UnifiedClaudeService (CLI-based) for consistent execution
   */
  private async repairComponent(
    component: GeneratedComponent,
    errors: TypeScriptError[]
  ): Promise<GeneratedComponent> {
    const systemPrompt = this.buildRepairSystemPrompt();
    const userPrompt = `
The following TypeScript component has compilation errors. Please fix them.

Filename: ${component.filename}

Code:
\`\`\`typescript
${component.code}
\`\`\`

TypeScript Errors:
${errors.map(e => `Line ${e.line}, Column ${e.column}: ${e.message} (${e.code})`).join('\n')}

Fix these errors and return the corrected component code. Maintain the same structure and functionality.

Return ONLY valid JSON in this format (no markdown):
{
  "filename": "${component.filename}",
  "code": "...",
  "imports": ["react", ...]
}
`;

    const result = await this.claudeService.execute<{ code: string; imports?: string[] }>({
      systemPrompt,
      userPrompt,
      maxTokens: 6000,
      outputFormat: 'json',
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Component repair failed');
    }

    return {
      filename: component.filename,
      code: result.data.code,
      imports: result.data.imports || component.imports,
      type: component.type,
    };
  }


  // =========================================================================
  // SYSTEM PROMPTS
  // =========================================================================

  private buildSharedComponentsSystemPrompt(): string {
    // EXPERT FIX ROUND 15: Standardize on object format { "components": [...] }
    return `You are an expert Next.js 15 and React 19 component generator.

Generate production-ready shared UI components with:
- Next.js 15 App Router compatibility
- TypeScript strict mode
- Tailwind CSS styling
- Responsive design (mobile-first: sm:, md:, lg:)
- Accessibility (ARIA labels, semantic HTML, keyboard navigation)
- Modern React patterns (hooks, proper typing)
- next/image for images, next/link for navigation

Return ONLY valid JSON in this format (no markdown):
{
  "components": [
    {
      "type": "Button",
      "code": "import React from 'react';\\n\\nexport default function Button...",
      "imports": ["react"]
    }
  ]
}

Each component should be reusable and well-typed.`;
  }

  private buildPageCompositionSystemPrompt(): string {
    return `You are an expert Next.js 15 page generator.

Generate production-ready Next.js 15 App Router pages with:
- TypeScript strict mode
- Import and use provided shared components from '@/components/...'
- Tailwind CSS styling
- Responsive design
- SEO metadata export
- Accessibility

Return JSON (no markdown):
{
  "code": "import type { Metadata } from 'next';\\n\\nexport const metadata: Metadata = ...\\n\\nexport default function Page() { ... }",
  "imports": ["next", "@/components/Button", ...]
}

The page should compose shared components, not redefine them.`;
  }

  private buildRepairSystemPrompt(): string {
    return `You are an expert TypeScript debugger.

Your task: Fix TypeScript compilation errors in React components.

Requirements:
- Fix ONLY the reported errors
- Maintain the same component structure
- Keep all existing functionality
- Use proper TypeScript types
- Return valid JSON (no markdown)

Be surgical - don't rewrite the entire component unless necessary.`;
  }

  // =========================================================================
  // USER PROMPTS
  // =========================================================================

  private buildSharedComponentsPrompt(types: string[], designSystem: DesignSystem): string {
    const primaryColor = designSystem.colors.primary || '#3b82f6';
    const secondaryColor = designSystem.colors.secondary || '#8b5cf6';
    const font = designSystem.typography.headingFont || 'Inter';

    return `Generate shared UI components for a Next.js 15 project.

Component Types to Generate:
${types.map(t => `- ${t}`).join('\n')}

Design System:
- Primary Color: ${primaryColor}
- Secondary Color: ${secondaryColor}
- Font Family: ${font}
- Spacing: ${designSystem.spacing}

Requirements:
1. Use TypeScript with proper prop types
2. Use Tailwind CSS classes (text-primary, bg-secondary, etc.)
3. Make components responsive (mobile-first)
4. Add ARIA labels for accessibility
5. Export as default function
6. Add JSDoc comments

Return ONLY valid JSON in this format (no markdown):
{
  "components": [
    { "type": "Button", "code": "...", "imports": ["react"] }
  ]
}`;
  }

  private buildPageCompositionPrompt(
    page: PagePlan,
    sharedComponents: ComponentImportSpec[],
    designSystem: DesignSystem
  ): string {
    const componentsUsed = page.components.map(c => c.type).join(', ');

    // Format shared components with proper import syntax for Claude
    const sharedComponentsList = sharedComponents.map(c =>
      `- ${c.type}: import ${c.type} from '${c.importPath}'`
    ).join('\n');

    return `Generate a Next.js 15 App Router page.

Page Details:
- Route: ${page.targetRoute}
- Title: ${page.title}
- Type: ${page.pageType}
- Components needed: ${componentsUsed}

Available Shared Components:
${sharedComponentsList || '(none available)'}

Design System:
- Primary Color: ${designSystem.colors.primary || '#3b82f6'}
- Secondary Color: ${designSystem.colors.secondary || '#8b5cf6'}

Requirements:
1. Export metadata for SEO (title, description)
2. Import and USE shared components using the exact import paths shown above
3. Use Tailwind CSS for styling
4. Make it responsive
5. Add semantic HTML

Return JSON with code (no markdown).`;
  }

  // =========================================================================
  // TEMPLATE FALLBACKS
  // =========================================================================

  private async generateTemplateComponent(type: string, designSystem: Partial<DesignSystem>): Promise<GeneratedComponent> {
    // Check cache first
    const fullDesignSystem: DesignSystem = {
      colors: designSystem.colors || { primary: '#3b82f6', secondary: '#8b5cf6' },
      typography: designSystem.typography || { headingFont: 'Inter', bodyFont: 'Inter', scale: 'normal' },
      spacing: designSystem.spacing || 'normal',
    };

    const cached = await this.getCachedComponent(type, fullDesignSystem);
    if (cached) {
      return cached;
    }

    const filename = `${type}.tsx`;

    const code = `import React from 'react';

interface ${type}Props {
  children?: React.ReactNode;
  className?: string;
}

/**
 * ${type} component (template fallback)
 */
export default function ${type}({ children, className = '' }: ${type}Props) {
  return (
    <div className={\`${type.toLowerCase()} \${className}\`}>
      {children || '${type}'}
    </div>
  );
}
`;

    const component: GeneratedComponent = {
      filename,
      code,
      imports: ['react'],
      type,
    };

    // Cache the component
    await this.cacheComponent(component, fullDesignSystem);

    return component;
  }

  private generateTemplatePageComponent(page: PagePlan, designSystem: DesignSystem): GeneratedComponent {
    const componentName = this.routeToComponentName(page.targetRoute);
    const filename = this.routeToFilePath(page.targetRoute);
    // Use tsString() to safely escape metadata for single-quoted TypeScript strings
    const metaTitle = tsString(page.seoMetadata.title || page.title);
    const metaDescription = tsString(page.seoMetadata.description || '');
    const pageTitle = tsString(page.title);
    const originalUrl = tsString(page.originalUrl);
    const componentTypes = page.components.map(c => c.type).join(', ');

    const code = `import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${metaTitle}',
  description: '${metaDescription}',
};

export default function ${componentName}() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">${pageTitle}</h1>
      <p className="text-gray-600">
        Migrated from: ${originalUrl}
      </p>
      {/* Components: ${componentTypes} */}
    </div>
  );
}
`;

    return {
      filename,
      code,
      imports: ['next'],
      type: 'page',
    };
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private routeToFilePath(route: string): string {
    // EXPERT FIX ROUND 15: Strip query/hash before converting to file path
    const cleaned = this.cleanRoute(route);
    if (cleaned === '/') {
      return 'page.tsx';
    }
    const segments = cleaned.replace(/^\//, '').replace(/\/$/, '');
    return `${segments}/page.tsx`;
  }

  private routeToComponentName(route: string): string {
    // EXPERT FIX ROUND 15: Strip query/hash before converting to component name
    const cleaned = this.cleanRoute(route);
    if (cleaned === '/') {
      return 'HomePage';
    }
    const parts = cleaned.split('/').filter(Boolean);
    // Handle hyphenated routes: /about-us → AboutUs, /my-blog-post → MyBlogPost
    const name = parts.map(part =>
      part.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join('')
    ).join('');
    return `${name}Page`;
  }
}
