import { unifiedLogger } from './unifiedLogger';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Builder Compatibility Service
 * Pre-deploy validation for builder editing compatibility
 * Implements strict linter rules and auto-transformation for optimal builder experience
 */

export interface Component {
  path: string;
  content: string;
  type: 'component' | 'page' | 'layout' | 'config';
  framework: 'react' | 'next' | 'vue' | 'svelte';
}

export interface CompatibilityViolation {
  type: 'dangerouslySetInnerHTML' | 'tailwind_overflow' | 'ssr_window_access' | 'uncontrolled_script' | 'use_client_spam' | 'dynamic_import_violation' | 'img_tag_violation';
  file: string;
  line: number;
  column?: number;
  description: string;
  severity: 'error' | 'warn' | 'info';
  autoFixable: boolean;
  suggestion?: string;
}

export interface CompatibilityReport {
  passed: boolean;
  score: number; // 0-100 compatibility score
  violations: CompatibilityViolation[];
  recommendations: string[];
  autoFixCount: number;
  criticalIssues: number;
  summary: {
    totalFiles: number;
    filesWithIssues: number;
    mostCommonIssue: string;
    builderReadiness: 'ready' | 'needs_fixes' | 'major_issues';
  };
}

export interface ValidationRule {
  name: string;
  description: string;
  pattern: RegExp;
  severity: 'error' | 'warn' | 'info';
  autoFixable: boolean;
  category: 'security' | 'performance' | 'builder' | 'accessibility';
}

