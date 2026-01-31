/**
 * Migration Quality Gates Service - Phase 5 (Expert Priority #2)
 *
 * Sequential fail-fast quality gates for migration verification:
 * 1. TypeScript check (fast, blocking)
 * 2. Build verification (expensive, blocking)
 * 3. Accessibility audit (fast, advisory)
 * 4. SEO check (fast, advisory)
 *
 * Expert Insight: "Don't run expensive builds if TypeScript fails.
 * Sequential fail-fast saves minutes and dollars."
 *
 * Note: This is separate from qualityGatesService which handles Lighthouse audits.
 * This service is optimized for the verification queue workflow.
 */

import { unifiedLogger } from './unifiedLogger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { VerificationGate, VerificationResult } from '../queue/verificationQueue';

const execAsync = promisify(exec);

// =========================================================================
// ACCESSIBILITY & SEO CHECK TYPES
// =========================================================================

interface A11yIssue {
  type: string;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line?: number;
}

interface SEOIssue {
  type: string;
  severity: 'error' | 'warning';
  message: string;
  file: string;
}

export class MigrationQualityGatesService {
  /**
   * Run quality gates sequentially with fail-fast behavior
   * Stops at first blocking failure, continues through advisory gates
   */
  async runGates(
    projectPath: string,
    gates: VerificationGate[],
    skipOptional: boolean = false
  ): Promise<{
    success: boolean;
    results: VerificationResult[];
    failedGate?: VerificationGate | undefined;
  }> {
    const results: VerificationResult[] = [];
    let success = true;
    let failedGate: VerificationGate | undefined;

    unifiedLogger.system('startup', 'info', 'Starting quality gates', {
      gates,
      skipOptional,
      projectPath,
    });

    // Define gate execution order and blocking behavior
    const gateOrder: { gate: VerificationGate; blocking: boolean }[] = [
      { gate: 'typescript', blocking: true },
      { gate: 'build', blocking: true },
      { gate: 'accessibility', blocking: false },
      { gate: 'seo', blocking: false },
    ];

    for (const { gate, blocking } of gateOrder) {
      // Skip if not requested
      if (!gates.includes(gate)) {
        continue;
      }

      // Skip optional gates if requested
      if (skipOptional && !blocking) {
        results.push({
          gate,
          status: 'skip',
          duration: 0,
          metadata: { reason: 'skipOptional flag set' },
        });
        continue;
      }

      // Stop if a previous blocking gate failed (fail-fast)
      if (!success) {
        results.push({
          gate,
          status: 'skip',
          duration: 0,
          metadata: { reason: 'Previous blocking gate failed' },
        });
        continue;
      }

      const startTime = Date.now();
      const result = await this.runGate(gate, projectPath);
      const duration = Date.now() - startTime;

      results.push({ ...result, duration });

      // Check for blocking failures
      if (result.status === 'fail' && blocking) {
        success = false;
        failedGate = gate;
        unifiedLogger.system('startup', 'warn', 'Blocking gate failed, stopping verification', {
          gate,
          duration,
        });
        break; // Fail-fast: stop immediately on blocking failure
      }
    }

    unifiedLogger.system('startup', 'info', 'Quality gates complete', {
      success,
      totalGates: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      failed: results.filter(r => r.status === 'fail').length,
      skipped: results.filter(r => r.status === 'skip').length,
      failedGate,
    });

    return { success, results, failedGate };
  }

  /**
   * Execute a single quality gate
   */
  private async runGate(gate: VerificationGate, projectPath: string): Promise<VerificationResult> {
    try {
      switch (gate) {
        case 'typescript':
          return await this.runTypeScriptCheck(projectPath);
        case 'build':
          return await this.runBuildVerification(projectPath);
        case 'accessibility':
          return await this.runAccessibilityAudit(projectPath);
        case 'seo':
          return await this.runSEOCheck(projectPath);
        default:
          return {
            gate,
            status: 'fail',
            duration: 0,
            errors: [`Unknown gate: ${gate}`],
          };
      }
    } catch (error) {
      unifiedLogger.system('startup', 'error', 'Gate execution failed', {
        gate,
        error: (error as Error).message,
      });

      return {
        gate,
        status: 'fail',
        duration: 0,
        errors: [(error as Error).message],
      };
    }
  }

  // =========================================================================
  // GATE 1: TypeScript Check (Fast, Blocking)
  // =========================================================================

