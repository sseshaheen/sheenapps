/**
 * Topology Leak Scanner
 *
 * Post-generation scan to detect internal topology leaks in generated code.
 * Prevents browser code from containing worker URLs or internal endpoints.
 *
 * @see EASY_MODE_SDK_PLAN.md - Post-Generation Topology Scan section
 */

// =============================================================================
// BANNED PATTERNS
// =============================================================================

/**
 * Patterns that should never appear in client-facing code.
 * These indicate internal topology leaking to browser bundles.
 */
export const TOPOLOGY_LEAK_PATTERNS: Array<{
  pattern: RegExp;
  description: string;
  severity: 'error' | 'warning';
}> = [
  {
    pattern: /WORKER_BASE_URL/,
    description: 'Worker URL environment variable',
    severity: 'error',
  },
  {
    pattern: /NEXT_PUBLIC_.*WORKER/i,
    description: 'Public worker URL variable',
    severity: 'error',
  },
  {
    pattern: /sheenapps-claude-worker/,
    description: 'Worker package name reference',
    severity: 'error',
  },
  {
    pattern: /localhost:3001/,
    description: 'Common worker dev port',
    severity: 'warning',
  },
  {
    pattern: /localhost:8081/,
    description: 'Worker dev port',
    severity: 'warning',
  },
  {
    pattern: /\/v1\/inhouse\//,
    description: 'Internal worker API path',
    severity: 'error',
  },
  {
    pattern: /x-sheen-claims/i,
    description: 'Internal HMAC header',
    severity: 'error',
  },
  {
    pattern: /x-sheen-signature/i,
    description: 'Internal signature header',
    severity: 'warning',
  },
  {
    pattern: /sheen_sk_[a-zA-Z0-9]/,
    description: 'Server key in client code',
    severity: 'error',
  },
];

// =============================================================================
// FILE CLASSIFICATION
// =============================================================================

/**
 * Determine if a file is client-facing (browser bundle target).
 *
 * Conservative heuristic: In Next.js App Router, page.tsx and layout.tsx are
 * Server Components by default. Only mark as client-facing if there's explicit
 * evidence of client-side usage.
 */
export function isClientFacingFile(filePath: string, content: string): boolean {
  // Explicit client directive - definitive client-side marker
  if (content.includes("'use client'") || content.includes('"use client"')) {
    return true;
  }

  // Next.js App Router: page.tsx/layout.tsx are Server Components by default
  // Do NOT mark them as client-facing unless they have explicit client markers
  if (filePath.includes('/app/')) {
    // API routes are always server-side
    if (filePath.includes('/api/')) {
      return false;
    }
    // Page and layout files default to server in App Router
    if (filePath.match(/\/(layout|page)\.(tsx?|jsx?)$/)) {
      return false; // Server Component by default
    }
  }

  // Hooks directory is definitively client-side
  if (filePath.includes('/hooks/')) {
    return true;
  }

  // Components directory - only client if it uses React hooks
  if (filePath.includes('/components/')) {
    // Check for React hook usage (useState, useEffect, etc.)
    if (/\buse(State|Effect|Memo|Callback|Ref|Reducer|Context|LayoutEffect)\b/.test(content)) {
      return true;
    }
    // Otherwise, could be a Server Component
    return false;
  }

  // DOM API usage is a strong client-side indicator
  if (content.includes('window.') || content.includes('document.')) {
    return true;
  }

  // Hook filename pattern (e.g., useAuth.ts, useCart.tsx)
  if (filePath.match(/use[A-Z][a-zA-Z]+\.(tsx?|jsx?)$/)) {
    return true;
  }

  return false;
}

// =============================================================================
// SCANNING
// =============================================================================

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface TopologyViolation {
  file: string;
  line: number;
  pattern: string;
  description: string;
  severity: 'error' | 'warning';
  snippet: string;
}

export interface ScanResult {
  /** Files scanned */
  scannedFiles: number;
  /** Files that were classified as client-facing */
  clientFacingFiles: number;
  /** Total violations found */
  violationCount: number;
  /** Error-level violations (should block) */
  errorCount: number;
  /** Warning-level violations (should warn) */
  warningCount: number;
  /** Detailed violations */
  violations: TopologyViolation[];
  /** Whether the scan passed (no errors) */
  passed: boolean;
}

/**
 * Scan generated files for topology leaks.
 *
 * @param files - Array of generated files to scan
 * @returns Scan result with violations
 */
export function scanForTopologyLeaks(files: GeneratedFile[]): ScanResult {
  const violations: TopologyViolation[] = [];
  let clientFacingFiles = 0;

  for (const file of files) {
    // Only scan client-facing files
    if (!isClientFacingFile(file.path, file.content)) {
      continue;
    }

    clientFacingFiles++;
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const lineNumber = i + 1;

      for (const { pattern, description, severity } of TOPOLOGY_LEAK_PATTERNS) {
        if (pattern.test(line)) {
          // Get a snippet for context (truncated)
          const snippet = line.trim().slice(0, 100);

          violations.push({
            file: file.path,
            line: lineNumber,
            pattern: pattern.source,
            description,
            severity,
            snippet,
          });
        }
      }
    }
  }

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  return {
    scannedFiles: files.length,
    clientFacingFiles,
    violationCount: violations.length,
    errorCount,
    warningCount,
    violations,
    passed: errorCount === 0,
  };
}

/**
 * Format scan result for logging.
 */
export function formatScanResult(result: ScanResult): string {
  if (result.passed && result.warningCount === 0) {
    return `✅ Topology scan passed: ${result.scannedFiles} files scanned, ${result.clientFacingFiles} client-facing, no violations`;
  }

  const lines: string[] = [];

  if (!result.passed) {
    lines.push(`❌ Topology scan FAILED: ${result.errorCount} error(s), ${result.warningCount} warning(s)`);
  } else {
    lines.push(`⚠️ Topology scan passed with warnings: ${result.warningCount} warning(s)`);
  }

  lines.push(`   Files: ${result.scannedFiles} total, ${result.clientFacingFiles} client-facing`);
  lines.push('');

  for (const v of result.violations) {
    const icon = v.severity === 'error' ? '🔴' : '🟡';
    lines.push(`${icon} ${v.file}:${v.line}`);
    lines.push(`   ${v.description}`);
    lines.push(`   > ${v.snippet}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Quick check if any file has obvious topology leaks.
 * Faster than full scan, for early rejection.
 */
export function hasObviousLeaks(content: string): boolean {
  // Check most critical patterns only
  const criticalPatterns = [/WORKER_BASE_URL/, /sheen_sk_[a-zA-Z0-9]/, /\/v1\/inhouse\//];

  return criticalPatterns.some((p) => p.test(content));
}