export class BuilderCompatibilityService {
  private validationRules: ValidationRule[] = [
    {
      name: 'dangerouslySetInnerHTML',
      description: 'dangerouslySetInnerHTML should only be used in LegacyBlock components',
      pattern: /dangerouslySetInnerHTML\s*=/g,
      severity: 'error',
      autoFixable: false,
      category: 'security'
    },
    {
      name: 'tailwind_class_length',
      description: 'Tailwind className should be less than 256 characters',
      pattern: /className\s*=\s*["'`]([^"'`]{256,})["'`]/g,
      severity: 'warn',
      autoFixable: true,
      category: 'builder'
    },
    {
      name: 'ssr_window_access',
      description: 'Direct window access during SSR can cause hydration issues',
      pattern: /(?<!\/\/.*)(?<!['"]\s*)window\./g,
      severity: 'error',
      autoFixable: true,
      category: 'performance'
    },
    {
      name: 'uncontrolled_script',
      description: 'Script tags should use proper strategy attribute',
      pattern: /<script(?![^>]*strategy\s*=)/gi,
      severity: 'warn',
      autoFixable: true,
      category: 'performance'
    },
    {
      name: 'use_client_spam',
      description: 'use client directive should be limited to components that need it',
      pattern: /['"]use client['"];?\s*$/gm,
      severity: 'warn',
      autoFixable: false,
      category: 'builder'
    },
    {
      name: 'dynamic_require',
      description: 'Dynamic require/fs operations not allowed in app router',
      pattern: /(require\([^)]*\$|import\([^)]*\$|require\.resolve\(|fs\.)/g,
      severity: 'error',
      autoFixable: false,
      category: 'security'
    },
    {
      name: 'img_tag_usage',
      description: 'Use next/image instead of img tags for better optimization',
      pattern: /<img(?![^>]*next\/image)/gi,
      severity: 'info',
      autoFixable: true,
      category: 'performance'
    }
  ];

  /**
   * Pre-deploy linter pass with strict validation
   */
  async validateBuilderCompatibility(
    components: Component[]
  ): Promise<CompatibilityReport> {
    const violations: CompatibilityViolation[] = [];
    const filesWithIssues = new Set<string>();
    const violationCounts = new Map<string, number>();
    let autoFixCount = 0;

    try {
      for (const component of components) {
        const componentViolations = await this.validateComponent(component);
        violations.push(...componentViolations);

        if (componentViolations.length > 0) {
          filesWithIssues.add(component.path);
        }

        // Track violation types for analytics
        componentViolations.forEach(violation => {
          violationCounts.set(violation.type, (violationCounts.get(violation.type) || 0) + 1);
          if (violation.autoFixable) autoFixCount++;
        });
      }

      const criticalIssues = violations.filter(v => v.severity === 'error').length;
      const score = this.calculateCompatibilityScore(violations, components.length);
      const mostCommonIssue = this.getMostCommonIssue(violationCounts);
      const builderReadiness = this.assessBuilderReadiness(score, criticalIssues);

      const report: CompatibilityReport = {
        passed: criticalIssues === 0,
        score,
        violations,
        recommendations: this.generateRecommendations(violations),
        autoFixCount,
        criticalIssues,
        summary: {
          totalFiles: components.length,
          filesWithIssues: filesWithIssues.size,
          mostCommonIssue,
          builderReadiness
        }
      };

      unifiedLogger.system('startup', 'info', 'Builder compatibility validation completed', {
        totalFiles: components.length,
        violations: violations.length,
        criticalIssues,
        score,
        builderReadiness
      });

      return report;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Builder compatibility validation failed', {
        error: (error as Error).message,
        componentCount: components.length
      });

      throw new Error(`Compatibility validation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Transform components for optimal builder editing
   */
  async optimizeForBuilder(components: Component[]): Promise<Component[]> {
    const optimizedComponents: Component[] = [];

    try {
      for (const component of components) {
        const optimized = await this.optimizeComponent(component);
        optimizedComponents.push(optimized);
      }

      unifiedLogger.system('startup', 'info', 'Components optimized for builder', {
        totalComponents: components.length,
        optimizedComponents: optimizedComponents.length
      });

      return optimizedComponents;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Component optimization failed', {
        error: (error as Error).message
      });

      throw error;
    }
  }

  /**
   * Auto-transform DOM mutation scripts to islands
   */
  async createBuilderIslands(components: Component[]): Promise<Component[]> {
    const islandComponents: Component[] = [];

    try {
      for (const component of components) {
        const islands = await this.extractDOMInteractions(component);
        islandComponents.push(...islands);
      }

      unifiedLogger.system('startup', 'info', 'Builder islands created', {
        originalComponents: components.length,
        islandComponents: islandComponents.length
      });

      return islandComponents;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Builder island creation failed', {
        error: (error as Error).message
      });

      throw error;
    }
  }

  /**
   * Scrub HAR data for security (remove sensitive headers/tokens)
   */
  async scrubHARData(harData: any): Promise<any> {
    try {
      const sensitiveHeaders = [
        'authorization',
        'cookie',
        'set-cookie',
        'x-api-key',
        'x-auth-token',
        'x-access-token',
        'bearer',
        'basic'
      ];

      const sensitivePatterns = [
        /x-.*token.*/i,
        /.*-secret.*/i,
        /.*-key.*/i
      ];

      const scrubbed = JSON.parse(JSON.stringify(harData));

      if (scrubbed.log && scrubbed.log.entries) {
        scrubbed.log.entries.forEach((entry: any) => {
          // Scrub request headers
          if (entry.request && entry.request.headers) {
            entry.request.headers = entry.request.headers.filter((header: any) => {
              const headerName = header.name.toLowerCase();
              return !sensitiveHeaders.includes(headerName) &&
                     !sensitivePatterns.some(pattern => pattern.test(headerName));
            });
          }

          // Scrub response headers
          if (entry.response && entry.response.headers) {
            entry.response.headers = entry.response.headers.filter((header: any) => {
              const headerName = header.name.toLowerCase();
              return !sensitiveHeaders.includes(headerName) &&
                     !sensitivePatterns.some(pattern => pattern.test(headerName));
            });
          }

          // Remove request body if it contains sensitive data
          if (entry.request && entry.request.postData) {
            entry.request.postData = { text: '[REDACTED]', mimeType: 'application/octet-stream' };
          }
        });
      }

      unifiedLogger.system('startup', 'info', 'HAR data scrubbed for security', {
        originalEntries: harData.log?.entries?.length || 0,
        scrubbedEntries: scrubbed.log?.entries?.length || 0
      });

      return scrubbed;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'HAR scrubbing failed', {
        error: (error as Error).message
      });

      throw error;
    }
  }

  // =====================================================
  // PRIVATE HELPER METHODS
  // =====================================================

  private async validateComponent(component: Component): Promise<CompatibilityViolation[]> {
    const violations: CompatibilityViolation[] = [];
    const lines = component.content.split('\n');

    for (const rule of this.validationRules) {
      let match;
      while ((match = rule.pattern.exec(component.content)) !== null) {
        const lineNumber = this.getLineNumber(component.content, match.index);
        const column = this.getColumnNumber(component.content, match.index);

        // Special handling for different violation types
        let description = rule.description;
        let autoFixable = rule.autoFixable;

        if (rule.name === 'dangerouslySetInnerHTML') {
          // Check if it's in a LegacyBlock component
          if (component.path.includes('LegacyBlock') || lines[lineNumber - 1]?.includes('LegacyBlock')) {
            continue; // Skip if in LegacyBlock
          }
        }

        if (rule.name === 'tailwind_class_length') {
          const classContent = match[1] ?? '';
          description = `Tailwind className too long (${classContent.length} chars, max 256)`;
        }

        violations.push({
          type: rule.name as CompatibilityViolation['type'],
          file: component.path,
          line: lineNumber,
          column,
          description,
          severity: rule.severity,
          autoFixable,
          suggestion: this.generateSuggestion(rule.name, match[0])
        });
      }

      // Reset regex lastIndex for global regexes
      rule.pattern.lastIndex = 0;
    }

    return violations;
  }

  private async optimizeComponent(component: Component): Promise<Component> {
    let optimizedContent = component.content;

    try {
      // Auto-fix window access issues
      optimizedContent = this.fixWindowAccess(optimizedContent);

      // Auto-fix script tags
      optimizedContent = this.fixScriptTags(optimizedContent);

      // Auto-fix img tags to Next.js Image
      optimizedContent = this.fixImageTags(optimizedContent);

      // Break up long Tailwind classes
      optimizedContent = this.optimizeTailwindClasses(optimizedContent);

      return {
        ...component,
        content: optimizedContent
      };

    } catch (error) {
      unifiedLogger.system('health_check', 'warn', 'Component optimization failed', {
        componentPath: component.path,
        error: (error as Error).message
      });

      return component; // Return original if optimization fails
    }
  }

  private async extractDOMInteractions(component: Component): Promise<Component[]> {
    const islands: Component[] = [];
    const domInteractionPatterns = [
      /document\.querySelector/g,
      /document\.getElementById/g,
      /element\.addEventListener/g,
      /window\.addEventListener/g
    ];

    let hasDOMInteractions = false;
    for (const pattern of domInteractionPatterns) {
      if (pattern.test(component.content)) {
        hasDOMInteractions = true;
        break;
      }
    }

    if (hasDOMInteractions) {
      // Create an island component wrapper
      const islandComponent: Component = {
        path: component.path.replace(/\.(tsx?|jsx?)$/, '.island.$1'),
        content: this.wrapInIsland(component.content),
        type: 'component',
        framework: component.framework
      };

      islands.push(islandComponent);
    }

    return islands;
  }

  private wrapInIsland(content: string): string {
    return `/* @builder-island */
'use client';

import { useEffect } from 'react';

export default function BuilderIsland() {
  useEffect(() => {
    // DOM interactions moved to client-side effect
    ${this.extractDOMCode(content)}
  }, []);

  return (
    <div data-island="true">
      {/* Original component content with DOM interactions removed */}
    </div>
  );
}`;
  }

  private extractDOMCode(content: string): string {
    // Extract DOM manipulation code
    const domCodeLines = content
      .split('\n')
      .filter(line =>
        line.includes('document.') ||
        line.includes('window.') ||
        line.includes('addEventListener')
      )
      .map(line => `    ${line.trim()}`)
      .join('\n');

    return domCodeLines || '    // No DOM interactions found';
  }

  private fixWindowAccess(content: string): string {
    // Wrap window access in typeof check
    return content.replace(
      /(?<!\/\/.*)(?<!['"]\s*)window\./g,
      'typeof window !== "undefined" && window.'
    );
  }

  private fixScriptTags(content: string): string {
    // Add strategy attribute to script tags
    return content.replace(
      /<script(?![^>]*strategy\s*=)([^>]*)>/gi,
      '<script$1 strategy="afterInteractive">'
    );
  }

  private fixImageTags(content: string): string {
    // Replace img tags with Next.js Image component
    let fixed = content.replace(
      /<img([^>]*)>/gi,
      (match, attributes) => {
        // Extract src and alt attributes
        const srcMatch = attributes.match(/src\s*=\s*["']([^"']+)["']/);
        const altMatch = attributes.match(/alt\s*=\s*["']([^"']+)["']/);

        const src = srcMatch ? srcMatch[1] : '';
        const alt = altMatch ? altMatch[1] : '';

        return `<Image src="${src}" alt="${alt}" width={800} height={600} />`;
      }
    );

    // Add Image import if not present
    if (fixed !== content && !fixed.includes('import Image from')) {
      fixed = `import Image from 'next/image';\n${fixed}`;
    }

    return fixed;
  }

  private optimizeTailwindClasses(content: string): string {
    return content.replace(
      /className\s*=\s*["'`]([^"'`]{200,})["'`]/g,
      (match, classes) => {
        // Break long class strings into multiple lines
        const classArray = classes.trim().split(/\s+/);
        if (classArray.length > 10) {
          const grouped = this.groupTailwindClasses(classArray);
          return `className={[\n  ${grouped.map(group => `"${group}"`).join(',\n  ')}\n].join(' ')}`;
        }
        return match;
      }
    );
  }

  private groupTailwindClasses(classes: string[]): string[] {
    // Use explicit object literal instead of Record for type safety with noUncheckedIndexedAccess
    const groups = {
      layout: [] as string[],
      spacing: [] as string[],
      colors: [] as string[],
      typography: [] as string[],
      effects: [] as string[],
      responsive: [] as string[],
      other: [] as string[]
    };

    classes.forEach(cls => {
      if (cls.match(/^(flex|grid|block|inline|hidden)/)) groups.layout.push(cls);
      else if (cls.match(/^[mp][trblxy]?-/)) groups.spacing.push(cls);
      else if (cls.match(/^(bg-|text-|border-)/)) groups.colors.push(cls);
      else if (cls.match(/^(text-|font-|leading-|tracking-)/)) groups.typography.push(cls);
      else if (cls.match(/^(shadow|rounded|opacity)/)) groups.effects.push(cls);
      else if (cls.match(/^(sm:|md:|lg:|xl:)/)) groups.responsive.push(cls);
      else groups.other.push(cls);
    });

    return Object.values(groups)
      .filter(group => group.length > 0)
      .map(group => group.join(' '));
  }

  private calculateCompatibilityScore(violations: CompatibilityViolation[], totalFiles: number): number {
    if (totalFiles === 0) return 100;

    const weights = { error: 10, warning: 5, warn: 5, info: 1 };
    const totalPenalty = violations.reduce((sum, v) => sum + (weights as any)[v.severity] || 1, 0);
    const maxPossiblePenalty = totalFiles * 50; // Arbitrary max penalty per file

    return Math.max(0, Math.round(100 - (totalPenalty / maxPossiblePenalty) * 100));
  }

  private getMostCommonIssue(violationCounts: Map<string, number>): string {
    if (violationCounts.size === 0) return 'none';

    let maxCount = 0;
    let mostCommon = 'none';

    violationCounts.forEach((count, type) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = type;
      }
    });

    return mostCommon;
  }

  private assessBuilderReadiness(score: number, criticalIssues: number): 'ready' | 'needs_fixes' | 'major_issues' {
    if (criticalIssues > 0) return 'major_issues';
    if (score < 70) return 'needs_fixes';
    return 'ready';
  }

  private generateRecommendations(violations: CompatibilityViolation[]): string[] {
    const recommendations: string[] = [];

    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warn').length;
    const autoFixCount = violations.filter(v => v.autoFixable).length;

    if (errorCount > 0) {
      recommendations.push(`Fix ${errorCount} critical error(s) before deploying`);
    }

    if (warningCount > 0) {
      recommendations.push(`Address ${warningCount} warning(s) for better builder compatibility`);
    }

    if (autoFixCount > 0) {
      recommendations.push(`${autoFixCount} issue(s) can be automatically fixed`);
    }

    if (violations.some(v => v.type === 'dangerouslySetInnerHTML')) {
      recommendations.push('Consider wrapping HTML content in LegacyBlock components');
    }

    if (violations.some(v => v.type === 'img_tag_violation')) {
      recommendations.push('Replace img tags with Next.js Image component for better optimization');
    }

    return recommendations;
  }

  private generateSuggestion(ruleName: string, violatingCode: string): string {
    const suggestions: Record<string, string> = {
      'dangerouslySetInnerHTML': 'Wrap in LegacyBlock component or sanitize HTML content',
      'tailwind_class_length': 'Break long class strings into grouped arrays',
      'ssr_window_access': 'Add typeof window !== "undefined" check',
      'uncontrolled_script': 'Add strategy="afterInteractive" attribute',
      'img_tag_violation': 'Replace with <Image> from next/image',
      'dynamic_require': 'Use static imports or move to server-side',
      'use_client_spam': 'Only use "use client" on components with client-side interactions'
    };

    return suggestions[ruleName] || 'See documentation for best practices';
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private getColumnNumber(content: string, index: number): number {
    const lines = content.substring(0, index).split('\n');
    const lastLine = lines.at(-1) ?? '';
    return lastLine.length + 1;
  }
}

// Export singleton instance
export const builderCompatibilityService = new BuilderCompatibilityService();