  private async runTypeScriptCheck(projectPath: string): Promise<VerificationResult> {
    unifiedLogger.system('startup', 'info', 'Running TypeScript check', { projectPath });

    try {
      // Use local tsc for faster execution
      const tscBin = process.platform === 'win32' ? '.\\node_modules\\.bin\\tsc.cmd' : './node_modules/.bin/tsc';

      const { stdout, stderr } = await execAsync(`${tscBin} --noEmit --pretty false`, {
        cwd: projectPath,
        timeout: 30000, // 30 seconds max
      });

      return {
        gate: 'typescript',
        status: 'pass',
        duration: 0,
        metadata: {
          output: stdout || stderr || 'No output',
        },
      };
    } catch (error: any) {
      // Parse TypeScript errors
      const output = error.stdout || error.stderr || '';
      const errors = this.parseTypeScriptErrors(output);

      return {
        gate: 'typescript',
        status: 'fail',
        duration: 0,
        errors: errors.length > 0 ? errors : [error.message],
        metadata: {
          errorCount: errors.length,
          rawOutput: output.slice(0, 1000), // First 1000 chars
        },
      };
    }
  }

  private parseTypeScriptErrors(output: string): string[] {
    const errors: string[] = [];

    // Match both Windows and Unix formats
    const windowsRegex = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
    const unixRegex = /^(.+?):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s+(.+)$/gm;

    let match;

    // Parse Windows format
    while ((match = windowsRegex.exec(output)) !== null) {
      const [, file, line, col, code, message] = match;
      if (file && line && col && code && message) {
        errors.push(`${path.basename(file)}(${line},${col}): ${code}: ${message.trim()}`);
      }
    }

    // Parse Unix format if no Windows matches
    if (errors.length === 0) {
      while ((match = unixRegex.exec(output)) !== null) {
        const [, file, line, col, code, message] = match;
        if (file && line && col && code && message) {
          errors.push(`${path.basename(file)}:${line}:${col} - ${code}: ${message.trim()}`);
        }
      }
    }

    return errors;
  }

  // =========================================================================
  // GATE 2: Build Verification (Expensive, Blocking)
  // =========================================================================

  private async runBuildVerification(projectPath: string): Promise<VerificationResult> {
    unifiedLogger.system('startup', 'info', 'Running build verification', { projectPath });

    try {
      // Run Next.js build with production optimizations
      const { stdout, stderr} = await execAsync('npm run build', {
        cwd: projectPath,
        timeout: 300000, // 5 minutes max
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for build output
      });

      // Check for build warnings (non-fatal)
      const warnings = this.parseBuildWarnings(stdout + stderr);

      return {
        gate: 'build',
        status: 'pass',
        duration: 0,
        warnings: warnings.length > 0 ? warnings : undefined,
        metadata: {
          warningCount: warnings.length,
          outputSize: (stdout + stderr).length,
        },
      };
    } catch (error: any) {
      const output = error.stdout || error.stderr || '';
      const buildErrors = this.parseBuildErrors(output);

      return {
        gate: 'build',
        status: 'fail',
        duration: 0,
        errors: buildErrors.length > 0 ? buildErrors : [error.message],
        metadata: {
          errorCount: buildErrors.length,
          rawOutput: output.slice(0, 2000), // First 2000 chars
        },
      };
    }
  }

  private parseBuildWarnings(output: string): string[] {
    const warnings: string[] = [];

    // Match Next.js warning patterns
    const warningRegex = /warn\s+-\s+(.+)/gi;
    let match;

    while ((match = warningRegex.exec(output)) !== null) {
      const [, warning] = match;
      if (warning) {
        warnings.push(warning.trim());
      }
    }

    return warnings.slice(0, 10); // Limit to 10 warnings
  }

  private parseBuildErrors(output: string): string[] {
    const errors: string[] = [];

    // Match Next.js error patterns
    const errorPatterns = [
      /error\s+-\s+(.+)/gi,
      /Error:\s+(.+)/gi,
      /Failed to compile/gi,
    ];

    for (const regex of errorPatterns) {
      let match;
      while ((match = regex.exec(output)) !== null) {
        const error = match[1] || match[0];
        if (error) {
          errors.push(error.trim());
        }
      }
    }

    return errors.slice(0, 10); // Limit to 10 errors
  }

  // =========================================================================
  // GATE 3: Accessibility Audit (Fast, Advisory)
  // Static analysis of generated code for common a11y issues
  // =========================================================================

