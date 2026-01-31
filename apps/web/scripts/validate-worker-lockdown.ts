#!/usr/bin/env npx tsx
/**
 * Worker Exposure Lockdown Validation Script
 *
 * Scans the codebase to ensure no worker URLs are exposed to browsers.
 * Part of EASY_MODE_SDK_PLAN.md Priority 4: Polish
 *
 * Run: npx tsx scripts/validate-worker-lockdown.ts
 */

import { execSync } from 'child_process';
import * as path from 'path';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Script is now at sheenappsai/scripts/, so project root is one level up
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_PATH = path.join(PROJECT_ROOT, 'src');

/**
 * Patterns that indicate worker URL exposure to browsers.
 * These should NEVER appear in client-accessible code.
 */
const CRITICAL_PATTERNS = [
  // Worker URL in NEXT_PUBLIC (exposes to browser)
  'NEXT_PUBLIC_WORKER_BASE_URL',
  'NEXT_PUBLIC_WORKER_SHARED_SECRET',
  'NEXT_PUBLIC_WORKER_URL',
  // Legacy patterns
  'NEXT_PUBLIC_CLAUDE_WORKER_URL',
  'NEXT_PUBLIC_CLAUDE_SHARED_SECRET',
];

/**
 * Patterns that are acceptable in server-only contexts.
 * These use NEXT_PUBLIC as a dev fallback but are only called server-side.
 */
const ACCEPTABLE_FALLBACKS = [
  // Feature flags (booleans, not secrets)
  'NEXT_PUBLIC_ENABLE_CLAUDE_WORKER',
  'NEXT_PUBLIC_CLAUDE_WORKER_AS_DEFAULT',
  'NEXT_PUBLIC_CLAUDE_WORKER_FOR_ALL',
];

/**
 * Files that are known to be server-only (API routes, server actions).
 * These can use WORKER_BASE_URL || NEXT_PUBLIC_WORKER_BASE_URL as dev fallback.
 */
const SERVER_ONLY_PATTERNS = [
  '/app/api/',
  '/server/',
  '/lib/server/',
  '/lib/admin/',
  '.server.ts',
];

/**
 * Files that should NEVER reference worker URLs.
 */
const CLIENT_ONLY_PATTERNS = [
  '/components/',
  '/hooks/',
  '.client.ts',
  'use-', // hooks typically start with use-
];

// =============================================================================
// SCANNING
// =============================================================================

interface Violation {
  file: string;
  line: number;
  pattern: string;
  content: string;
  severity: 'critical' | 'warning' | 'info';
  reason: string;
}

function isServerOnlyFile(filePath: string): boolean {
  return SERVER_ONLY_PATTERNS.some(p => filePath.includes(p));
}

function isClientOnlyFile(filePath: string): boolean {
  return CLIENT_ONLY_PATTERNS.some(p => filePath.includes(p));
}

function isDocFile(filePath: string): boolean {
  return filePath.includes('/docs/') || filePath.endsWith('.md');
}

function scanForPattern(pattern: string): Violation[] {
  const violations: Violation[] = [];

  try {
    // Use grep to find all occurrences
    const result = execSync(
      `grep -rn "${pattern}" "${SRC_PATH}" 2>/dev/null || true`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    const lines = result.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (!match) continue;

      const [, filePath, lineNum, content] = match;
      const relPath = filePath.replace(PROJECT_ROOT, '');

      // Skip docs
      if (isDocFile(relPath)) continue;

      // Determine severity
      let severity: Violation['severity'] = 'warning';
      let reason = '';

      if (CRITICAL_PATTERNS.includes(pattern)) {
        if (isClientOnlyFile(relPath)) {
          severity = 'critical';
          reason = 'Worker URL in client-accessible file - SECURITY RISK';
        } else if (isServerOnlyFile(relPath)) {
          // Server files using NEXT_PUBLIC as fallback is acceptable but not ideal
          if (content.includes('|| process.env.NEXT_PUBLIC')) {
            severity = 'warning';
            reason = 'Using NEXT_PUBLIC as fallback in server code - should use WORKER_BASE_URL only';
          } else {
            severity = 'critical';
            reason = 'Direct use of NEXT_PUBLIC worker URL in server code';
          }
        } else {
          severity = 'warning';
          reason = 'Worker URL pattern found - verify this is server-only';
        }
      } else if (ACCEPTABLE_FALLBACKS.includes(pattern)) {
        severity = 'info';
        reason = 'Feature flag (not a secret) - acceptable';
      }

      violations.push({
        file: relPath,
        line: parseInt(lineNum, 10),
        pattern,
        content: content.trim().slice(0, 100),
        severity,
        reason,
      });
    }
  } catch (error) {
    // grep returns non-zero if no matches, which is fine
  }

  return violations;
}