  private async runAccessibilityAudit(projectPath: string): Promise<VerificationResult> {
    unifiedLogger.system('startup', 'info', 'Running accessibility audit', { projectPath });

    try {
      const issues: A11yIssue[] = [];

      // Find all TSX/JSX files
      const files = await this.findFiles(projectPath, ['.tsx', '.jsx']);

      for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        const relativePath = path.relative(projectPath, file);
        const lines = content.split('\n');

        // Check for images without alt attributes
        this.checkImagesWithoutAlt(content, relativePath, lines, issues);

        // Check for inputs without labels
        this.checkInputsWithoutLabels(content, relativePath, lines, issues);

        // Check for buttons without accessible text
        this.checkButtonsWithoutText(content, relativePath, lines, issues);

        // Check for links without href or text
        this.checkLinksAccessibility(content, relativePath, lines, issues);

        // Check heading hierarchy
        this.checkHeadingHierarchy(content, relativePath, issues);
      }

      // Determine status based on issues
      const errors = issues.filter(i => i.severity === 'error');
      const warnings = issues.filter(i => i.severity === 'warning');

      const status = errors.length > 5 ? 'fail' : 'pass'; // Advisory: only fail on major issues

      unifiedLogger.system('startup', 'info', 'Accessibility audit complete', {
        filesScanned: files.length,
        errors: errors.length,
        warnings: warnings.length,
      });

      return {
        gate: 'accessibility',
        status,
        duration: 0,
        errors: errors.length > 0 ? errors.slice(0, 10).map(e => `${e.file}: ${e.message}`) : undefined,
        warnings: warnings.length > 0 ? warnings.slice(0, 10).map(w => `${w.file}: ${w.message}`) : undefined,
        metadata: {
          filesScanned: files.length,
          totalIssues: issues.length,
          errorCount: errors.length,
          warningCount: warnings.length,
          issueTypes: this.summarizeIssueTypes(issues),
        },
      };
    } catch (error) {
      unifiedLogger.system('startup', 'error', 'Accessibility audit failed', {
        error: (error as Error).message,
      });
      return {
        gate: 'accessibility',
        status: 'fail',
        duration: 0,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Check for <img> tags without alt attribute
   */
  private checkImagesWithoutAlt(
    content: string,
    file: string,
    lines: string[],
    issues: A11yIssue[]
  ): void {
    // Match <img or <Image (Next.js) tags
    const imgRegex = /<(?:img|Image)\s+[^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(content)) !== null) {
      const tag = match[0];
      // Check if alt attribute exists (including empty alt="" which is valid for decorative images)
      if (!/\balt\s*=/i.test(tag)) {
        const line = this.getLineNumber(content, match.index, lines);
        issues.push({
          type: 'missing-alt',
          severity: 'error',
          message: 'Image missing alt attribute',
          file,
          line,
        });
      }
    }
  }

  /**
   * Check for inputs without associated labels or aria-label
   */
  private checkInputsWithoutLabels(
    content: string,
    file: string,
    lines: string[],
    issues: A11yIssue[]
  ): void {
    // Match <input, <select, <textarea tags (excluding hidden, submit, button types)
    const inputRegex = /<(?:input|select|textarea)\s+[^>]*>/gi;
    let match;

    while ((match = inputRegex.exec(content)) !== null) {
      const tag = match[0];

      // Skip hidden inputs, submit buttons, etc.
      if (/type\s*=\s*["'](?:hidden|submit|button|reset|image)["']/i.test(tag)) {
        continue;
      }

      // Check for aria-label, aria-labelledby, or id (for external label)
      const hasAriaLabel = /aria-label(?:ledby)?\s*=/i.test(tag);
      const hasId = /\bid\s*=/i.test(tag);
      const hasPlaceholder = /placeholder\s*=/i.test(tag); // Not ideal but sometimes acceptable

      if (!hasAriaLabel && !hasId) {
        const line = this.getLineNumber(content, match.index, lines);
        issues.push({
          type: 'input-missing-label',
          severity: hasPlaceholder ? 'warning' : 'error',
          message: 'Form input missing label or aria-label',
          file,
          line,
        });
      }
    }
  }

  /**
   * Check for buttons without accessible text
   */
  private checkButtonsWithoutText(
    content: string,
    file: string,
    lines: string[],
    issues: A11yIssue[]
  ): void {
    // Match button elements - simplified check for empty or icon-only buttons
    const buttonRegex = /<button\s+[^>]*>\s*(?:<[^>]+\/>\s*)?<\/button>/gi;
    let match;

    while ((match = buttonRegex.exec(content)) !== null) {
      const tag = match[0];

      // Check if has aria-label
      if (!/aria-label\s*=/i.test(tag)) {
        const line = this.getLineNumber(content, match.index, lines);
        issues.push({
          type: 'button-no-text',
          severity: 'warning',
          message: 'Button may be missing accessible text (icon-only button without aria-label)',
          file,
          line,
        });
      }
    }
  }

  /**
   * Check links for accessibility
   */
  private checkLinksAccessibility(
    content: string,
    file: string,
    lines: string[],
    issues: A11yIssue[]
  ): void {
    // Match <a> or <Link> tags
    const linkRegex = /<(?:a|Link)\s+[^>]*>/gi;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const tag = match[0];

      // Check for href="#" or href="" (potential issue)
      if (/href\s*=\s*["'](?:#|)["']/i.test(tag)) {
        const line = this.getLineNumber(content, match.index, lines);
        issues.push({
          type: 'link-empty-href',
          severity: 'warning',
          message: 'Link has empty or "#" href - may need button instead',
          file,
          line,
        });
      }
    }
  }

  /**
   * Check heading hierarchy
   */
  private checkHeadingHierarchy(
    content: string,
    file: string,
    issues: A11yIssue[]
  ): void {
    // Only check page files (should have h1)
    if (!file.includes('page.tsx') && !file.includes('page.jsx')) {
      return;
    }

    // Check for h1 presence
    if (!/<h1[\s>]/i.test(content)) {
      issues.push({
        type: 'missing-h1',
        severity: 'warning',
        message: 'Page may be missing an h1 heading',
        file,
      });
    }

    // Check for heading level skips (e.g., h1 -> h3 without h2)
    const headingLevels: number[] = [];
    const headingRegex = /<h([1-6])[\s>]/gi;
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      headingLevels.push(parseInt(match[1]!, 10));
    }

    for (let i = 1; i < headingLevels.length; i++) {
      const current = headingLevels[i]!;
      const previous = headingLevels[i - 1]!;
      if (current > previous + 1) {
        issues.push({
          type: 'heading-skip',
          severity: 'warning',
          message: `Heading level skipped: h${previous} -> h${current}`,
          file,
        });
        break; // Only report first skip per file
      }
    }
  }

  // =========================================================================
  // GATE 4: SEO Check (Fast, Advisory)
  // Static analysis of generated pages for SEO best practices
  // =========================================================================

  private async runSEOCheck(projectPath: string): Promise<VerificationResult> {
    unifiedLogger.system('startup', 'info', 'Running SEO check', { projectPath });

    try {
      const issues: SEOIssue[] = [];
      const appDir = path.join(projectPath, 'app');

      // Find all page files
      const pageFiles = await this.findFiles(appDir, ['page.tsx', 'page.jsx']);

      // Check root layout for default metadata
      const layoutFile = path.join(appDir, 'layout.tsx');
      let hasRootMetadata = false;

      try {
        const layoutContent = await fs.readFile(layoutFile, 'utf8');
        hasRootMetadata = this.checkMetadataExport(layoutContent);

        // Check for viewport meta
        if (!this.hasViewportConfig(layoutContent)) {
          issues.push({
            type: 'missing-viewport',
            severity: 'warning',
            message: 'Root layout missing viewport configuration',
            file: 'app/layout.tsx',
          });
        }
      } catch {
        issues.push({
          type: 'missing-layout',
          severity: 'error',
          message: 'Root layout.tsx not found',
          file: 'app/layout.tsx',
        });
      }

      // Check each page for SEO essentials
      for (const pageFile of pageFiles) {
        const content = await fs.readFile(pageFile, 'utf8');
        const relativePath = path.relative(projectPath, pageFile);

        // Check for page-specific metadata
        const hasMetadata = this.checkMetadataExport(content);
        const hasGenerateMetadata = this.checkGenerateMetadata(content);

        if (!hasMetadata && !hasGenerateMetadata && !hasRootMetadata) {
          issues.push({
            type: 'missing-metadata',
            severity: 'error',
            message: 'Page missing metadata export (title, description)',
            file: relativePath,
          });
        }

        // Check for h1 (important for SEO)
        if (!/<h1[\s>]/i.test(content)) {
          issues.push({
            type: 'missing-h1',
            severity: 'warning',
            message: 'Page missing h1 heading (important for SEO)',
            file: relativePath,
          });
        }

        // Check for semantic structure
        this.checkSemanticStructure(content, relativePath, issues);
      }

      // Check for sitemap
      const hasSitemap = await this.fileExists(path.join(appDir, 'sitemap.ts')) ||
                         await this.fileExists(path.join(appDir, 'sitemap.xml')) ||
                         await this.fileExists(path.join(projectPath, 'public', 'sitemap.xml'));

      if (!hasSitemap) {
        issues.push({
          type: 'missing-sitemap',
          severity: 'warning',
          message: 'No sitemap found (recommended for SEO)',
          file: 'app/sitemap.ts',
        });
      }

      // Check for robots.txt
      const hasRobots = await this.fileExists(path.join(appDir, 'robots.ts')) ||
                        await this.fileExists(path.join(projectPath, 'public', 'robots.txt'));

      if (!hasRobots) {
        issues.push({
          type: 'missing-robots',
          severity: 'warning',
          message: 'No robots.txt found (recommended for SEO)',
          file: 'public/robots.txt',
        });
      }

      // Determine status
      const errors = issues.filter(i => i.severity === 'error');
      const warnings = issues.filter(i => i.severity === 'warning');

      // Advisory: only fail on critical issues (no metadata on any page)
      const status = errors.length > pageFiles.length / 2 ? 'fail' : 'pass';

      unifiedLogger.system('startup', 'info', 'SEO check complete', {
        pagesScanned: pageFiles.length,
        errors: errors.length,
        warnings: warnings.length,
      });

      return {
        gate: 'seo',
        status,
        duration: 0,
        errors: errors.length > 0 ? errors.slice(0, 10).map(e => `${e.file}: ${e.message}`) : undefined,
        warnings: warnings.length > 0 ? warnings.slice(0, 10).map(w => `${w.file}: ${w.message}`) : undefined,
        metadata: {
          pagesScanned: pageFiles.length,
          hasRootMetadata,
          hasSitemap,
          hasRobots,
          totalIssues: issues.length,
          errorCount: errors.length,
          warningCount: warnings.length,
          issueTypes: this.summarizeSEOIssueTypes(issues),
        },
      };
    } catch (error) {
      unifiedLogger.system('startup', 'error', 'SEO check failed', {
        error: (error as Error).message,
      });
      return {
        gate: 'seo',
        status: 'fail',
        duration: 0,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Check if file has metadata export
   */
  private checkMetadataExport(content: string): boolean {
    // Check for: export const metadata = { ... }
    return /export\s+const\s+metadata\s*[=:]/i.test(content);
  }

  /**
   * Check if file has generateMetadata function
   */
  private checkGenerateMetadata(content: string): boolean {
    // Check for: export async function generateMetadata or export function generateMetadata
    return /export\s+(?:async\s+)?function\s+generateMetadata/i.test(content);
  }

  /**
   * Check for viewport configuration
   */
  private hasViewportConfig(content: string): boolean {
    // Check for viewport in metadata or separate viewport export
    return /viewport\s*[=:]/i.test(content) || /export\s+const\s+viewport/i.test(content);
  }

  /**
   * Check for semantic HTML structure
   */
  private checkSemanticStructure(content: string, file: string, issues: SEOIssue[]): void {
    // Check for semantic elements
    const hasMain = /<main[\s>]/i.test(content);
    const hasArticle = /<article[\s>]/i.test(content);
    const hasSection = /<section[\s>]/i.test(content);
    const hasNav = /<nav[\s>]/i.test(content);

    // At least one semantic element is good
    if (!hasMain && !hasArticle && !hasSection) {
      issues.push({
        type: 'no-semantic-html',
        severity: 'warning',
        message: 'Page lacks semantic HTML elements (main, article, section)',
        file,
      });
    }
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Find all files with given extensions in directory
   */
  private async findFiles(dir: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
            const subFiles = await this.findFiles(fullPath, extensions);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          // Check if file matches any extension
          if (extensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Directory might not exist
    }

    return files;
  }

  /**
   * Get line number from character index
   */
  private getLineNumber(content: string, index: number, lines: string[]): number {
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      charCount += lines[i]!.length + 1; // +1 for newline
      if (charCount > index) {
        return i + 1;
      }
    }
    return lines.length;
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Summarize a11y issue types for metadata
   */
  private summarizeIssueTypes(issues: A11yIssue[]): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const issue of issues) {
      summary[issue.type] = (summary[issue.type] || 0) + 1;
    }
    return summary;
  }

  /**
   * Summarize SEO issue types for metadata
   */
  private summarizeSEOIssueTypes(issues: SEOIssue[]): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const issue of issues) {
      summary[issue.type] = (summary[issue.type] || 0) + 1;
    }
    return summary;
  }
}