function scanBrowserClient(): Violation[] {
  const violations: Violation[] = [];

  try {
    // Look for files that might be browser clients using worker URLs
    const result = execSync(
      `grep -rln "WORKER.*URL\\|WORKER.*BASE" "${SRC_PATH}" 2>/dev/null | xargs grep -l "'use client'\\|browser\\|window\\." 2>/dev/null || true`,
      { encoding: 'utf-8' }
    );

    const files = result.trim().split('\n').filter(Boolean);

    for (const filePath of files) {
      const relPath = filePath.replace(PROJECT_ROOT, '');
      violations.push({
        file: relPath,
        line: 0,
        pattern: 'WORKER_URL in potential browser code',
        content: 'File contains both worker URL references and browser indicators',
        severity: 'critical',
        reason: 'Potential worker URL exposure to browser - manual review required',
      });
    }
  } catch (error) {
    // No matches is fine
  }

  return violations;
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log('Worker Exposure Lockdown Validation\n');
  console.log(`Scanning: ${SRC_PATH}\n`);

  const allViolations: Violation[] = [];

  // Scan for critical patterns
  console.log('Scanning for NEXT_PUBLIC_WORKER_* patterns...');
  for (const pattern of CRITICAL_PATTERNS) {
    const violations = scanForPattern(pattern);
    allViolations.push(...violations);
  }

  // Scan for browser clients with worker URLs
  console.log('Scanning for browser code with worker URLs...');
  const browserViolations = scanBrowserClient();
  allViolations.push(...browserViolations);

  // Report results
  console.log('\n' + '='.repeat(80));

  const critical = allViolations.filter(v => v.severity === 'critical');
  const warnings = allViolations.filter(v => v.severity === 'warning');
  const info = allViolations.filter(v => v.severity === 'info');

  if (critical.length > 0) {
    console.log(`\nCRITICAL VIOLATIONS (${critical.length}):\n`);
    for (const v of critical) {
      console.log(`  ${v.file}:${v.line}`);
      console.log(`    Pattern: ${v.pattern}`);
      console.log(`    Reason: ${v.reason}`);
      console.log(`    > ${v.content}`);
      console.log('');
    }
  }

  if (warnings.length > 0) {
    console.log(`\nWARNINGS (${warnings.length}):\n`);
    for (const v of warnings) {
      console.log(`  ${v.file}:${v.line}`);
      console.log(`    Pattern: ${v.pattern}`);
      console.log(`    Reason: ${v.reason}`);
      console.log('');
    }
  }

  if (info.length > 0) {
    console.log(`\nINFO (${info.length}): Feature flags (acceptable)\n`);
  }

  // Summary
  console.log('='.repeat(80));
  console.log(`\nSummary:`);
  console.log(`   Critical: ${critical.length}`);
  console.log(`   Warnings: ${warnings.length}`);
  console.log(`   Info: ${info.length}`);

  if (critical.length > 0) {
    console.log('\nLOCKDOWN FAILED - Critical security issues found');
    console.log('\nRequired fixes:');
    console.log('1. Remove all NEXT_PUBLIC_WORKER_* variables from .env files');
    console.log('2. Update server code to use WORKER_BASE_URL only (no NEXT_PUBLIC fallback)');
    console.log('3. Ensure browser-accessible code never references worker URLs');
    console.log('4. All worker calls must go through Next.js API routes (proxy pattern)');
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log('\nLOCKDOWN PASSED WITH WARNINGS');
    console.log('\nRecommended improvements:');
    console.log('- Remove NEXT_PUBLIC fallbacks from server code');
    console.log('- Use WORKER_BASE_URL environment variable exclusively');
  } else {
    console.log('\nLOCKDOWN PASSED - No worker URL exposure detected');
  }
}

main();
