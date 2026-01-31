import execa from 'execa';
import { spawnSync } from 'node:child_process';
import { promises as fsPromises } from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { pool } from './database';
import { ServerLoggingService } from './serverLoggingService';
import { SupabaseDeploymentIntegration, SupabaseIntegrationDetection } from './supabaseDeploymentIntegration';
import { unifiedLogger } from './unifiedLogger';

// OpenNext configuration management
const OPENNEXT_PKG = process.env.OPENNEXT_CF_VERSION ?? '@opennextjs/cloudflare@^1.6.5';

// Ensure @opennextjs/cloudflare dependency is available in the project
async function ensureOpenNextDependencies(projectPath: string): Promise<void> {
  const fs = require('node:fs');
  const path = require('node:path');
  const execa = (await import('execa')).default;

  try {
    const appRoot = resolveAppRoot(projectPath);
    const packageJsonPath = path.join(appRoot, 'package.json');

    console.log('[OpenNext] Ensuring @opennextjs/cloudflare dependency...');

    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`package.json not found at: ${packageJsonPath}`);
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const targetVersion = '^1.6.5';

    // Check if dependency already exists with correct version
    const currentVersion = packageJson.devDependencies?.['@opennextjs/cloudflare'] ||
                          packageJson.dependencies?.['@opennextjs/cloudflare'];

    if (currentVersion === targetVersion) {
      console.log('[OpenNext] ✅ Dependency already present with correct version');
      return;
    }

    // Add to devDependencies
    packageJson.devDependencies = packageJson.devDependencies || {};
    packageJson.devDependencies['@opennextjs/cloudflare'] = targetVersion;

    // Write updated package.json synchronously
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
    console.log('[OpenNext] ✅ Added @opennextjs/cloudflare to devDependencies');

    // Install the dependency
    console.log('[OpenNext] Installing dependencies...');
    await execa('npm', ['install'], { cwd: appRoot });
    console.log('[OpenNext] ✅ Dependencies installed successfully');

  } catch (error) {
    console.error('[OpenNext] ❌ Failed to ensure dependencies:', error);
    throw error;
  }
}

// Resolve the app root directory (contains next.config.* or package.json with next)
function resolveAppRoot(start: string): string {
  const fs = require('node:fs');
  const path = require('node:path');
  let dir = start;

  while (dir !== path.parse(dir).root) {
    // Check for next.config.* files
    if (fs.existsSync(path.join(dir, 'next.config.js')) ||
        fs.existsSync(path.join(dir, 'next.config.ts')) ||
        fs.existsSync(path.join(dir, 'next.config.mjs'))) {
      console.log(`[OpenNext] Found app root via next.config at: ${dir}`);
      return dir;
    }

    // Check for package.json with next dependency
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const content = fs.readFileSync(pkg, 'utf8');
        if (/"next"\s*:/.test(content)) {
          console.log(`[OpenNext] Found app root via package.json with next at: ${dir}`);
          return dir;
        }
      } catch {
        // Invalid JSON, continue
      }
    }

    dir = path.dirname(dir);
  }

  throw new Error(`Could not locate app root (no next.config.* or package.json with next dependency). Started from: ${start}`);
}

// Style-agnostic config validator (accepts both CJS and ESM/TS formats)
function isValidOpenNextConfig(content: string): boolean {
  const hasExportDefault = content.includes('export default') && content.includes('default:');
  const hasModuleExports = content.includes('module.exports') && content.includes('default:');

  // Check for complete structure expected by OpenNext CLI
  const hasRequiredStructure = content.includes('override:') &&
                               content.includes('wrapper:') &&
                               content.includes('converter:');

  return (hasExportDefault || hasModuleExports) && hasRequiredStructure;
}

function ensureOpenNextConfig(projectPath: string): void {
  const fs = require('node:fs');
  const path = require('node:path');

  try {
    // Resolve the actual project root (expert recommendation)
    const appRoot = resolveAppRoot(projectPath);
    const configPath = path.join(appRoot, 'open-next.config.ts');

    // Complete OpenNext config structure expected by CLI (no imports needed)
    const minimalConfig = `// Complete OpenNext config for Cloudflare (no imports needed)
export default {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "direct"
    }
  },
  edgeExternals: ["node:crypto"],
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "direct"
    }
  }
};
`;

    // ENHANCED DEBUGGING - Preflight checks
    console.log(`[OpenNext] === Preflight Config Checks ===`);
    console.log(`[OpenNext] Project path input: ${projectPath}`);
    console.log(`[OpenNext] Resolved app root: ${appRoot}`);
    console.log(`[OpenNext] Target config path: ${configPath}`);
    console.log(`[OpenNext] App root exists: ${fs.existsSync(appRoot)}`);
    console.log(`[OpenNext] App root contents:`, fs.readdirSync(appRoot).slice(0, 10)); // First 10 files

    console.log(`[OpenNext] Ensuring config exists at project root: ${configPath}`);

    if (!fs.existsSync(configPath)) {
      // Synchronous write with verification (expert recommendation)
      fs.writeFileSync(configPath, minimalConfig, 'utf8');

      // Enhanced verification
      if (!fs.existsSync(configPath)) {
        throw new Error(`CRITICAL: Config file creation failed - file does not exist after write: ${configPath}`);
      }

      const stats = fs.statSync(configPath);
      if (stats.size < 10) {
        throw new Error(`CRITICAL: Config file is too small (${stats.size} bytes), write may have failed`);
      }

      const writtenContent = fs.readFileSync(configPath, 'utf8');
      if (!writtenContent.includes('export default')) {
        throw new Error(`CRITICAL: Config file content is incorrect: ${writtenContent.substring(0, 100)}...`);
      }

      console.log(`[OpenNext] ✅ Created plain JS config with TypeScript extension (${stats.size} bytes)`);
      console.log(`[OpenNext] ✅ Verified config file exists and has correct content`);
      return;
    }

    // Heal legacy/empty configs (expert recommendation)
    const existingConfig = fs.readFileSync(configPath, 'utf8');
    console.log(`[OpenNext] Found existing config (${existingConfig.length} chars)`);

    if (!isValidOpenNextConfig(existingConfig)) {
      fs.writeFileSync(configPath, minimalConfig, 'utf8');

      // Enhanced verification for rewrite
      if (!fs.existsSync(configPath)) {
        throw new Error(`CRITICAL: Config file rewrite failed - file does not exist at ${configPath}`);
      }

      const stats = fs.statSync(configPath);
      const rewrittenContent = fs.readFileSync(configPath, 'utf8');
      if (!isValidOpenNextConfig(rewrittenContent)) {
        throw new Error(`CRITICAL: OpenNext config invalid at ${configPath} (failed validation)`);
      }

      console.log(`[OpenNext] ✅ Updated config to valid format (${stats.size} bytes)`);
      console.log(`[OpenNext] ✅ Verified rewritten config passes validation`);
    } else {
      console.log('[OpenNext] ✅ Config already valid - no changes needed');
    }

    // FINAL VERIFICATION - Ensure config is ready before proceeding
    console.log(`[OpenNext] === Final Config Verification ===`);
    const finalCheck = fs.existsSync(configPath);
    const finalStats = finalCheck ? fs.statSync(configPath) : null;
    console.log(`[OpenNext] Config exists: ${finalCheck}`);
    console.log(`[OpenNext] Config size: ${finalStats ? finalStats.size : 'N/A'} bytes`);
    console.log(`[OpenNext] Config modified: ${finalStats ? finalStats.mtime : 'N/A'}`);

    if (!finalCheck || !finalStats || finalStats.size < 10) {
      throw new Error(`CRITICAL: Final config verification failed. File: ${finalCheck}, Size: ${finalStats?.size}`);
    }

  } catch (error) {
    console.error('[OpenNext] ❌ CRITICAL: Failed to ensure config:', error);
    throw error; // Don't fail silently - this should prevent deployment
  }
}

// Expert fix: Ensure wrangler.toml exists to prevent OpenNext interactive prompts
function ensureWranglerToml(appRoot: string): void {
  const fs = require('node:fs');
  const path = require('node:path');
  const tomlPath = path.join(appRoot, 'wrangler.toml');
  if (fs.existsSync(tomlPath)) return;

  const compatDate = process.env.CF_COMPAT_DATE || '2024-06-20';
  const content =
`# Minimal config to keep OpenNext non-interactive in CI
compatibility_date = "${compatDate}"
compatibility_flags = ["nodejs_compat"]
`;
  fs.writeFileSync(tomlPath, content, 'utf8');
  console.log(`[OpenNext] ✅ Created minimal wrangler.toml at ${tomlPath}`);
}

/**
 * Auto-heal Next.js version for OpenNext compatibility
 * to prevent errors like: ERROR Next.js version unsupported, please upgrade to version 14.2 or greater. Next.js version : 14.1.0
 * Expert recommendation: proactive version upgrade before deployment failure
 */
async function ensureNextVersionCompatibility(appRoot: string, minVersion = '14.2.0'): Promise<void> {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { execSync } = await import('node:child_process');

  try {
    const pkgPath = path.join(appRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      console.log('[NextVersionFix] No package.json found, skipping version check');
      return;
    }

    const packageContent = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(packageContent);
    const currentNext = pkg.dependencies?.next || pkg.devDependencies?.next;

    if (!currentNext) {
      console.log('[NextVersionFix] No Next.js dependency found, skipping version check');
      return;
    }

    // Lightweight version check - focus on 14.0-14.1 which are incompatible
    const versionMatch = String(currentNext).match(/(^|[^\d])(14\.(\d+))/);
    const minorVersion = versionMatch ? Number(versionMatch[3]) : undefined;

    if (minorVersion !== undefined && minorVersion < 2) {
      console.log(`[NextVersionFix] ⚡ Upgrading Next.js from ${currentNext} → ^${minVersion} for OpenNext compatibility`);

      // Detect package manager
      const hasPnpm = fs.existsSync(path.join(appRoot, 'pnpm-lock.yaml'));
      const hasYarn = fs.existsSync(path.join(appRoot, 'yarn.lock'));
      const packageManager = hasPnpm ? 'pnpm' : hasYarn ? 'yarn' : 'npm';

      console.log(`[NextVersionFix] Using package manager: ${packageManager}`);

      // Execute upgrade
      const upgradeCommand = packageManager === 'pnpm'
        ? `pnpm add next@^${minVersion}`
        : packageManager === 'yarn'
        ? `yarn add next@^${minVersion}`
        : `npm install next@^${minVersion}`;

      console.log(`[NextVersionFix] Running: ${upgradeCommand}`);
      execSync(upgradeCommand, {
        cwd: appRoot,
        stdio: 'inherit',
        timeout: 120000 // 2 minute timeout
      });

      console.log(`[NextVersionFix] ✅ Successfully upgraded Next.js to ^${minVersion}`);
    } else if (minorVersion !== undefined && minorVersion >= 2) {
      console.log(`[NextVersionFix] ✅ Next.js version ${currentNext} is compatible (>= 14.2)`);
    } else {
      console.log(`[NextVersionFix] ⚠️ Could not determine Next.js minor version from: ${currentNext}`);
    }

  } catch (error) {
    console.warn(`[NextVersionFix] ⚠️ Version upgrade failed:`, error);
    console.warn(`[NextVersionFix] Continuing with deployment - OpenNext will show specific error if incompatible`);
    // Don't throw - let OpenNext handle the version check and provide specific error
  }
}

async function runOpenNextBuild(projectPath: string): Promise<void> {
  const fs = require('node:fs');
  const path = require('node:path');

  try {
    // Step 1: Skip npm install - use ephemeral npx (expert recommendation)
    console.log('[OpenNext] === Phase 1: Ephemeral Execution Setup ===');
    console.log('[OpenNext] Using ephemeral npx to bypass npm install quirks');

    // Step 2: Ensure config exists (existing logic, enhanced)
    console.log('[OpenNext] === Phase 2: Configuration Management ===');
    ensureOpenNextConfig(projectPath);

    // Expert fix: ensure wrangler.toml exists to avoid OpenNext prompt
    const appRoot = resolveAppRoot(projectPath);
    ensureWranglerToml(appRoot);

    // ✅ NEW: Auto-heal Next.js version for OpenNext compatibility
    console.log('[OpenNext] === Phase 2.5: Version Compatibility Check ===');
    await ensureNextVersionCompatibility(appRoot, '14.2.0');

    // Step 3: Prepare for OpenNext execution
    console.log('[OpenNext] === Phase 3: Pre-execution Setup ===');
    const configPath = path.join(appRoot, 'open-next.config.ts');

    // Enhanced environment with CI flags (expert recommendation)
    const env = {
      CI: '1',
      WRANGLER_NON_INTERACTIVE: 'true',
      NON_INTERACTIVE: 'true',       // Expert fix: additional non-interactive flag
      ...process.env
    };

    // COMPREHENSIVE PRE-FLIGHT DEBUGGING
    console.log('[OpenNext] === Pre-flight Debugging ===');
    console.log(`[OpenNext] Input project path: ${projectPath}`);
    console.log(`[OpenNext] Resolved app root: ${appRoot}`);
    console.log(`[OpenNext] Process CWD: ${process.cwd()}`);
    console.log(`[OpenNext] OpenNext will run from: ${appRoot}`);
    console.log(`[OpenNext] Config file path: ${configPath}`);
    console.log(`[OpenNext] Config exists: ${fs.existsSync(configPath)}`);
    console.log(`[OpenNext] Directory listing:`, fs.readdirSync(appRoot));
    console.log(`[OpenNext] Environment: CI=${env.CI}, NON_INTERACTIVE=${env.WRANGLER_NON_INTERACTIVE}`);
    console.log(`[OpenNext] Command: npx opennextjs-cloudflare build`);
    console.log(`[OpenNext] Version: ${OPENNEXT_PKG}`);

    // Expert-recommended guardrails: Enhanced config verification
    console.log('[OpenNext] === Expert Guardrails: Config Verification ===');

    // Always write config to project root, not .next/ (expert recommendation)
    if (!fs.existsSync(configPath)) {
      throw new Error(`CRITICAL: Config file missing before OpenNext execution: ${configPath}`);
    }

    // For flaky filesystems, add a tiny sync wait (expert recommendation)
    await new Promise(r => setTimeout(r, 50));

    const configContent = fs.readFileSync(configPath, 'utf8');
    if (!configContent.includes('export default')) {
      throw new Error(`CRITICAL: Config file has incorrect content before OpenNext execution`);
    }

    // Log the cwd, config path, and dir listing before invoking OpenNext (expert recommendation)
    console.log('[OpenNext] === Final Pre-execution Diagnostics ===');
    console.log(`[OpenNext] Current working directory: ${appRoot}`);
    console.log(`[OpenNext] Config file path: ${configPath}`);
    console.log(`[OpenNext] Config file size: ${fs.statSync(configPath).size} bytes`);
    console.log(`[OpenNext] Directory contents:`, fs.readdirSync(appRoot).filter((f: string) => !f.startsWith('.')).slice(0, 10));
    console.log(`[OpenNext] Config preview:`, configContent.substring(0, 200));

    console.log(`[OpenNext] ✅ Pre-flight checks passed, starting OpenNext build...`);

    // Step 4: Execute OpenNext build (using app root as CWD)
    console.log('[OpenNext] === Phase 4: OpenNext Execution ===');
    console.log(`[OpenNext] Building with ${OPENNEXT_PKG}...`);

    // Expert recommendation: Pre-flight validation and diagnostics
    console.log('[OpenNext] === Pre-flight Validation ===');
    console.log(`[OpenNext] CWD: ${appRoot}`);
    console.log(`[OpenNext] Using config: ${configPath}`);
    console.log(`[OpenNext] Exists: ${fs.existsSync(configPath)} Size: ${fs.existsSync(configPath) ? fs.statSync(configPath).size : 0} bytes`);
    console.log(`[OpenNext] Node version: ${process.versions.node}`);

    if (!fs.existsSync(configPath) || fs.statSync(configPath).size === 0) {
      throw new Error(`OpenNext config missing/empty at ${configPath}`);
    }

    const result = await execa('npx', [
      '--yes',  // Expert recommendation: auto-accept prompts
      '@opennextjs/cloudflare@^1.6',  // Expert recommendation: specify version range
      'build',
      '--config', path.resolve(configPath)  // Expert recommendation: absolute config path
    ], {
      cwd: appRoot,  // Use app root, not project path
      env: {
        NODE_ENV: 'production',  // Ensure production environment
        ...env,
        CI: '1'  // Expert recommendation: suppress interactive prompts (override any existing CI)
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15 * 60_000 // 15 minutes
    });

    console.log('[OpenNext] Build completed successfully');
    console.log(`[OpenNext] Build output: ${result.stdout?.substring(0, 500) || 'No stdout'}`);

    // Expert recommendation: Post-build validation
    console.log('[OpenNext] === Post-build Validation ===');
    const workerPath = path.join(appRoot, '.open-next/worker.js');
    const assetsPath = path.join(appRoot, '.open-next/assets');

    if (!fs.existsSync(workerPath) || !fs.existsSync(assetsPath)) {
      throw new Error('OpenNext build did not produce expected outputs');
    }

    console.log(`[OpenNext] ✅ Worker file validated: ${workerPath}`);
    console.log(`[OpenNext] ✅ Assets directory validated: ${assetsPath}`);

    // Additional build artifact verification
    const workerSize = fs.statSync(workerPath).size;
    const assetCount = fs.readdirSync(assetsPath).length;
    console.log(`[OpenNext] Worker size: ${workerSize} bytes, Assets: ${assetCount} files`);
    console.log(`[OpenNext] ✅ Style-agnostic config validation successful - CLI requirement satisfied`);

  } catch (e: any) {
    console.error('[OpenNext] === Build Failed ===');
    console.error(`[OpenNext] Error type: ${e.constructor.name}`);
    console.error(`[OpenNext] Exit code: ${e.exitCode}`);
    console.error(`[OpenNext] Command: ${e.command}`);
    console.error(`[OpenNext] STDOUT: ${e.stdout?.substring(0, 1000) || 'No stdout'}`);
    console.error(`[OpenNext] STDERR: ${e.stderr?.substring(0, 1000) || 'No stderr'}`);

    const msg = String(e.stderr || e.stdout || e.message || '');
    const needsConfig = /Missing required `open-next\.config\.ts`/i.test(msg);
    const packageNotFound = /404 Not Found.*opennextjs-cloudflare/i.test(msg) || /Command failed.*opennextjs-cloudflare/i.test(msg);
    const npmMatches = /Cannot read properties of null.*matches/i.test(msg);  // Expert-identified npm quirk
    const versionGate = /Next\.js version unsupported.*14\.2 or greater/i.test(msg);  // Expert-identified version issue

    // ✅ NEW: Version gate detection and recovery attempt (expert recommendation)
    if (versionGate) {
      console.error('[OpenNext] ❌ CRITICAL: Next.js version compatibility issue detected!');
      console.error('[OpenNext] OpenNext requires Next.js >= 14.2, but project appears to be using an older version');
      console.error('[OpenNext] This should have been auto-healed in Phase 2.5 - version check may have failed');

      // Attempt one more version upgrade if our previous attempt failed
      try {
        const appRoot = resolveAppRoot(projectPath);
        console.log('[OpenNext] 🔄 Attempting emergency version upgrade...');
        await ensureNextVersionCompatibility(appRoot, '14.2.0');

        console.log('[OpenNext] ⚡ Emergency upgrade completed, but this build attempt has already failed');
        console.log('[OpenNext] Suggestion: Retry deployment - Next.js should now be compatible');

        // Don't retry automatically to avoid infinite loops - let the system handle retry logic
        // The error will propagate and the deployment system can decide on retry strategy

      } catch (upgradeError) {
        console.error('[OpenNext] ❌ Emergency version upgrade also failed:', upgradeError);
        console.error('[OpenNext] Manual intervention may be required');
      }
    }

    // Smart error detection for common issues
    if (packageNotFound) {
      console.error('[OpenNext] ❌ CRITICAL: NPM package name error detected!');
      console.error('[OpenNext] The package "opennextjs-cloudflare" does not exist.');
      console.error('[OpenNext] Make sure to use "@opennextjs/cloudflare" (with @ scope)');
      console.error('[OpenNext] This indicates a bug in our deployment command.');
    }

    if (npmMatches) {
      console.error('[OpenNext] ❌ CRITICAL: NPM CLI quirk detected (expert diagnosis)!');
      console.error('[OpenNext] This is the "matches" error that blocks dependency installation.');
      console.error('[OpenNext] Using ephemeral npx should bypass this issue.');
      console.error('[OpenNext] If this error persists, there may be an npm cache or environment issue.');
    }

    if (needsConfig) {
      console.log('[OpenNext] ❌ CRITICAL: Config file still not found by OpenNext despite our creation');
      console.log('[OpenNext] This suggests a working directory or process isolation issue');

      // Enhanced diagnostic with expert recommendations
      const appRoot = resolveAppRoot(projectPath);
      const configPath = path.join(appRoot, 'open-next.config.ts');
      console.log('[OpenNext] === Enhanced Failure Diagnostic ===');
      console.log(`[OpenNext] CWD: ${appRoot}`);
      console.log(`[OpenNext] Config path: ${configPath}`);
      console.log(`[OpenNext] Config exists: ${fs.existsSync(configPath)}`);
      console.log(`[OpenNext] Config size: ${fs.existsSync(configPath) ? fs.statSync(configPath).size : 'N/A'}`);
      console.log(`[OpenNext] Directory listing:`, fs.readdirSync(appRoot).slice(0, 15));

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        console.log(`[OpenNext] Config content preview:`, configContent.substring(0, 200));
      }
    }

    throw e;
  }
}

/**
 * CloudFlare Three-Lane Deployment System
 * Automatically routes applications to the appropriate deployment strategy based on runtime requirements
 */

export interface NodeSignal {
  file: string;
  line: number;
  match: string;
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface DetectionResult {
  target: 'pages-static' | 'pages-edge' | 'workers-node';
  reasons: string[];
  notes?: string[] | undefined;
  origin: 'manual' | 'detection';
  switched?: boolean | undefined;
  switchReason?: string | undefined;
  supabaseIntegration?: SupabaseIntegrationDetection | undefined;
}

export interface DeploymentResult {
  deployedUrl: string;
  // target: 'pages-static' | 'pages-edge' | 'workers-node' | 'pages-static-legacy';
  target: 'pages-static' | 'pages-edge' | 'workers-node';
  switched?: boolean;
  switchReason?: string;
  output?: string;
  deploymentId?: string;
  origin?: 'detection' | 'manual' | 'fallback';
  reasons?: string[];
  confidence?: number;
  manifest?: any;
  supabaseIntegration?: any;
}

// Per-lane allowlists for environment variables (security hygiene)
const ENV_VAR_ALLOWLISTS = {
  'pages-static': [/^NEXT_PUBLIC_/],
  'pages-edge': [/^NEXT_PUBLIC_/, /^SUPABASE_URL$/],
  'workers-node': [/^SUPABASE_.*$/, /^NEXT_PUBLIC_/, /^DATABASE_/, /^SHEEN_BUILD_ID$/]
};

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface DeploymentManifest {
  target: 'pages-static' | 'pages-edge' | 'workers-node';
  reasons: string[];
  notes?: string[] | undefined;
  timestamp: string;
  version: string;
  supabaseIntegration?: SupabaseIntegrationDetection | undefined;
  switched?: boolean | undefined;
  switchReason?: string | undefined;
}

export class CloudflareThreeLaneDeployment {
  private static instance: CloudflareThreeLaneDeployment;
  private supabaseIntegration: SupabaseDeploymentIntegration;
  private loggingService: ServerLoggingService;
  private currentBuildId?: string;

  constructor() {
    this.supabaseIntegration = SupabaseDeploymentIntegration.getInstance();
    this.loggingService = ServerLoggingService.getInstance();
  }

  static getInstance(): CloudflareThreeLaneDeployment {
    if (!CloudflareThreeLaneDeployment.instance) {
      CloudflareThreeLaneDeployment.instance = new CloudflareThreeLaneDeployment();
    }
    return CloudflareThreeLaneDeployment.instance;
  }

  /**
   * Filter environment variables based on deployment lane allowlists
   */
  private filterEnvVars(
    envVars: Record<string, string>,
    target: 'pages-static' | 'pages-edge' | 'workers-node'
  ): Record<string, string> {
    const allowlist = ENV_VAR_ALLOWLISTS[target];
    const filtered: Record<string, string> = {};

    Object.entries(envVars).forEach(([key, value]) => {
      const isAllowed = allowlist.some(pattern => pattern.test(key));
      if (isAllowed) {
        filtered[key] = value;
      } else {
        console.warn(`[Three-Lane] Environment variable '${key}' not allowed for target '${target}' - skipped`);
      }
    });

    return filtered;
  }

  /**
   * Safely log command arguments, redacting sensitive values
   */
  private safeLog(label: string, command: string, args: string[]): void {
    const redactedArgs = args.map(arg => {
      // Redact --var and --env arguments that contain sensitive data
      if (arg.includes('KEY') || arg.includes('SECRET') || arg.includes('TOKEN') || arg.includes('PASSWORD')) {
        if (arg.includes(':') || arg.includes('=')) {
          const [prefix, ...rest] = arg.split(/[:=]/);
          return `${prefix}:****`;
        }
      }
      return arg;
    });

    console.log(`[Three-Lane] ${label}: ${command} ${redactedArgs.join(' ')}`);
  }

  /**
   * Detect positive workers-node markers (expert recommendation)
   * Essential markers that require Node.js runtime:
   * - export const runtime = 'nodejs'
   * - export const dynamic = 'force-dynamic'
   * - export const revalidate = 0
   * - headers()/cookies() usage
   * - API routes without edge runtime
   */
  private async detectWorkersNodeMarkers(cwd: string): Promise<{
    detected: boolean;
    reasons: string[];
    evidence: string[];
  }> {
    const reasons: string[] = [];
    const evidence: string[] = [];

    try {
      const searchRoots = ['app/**', 'src/app/**', 'pages/**', 'src/pages/**'];

      // Check for Node.js runtime markers
      const runtimeMarkers = [
        "export const runtime = 'nodejs'",
        'export const runtime = "nodejs"',
        "export const dynamic = 'force-dynamic'",
        'export const dynamic = "force-dynamic"',
        'export const revalidate = 0',
        "export const fetchCache = 'force-no-store'",
        'export const fetchCache = "force-no-store"'
        // REMOVED: headers()/cookies() - available on Edge too (false positive)
      ];

      const hasRuntimeMarkers = await this.checkForPattern(cwd, searchRoots, runtimeMarkers);
      if (hasRuntimeMarkers) {
        reasons.push('Node.js runtime markers detected');
        evidence.push('Runtime: nodejs, dynamic, or headers/cookies usage found');
      }

      // Check for Node.js built-ins
      const nodeBuiltins = [
        "from 'crypto'", 'from "crypto"',
        "from 'fs'", 'from "fs"',
        "from 'path'", 'from "path"',
        "from 'buffer'", 'from "buffer"',
        "from 'child_process'", 'from "child_process"',
        "from 'stream'", 'from "stream"',
        "from 'node:", 'from "node:'
      ];

      const hasNodeBuiltins = await this.checkForPattern(cwd, searchRoots, nodeBuiltins);
      if (hasNodeBuiltins) {
        reasons.push('Node.js built-ins detected');
        evidence.push('Node.js built-in imports found');
      }

      // Check for API routes without edge runtime (should be Node.js)
      const hasApiRoutes = await this.hasApiRoutesFS(cwd);
      if (hasApiRoutes) {
        // Check if API routes explicitly use edge runtime
        const hasEdgeAPI = await this.checkForPattern(cwd, ['app/api/**'], ["export const runtime = 'edge'", 'export const runtime = "edge"']);
        if (!hasEdgeAPI) {
          reasons.push('API routes without edge runtime');
          evidence.push('API routes default to Node.js runtime');
        }
      }

      return {
        detected: reasons.length > 0,
        reasons: [...new Set(reasons)], // Deduplicate
        evidence: evidence.slice(0, 5) // Limit evidence to prevent spam
      };
    } catch (error) {
      console.warn('[WorkersNode] Detection failed:', error);
      return { detected: false, reasons: [], evidence: [] };
    }
  }

  /**
   * Check for API routes using filesystem paths (not content scanning)
   * Expert recommendation: Use git ls-files for speed, fallback to filesystem
   */
  private async hasApiRoutesFS(cwd: string): Promise<boolean> {
    const { spawnSync } = await import('node:child_process');
    const { readdir } = await import('node:fs/promises');
    const path = await import('node:path');

    // Try git first (faster for large projects)
    const git = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' });
    if (git.status === 0) {
      return git.stdout.split('\0').some(f =>
        /(^|\/)app\/api\/.+\/route\.(t|j)sx?$/.test(f) ||
        /(^|\/)pages\/api\/.+\.(t|j)sx?$/.test(f)
      );
    }

    // FS fallback (shallow, fast)
    async function dirHas(p: string): Promise<boolean> {
      try {
        const entries = await readdir(path.join(cwd, p));
        return entries.length > 0;
      } catch {
        return false;
      }
    }
    return (await dirHas('app/api')) || (await dirHas('pages/api'));
  }

  /**
   * Detect edge runtime signals from multiple sources
   * Expert recommendation: Source + topology + build output
   */
  private async detectEdgeRuntimeSignals(cwd: string, buildOutput?: string): Promise<{
    hasEdgeRuntimeExport: boolean;
    hasMiddleware: boolean;
    buildIndicatesEdge: boolean;
    evidence: string[];
  }> {
    const evidence: string[] = [];

    // 1) Source-level exports (App & Pages router) - literal search first
    const edgeFlagPatterns = [
      "export const runtime = 'edge'",
      'export const runtime = "edge"',
      // Historical pages router syntax in /pages/api:
      'export const config = {', 'runtime:', "'edge'", '"edge"'
    ];
    let edgeFlag = await this.checkForPattern(cwd,
      ['app/**', 'pages/**', 'src/**'],
      edgeFlagPatterns
    );

    // Regex fallback for unusual formatting (essential safety net)
    if (!edgeFlag) {
      edgeFlag = await this.scanForEdgeRuntimeRegex(cwd, ['app/**', 'pages/**', 'src/**']);
    }

    if (edgeFlag) evidence.push("source: found `export const runtime = 'edge'` (or config)");

    // 2) Topology: middleware.* implies edge (with filesystem fallback)
    const hasMiddleware = await (async () => {
      const { spawnSync } = await import('node:child_process');
      const path = await import('node:path');
      const candidates = ['middleware.ts', 'middleware.js', 'middleware.mts', 'middleware.cjs'];

      // Try git first
      const git = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' });
      if (git.status === 0) {
        const files = git.stdout.split('\0');
        const found = files.some(f => candidates.includes(path.basename(f)));
        if (found) {
          evidence.push('topology: middleware.* present (edge runtime)');
          return true;
        }
      }

      // Filesystem fallback when git fails or finds nothing
      try {
        const rootFiles = await fsPromises.readdir(cwd);
        const found = rootFiles.some(f => candidates.includes(f));
        if (found) {
          evidence.push('topology: middleware.* present (edge runtime)');
          return true;
        }
      } catch {
        // Ignore filesystem errors
      }

      return false;
    })();

    // 3) Build output hints (secondary signal)
    let buildIndicatesEdge = false;
    if (buildOutput) {
      const hasEdgeSymbol = /ƒ\s+\/[^\s]*/m.test(buildOutput);   // ƒ route lines
      const hasEdgeWarning = /Using edge runtime/i.test(buildOutput);
      buildIndicatesEdge = hasEdgeSymbol || hasEdgeWarning;
      if (buildIndicatesEdge) evidence.push('build: Next output indicates edge runtime');
    }

    return {
      hasEdgeRuntimeExport: edgeFlag,
      hasMiddleware,
      buildIndicatesEdge,
      evidence
    };
  }

  /**
   * Read deploy intent file (supports multiple formats for backward compatibility)
   * Defensive implementation that won't crash if files don't exist
   */
  private async readDeployIntent(projectPath: string): Promise<('pages-static' | 'pages-edge' | 'workers-node') | null> {
    const path = await import('node:path');
    const { readFile } = await import('node:fs/promises');

    // Support multiple file locations and formats
    const candidates = [
      // Current Claude format
      { file: path.join(projectPath, '.sheenapps', 'deploy-intent.json'), props: ['lane', 'deployTarget'] },
      // Alternative formats for flexibility
      { file: path.join(projectPath, '.sheenapps', 'intent.json'), props: ['deployTarget', 'lane'] },
      { file: path.join(projectPath, '.sheenapps', 'config.json'), props: ['deployTarget', 'lane'] }
    ];

    for (const candidate of candidates) {
      try {
        const content = await readFile(candidate.file, 'utf8');
        const json = JSON.parse(content);

        // Check each property in order of preference (enhanced with expert's recommendations)
        for (const prop of candidate.props) {
          const value = json[prop] as string | undefined;
          if (value === 'pages-static' || value === 'pages-edge' || value === 'workers-node') {
            console.log(`[ThreeLane] Deploy intent found: ${value} from ${candidate.file}:${prop}`);
            return value;
          }
        }

        // Additional property support (expert recommendation)
        const additionalProps = ['target', 'deployTarget', 'lane'];
        for (const prop of additionalProps) {
          const value = json[prop] as string | undefined;
          if (value === 'pages-static' || value === 'pages-edge' || value === 'workers-node') {
            console.log(`[ThreeLane] Deploy intent found: ${value} from ${candidate.file}:${prop} (additional property)`);
            return value;
          }
        }
      } catch (error) {
        // Silently continue to next candidate - don't spam logs for missing files
        continue;
      }
    }

    // Expert recommendation: Environment variable override
    const envOverride = process.env.CF_DEPLOY_TARGET;
    if (envOverride === 'pages-static' || envOverride === 'pages-edge' || envOverride === 'workers-node') {
      console.log(`[ThreeLane] Deploy intent found: ${envOverride} from environment variable CF_DEPLOY_TARGET`);
      return envOverride;
    }

    return null;
  }

  /**
   * Detect Vite project (defensive implementation)
   */
  private async isViteProject(projectPath: string): Promise<boolean> {
    const path = await import('node:path');
    const fs = await import('node:fs');

    try {
      // Check package.json for Vite dependencies
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageContent = await fs.promises.readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageContent);

        const hasDep = packageJson.dependencies?.vite;
        const hasDevDep = packageJson.devDependencies?.vite;

        if (hasDep || hasDevDep) {
          console.log(`[ThreeLane] Vite detected in package.json dependencies`);
          return true;
        }
      }

      // Check for Vite config files
      const viteConfigs = [
        'vite.config.ts', 'vite.config.js', 'vite.config.mts',
        'vite.config.mjs', 'vite.config.cjs'
      ];

      for (const configFile of viteConfigs) {
        if (fs.existsSync(path.join(projectPath, configFile))) {
          console.log(`[ThreeLane] Vite config detected: ${configFile}`);
          return true;
        }
      }
    } catch (error) {
      console.warn(`[ThreeLane] Vite detection failed:`, error);
      return false;
    }

    return false;
  }

  /**
   * Detect static site signals (defensive implementation)
   */
  private hasStaticSignals(projectPath: string): boolean {
    const path = require('node:path');
    const fs = require('node:fs');

    try {
      const staticIndicators = ['index.html', 'public', 'static', 'dist'];

      for (const indicator of staticIndicators) {
        if (fs.existsSync(path.join(projectPath, indicator))) {
          console.log(`[ThreeLane] Static signal detected: ${indicator}`);
          return true;
        }
      }
    } catch (error) {
      console.warn(`[ThreeLane] Static signals check failed:`, error);
      return false;
    }

    return false;
  }

  /**
   * Enhanced runtime detection with version gates and validation
   */
  async detectTarget(
    projectPath: string,
    userId?: string,
    sheenProjectId?: string
  ): Promise<DetectionResult> {
    // Feature flag fail-fast check
    if (process.env.ENABLE_THREE_LANE_DEPLOYMENT !== 'true') {
      throw new Error('Three-lane deployment is disabled. Set ENABLE_THREE_LANE_DEPLOYMENT=true to enable.');
    }

    try {
      // Use projectPath as scan root initially - avoid Next-only resolver until we know it's Next
      const scanRoot = projectPath;
      console.log('[ThreeLane] Detection started for project (generic scan):', scanRoot);

      // ✅ 1) PRIORITY 1: Deploy intent file is source of truth
      const intent = await this.readDeployIntent(scanRoot);
      if (intent) {
        console.log(`[ThreeLane] Deploy intent found: ${intent} - using as source of truth`);
        return {
          target: intent,
          reasons: ['Deploy intent file specifies target'],
          origin: 'manual'
        };
      }

      // ✅ 2) PRIORITY 2: Vite project detection → pages-static
      if (await this.isViteProject(scanRoot)) {
        return {
          target: 'pages-static',
          reasons: ['Vite project detected - routes to static hosting'],
          origin: 'detection'
        };
      }

      // ✅ 3) PRIORITY 3: Static site signals → pages-static
      if (this.hasStaticSignals(scanRoot)) {
        return {
          target: 'pages-static',
          reasons: ['Static site signals detected (index.html/public/dist)'],
          origin: 'detection'
        };
      }

      // ✅ 4) PRIORITY 4: Check if it's a Next.js project before using Next-only resolver
      const isNext = await this.isNextProject(scanRoot);

      let appRoot = scanRoot;
      let nextVersion = null;

      if (isNext) {
        // Only now resolve the Next-specific app root (can throw for non-Next projects)
        appRoot = resolveAppRoot(projectPath);
        console.log('[ThreeLane] Next.js project confirmed, using app root:', appRoot);
        nextVersion = await this.getNextMajorVersion(appRoot);

        // Legacy manual override check for Next projects (keep existing logic)
        const override = await this.checkManualOverride(appRoot);
        if (override) {
          return {
            target: override.deployTarget,
            reasons: ['User override'],
            origin: 'manual'
          };
        }
      } else {
        console.log('[ThreeLane] Not a Next.js project - skipping Next-specific detection');
        // For non-Next projects, default to pages-static if we got this far
        return {
          target: 'pages-static',
          reasons: ['Non-Next.js project - defaulting to static hosting'],
          origin: 'detection'
        };
      }

      // ✅ 5) Continue with Next.js-specific detection logic
      console.log('[ThreeLane] Proceeding with Next.js-specific detection...');

      // PPR detection
      const hasPPR = await this.checkForPPR(appRoot);
      if (hasPPR) {
        const detectionResult = {
          target: 'workers-node' as const,
          reasons: ['PPR (Partial Prerendering) detected'],
          origin: 'detection' as const
        };
        console.log('[ThreeLane] target=%s reasons=%j origin=%s',
          detectionResult.target, detectionResult.reasons, detectionResult.origin);
        return detectionResult;
      }

      // Version-based routing
      if (isNext && nextVersion === 15) {
        const detectionResult = {
          target: 'workers-node' as const,
          reasons: ['Next 15 routed to Workers by policy'],
          origin: 'detection' as const
        };
        console.log('[ThreeLane] target=%s reasons=%j origin=%s',
          detectionResult.target, detectionResult.reasons, detectionResult.origin);
        return detectionResult;
      }

      // Enhanced pattern detection with surgical edge routing logic
      const hasApi = await this.hasApiRoutesFS(appRoot);
      const nodeSignals = await this.checkForNodeBuiltins(appRoot, ['app/**', 'pages/**', 'src/**', 'server/**']);
      const hasCredibleNode = nodeSignals.some(signal => this.isCredibleNodeSignal(signal));
      const nodeInEdgeBound = nodeSignals.some(signal =>
        this.isCredibleNodeSignal(signal) && this.isEdgeBoundFile(signal.file)
      );
      const hasISR = await this.checkForPattern(appRoot, ['app/**', 'pages/**', 'src/**'], [
        'export const revalidate', 'revalidatePath(', 'revalidateTag('
      ]);
      const hasStaticExport = await this.checkNextConfig(appRoot, 'output.*export');

      // Edge signals detection
      const edge = await this.detectEdgeRuntimeSignals(appRoot);

      // Surgical precedence logic (expert recommendation):
      // 1) Manual override (already handled above)
      // 2) PPR / Next 15 policy (already handled above)
      // 3) Positive workers-node detection (expert recommendation)
      const workersNodeSignals = await this.detectWorkersNodeMarkers(appRoot);
      console.log('[ThreeLane] Workers-node detection result:', {
        detected: workersNodeSignals.detected,
        reasons: workersNodeSignals.reasons,
        evidence: workersNodeSignals.evidence
      });

      if (workersNodeSignals.detected) {
        const result = {
          target: 'workers-node' as const,
          reasons: workersNodeSignals.reasons,
          notes: workersNodeSignals.evidence.length > 0 ? workersNodeSignals.evidence : undefined,
          origin: 'detection' as const
        };
        console.log('[ThreeLane] ✅ WORKERS-NODE TARGET SELECTED:', result);
        return result;
      }

      // 4) Hard blockers → Workers (ISR)
      if (hasISR) {
        return {
          target: 'workers-node',
          reasons: ['ISR/revalidate detected'],
          origin: 'detection'
        };
      }

      // 4) Explicit Edge signal path (preferred when edge signals exist)
      if (edge.hasEdgeRuntimeExport || edge.hasMiddleware || edge.buildIndicatesEdge) {
        if (nodeInEdgeBound) {
          // Node built-ins inside Edge-bound files → must be Workers
          const notes = nodeSignals.slice(0, 3).map(s => `${s.file}:${s.line} - ${s.match}`);
          return {
            target: 'workers-node',
            reasons: ['Node built-ins detected in Edge-bound code'],
            notes,
            origin: 'detection'
          };
        }

        // Edge signals present, prefer Pages Edge (let build step switch if incompatible)
        const notes: string[] = [...(edge.evidence || [])];
        if (hasCredibleNode && !nodeInEdgeBound) {
          notes.push('Node built-ins present outside Edge-bound files (will verify during Edge build)');
        }
        if (!hasCredibleNode && nodeSignals.length > 0) {
          notes.push('Unverified Node built-ins (fallback detection) — proceeding with Edge build');
        }
        if (!hasApi) notes.push('note: no API routes found; Edge will run pages/middleware');

        return {
          target: 'pages-edge',
          reasons: ['Edge runtime detected'],
          notes: notes.length > 0 ? notes : undefined,
          origin: 'detection'
        };
      }

      // 5) Node-only signals without Edge → Workers
      if (hasCredibleNode) {
        const notes = nodeSignals.slice(0, 3).map(s => `${s.file}:${s.line} - ${s.match}`);
        if (nodeSignals.length > 3) {
          notes.push(`...and ${nodeSignals.length - 3} more Node built-in detections`);
        }
        return {
          target: 'workers-node',
          reasons: ['Node built-ins detected'],
          notes,
          origin: 'detection'
        };
      }

      // 6) Static export with no APIs → Pages Static
      if (hasStaticExport && !hasApi && !hasCredibleNode) {
        return {
          target: 'pages-static',
          reasons: ['Static export detected'],
          origin: 'detection'
        };
      }

      // Continue with expert's precedence logic...

      // Supabase OAuth Integration Detection (preserve existing logic)
      let supabaseIntegration: SupabaseIntegrationDetection | undefined;
      if (userId && sheenProjectId) {
        supabaseIntegration = await this.supabaseIntegration.detectSupabaseIntegration(
          projectPath,
          userId,
          sheenProjectId
        );

        if (supabaseIntegration.hasSupabase && supabaseIntegration.needsServiceRole) {
          return {
            target: 'workers-node',
            reasons: ['Supabase server-side patterns require Workers for service-role key security'],
            notes: [
              'Service-role keys only available in Workers deployment',
              `Connection type: ${supabaseIntegration.connectionType}`,
              supabaseIntegration.connectionType === 'oauth'
                ? `Available projects: ${supabaseIntegration.availableProjects?.length || 0}`
                : 'Manual configuration detected'
            ],
            origin: 'detection',
            supabaseIntegration
          };
        }
      }

      // 7) API routes w/o edge → Workers (nudge to add runtime='edge')
      if (hasApi && !edge.hasEdgeRuntimeExport && !edge.hasMiddleware) {
        return {
          target: 'workers-node',
          reasons: ['SSR/API without Edge runtime flag'],
          notes: ['Add `export const runtime = "edge"` to use Pages Edge'],
          origin: 'detection',
          supabaseIntegration
        };
      }

      // 8) Default → Pages Static
      const detectionResult = {
        target: 'pages-static' as const,
        reasons: ['Default routing'],
        notes: undefined,
        origin: 'detection' as const,
        supabaseIntegration
      };

      // Debug logging for three-lane detection proof
      console.log('[ThreeLane] target=%s origin=%s reasons=%j notes=%j supabase=%j',
        detectionResult.target, detectionResult.origin, detectionResult.reasons,
        detectionResult.notes || [], supabaseIntegration && {
          type: supabaseIntegration.connectionType,
          needsServiceRole: supabaseIntegration.needsServiceRole
        });

      return detectionResult;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'cloudflare_detection_failed',
        error as Error,
        { projectPath, userId, sheenProjectId }
      );

      // ✅ DEFENSIVE FALLBACK: Prefer pages-static when we see static signals
      console.log('[ThreeLane] Detection failed, attempting defensive fallback...');

      try {
        // Try to detect intent file even in error case
        const fallbackIntent = await this.readDeployIntent(projectPath);
        if (fallbackIntent) {
          console.log(`[ThreeLane] Found deploy intent during fallback: ${fallbackIntent}`);
          return {
            target: fallbackIntent,
            reasons: ['Detection failed but deploy intent found'],
            origin: 'manual'
          };
        }

        // Check for Vite or static signals during fallback
        if (await this.isViteProject(projectPath) || this.hasStaticSignals(projectPath)) {
          console.log('[ThreeLane] Static/Vite signals detected during fallback - routing to pages-static');
          return {
            target: 'pages-static',
            reasons: ['Detection failed but static signals present - safer than Workers'],
            origin: 'detection'
          };
        }
      } catch (fallbackError) {
        console.warn('[ThreeLane] Fallback detection also failed:', fallbackError);
      }

      // Final fallback - default to workers-node only if no static signals found
      console.log('[ThreeLane] No static signals found - defaulting to workers-node for compatibility');
      return {
        target: 'workers-node',
        reasons: ['Detection failed with no static signals detected'],
        origin: 'detection'
      };
    }
  }

  /**
   * Unified deploy command with build log monitoring and URL capture
   */
  async deploy(
    projectPath: string,
    buildId: string,
    userId?: string,
    sheenProjectId?: string
  ): Promise<DeploymentResult> {
    // Feature flag fail-fast check
    if (process.env.ENABLE_THREE_LANE_DEPLOYMENT !== 'true') {
      throw new Error('Three-lane deployment is disabled. Set ENABLE_THREE_LANE_DEPLOYMENT=true to enable.');
    }

    // Log deployment start to unified system
    this.currentBuildId = buildId;
    if (userId && sheenProjectId) {
      unifiedLogger.deploy(buildId, userId, sheenProjectId, 'started', `Cloudflare deployment initiated for ${projectPath}`, undefined, {
        framework: 'cloudflare-three-lane',
        projectPath
      });
    }

    // Validate environment first
    this.validateEnvironment();

    // ✅ FIXED: Use projectPath directly for manifest path (avoid Next-only resolver)
    const manifestPath = path.join(projectPath, '.sheenapps', 'deploy-target.json');
    let manifest: DeploymentManifest;

    try {
      const manifestContent = await fsPromises.readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestContent);
    } catch (error) {
      throw new Error('Deploy manifest not found. Run detection first.');
    }

    const branch = buildId;
    const projectName = process.env.CF_PAGES_PROJECT || 'sheenapps-preview';
    let chosenTarget = manifest.target;

    // Supabase OAuth Environment Variable Injection
    let supabaseEnvVars: Record<string, string> = {};
    if (manifest.supabaseIntegration?.hasSupabase && userId && sheenProjectId) {
      try {
        const envVars = await this.supabaseIntegration.injectSupabaseEnvVars(
          manifest.supabaseIntegration,
          chosenTarget,
          userId,
          sheenProjectId
        );
        // Convert DeploymentEnvVars to Record<string, string>
        supabaseEnvVars = Object.fromEntries(
          Object.entries(envVars).filter(([_, value]) => value !== undefined)
        ) as Record<string, string>;
        console.log('✅ Supabase environment variables injected for deployment');
      } catch (error) {
        if ((error as Error).message.includes('FALLBACK_TO_MANUAL')) {
          console.log('⚠️ OAuth credentials unavailable, using manual configuration');
        } else {
          console.error('❌ Supabase environment injection failed:', (error as Error).message);
          throw error;
        }
      }
    }

    console.log(`[Deploy] Starting ${chosenTarget} deployment for project: ${projectName}`);

    let deploymentResult: DeploymentResult;

    if (chosenTarget === 'pages-static') {
      deploymentResult = await this.deployStatic(projectPath, projectName, branch, supabaseEnvVars);
    } else if (chosenTarget === 'pages-edge') {
      deploymentResult = await this.deployEdge(projectPath, projectName, branch, supabaseEnvVars, manifest);
    } else if (chosenTarget === 'workers-node') {
      deploymentResult = await this.deployWorkers(projectPath, branch, supabaseEnvVars);
    } else {
      throw new Error(`Unknown target: ${chosenTarget}`);
    }

    console.log(`[Deploy] ${chosenTarget} deployment completed successfully:`, {
      url: deploymentResult.deployedUrl,
      target: deploymentResult.target,
      switched: deploymentResult.switched,
      deploymentId: deploymentResult.deploymentId
    });

    // Log deployment completion to unified system
    if (userId && sheenProjectId) {
      unifiedLogger.deploy(buildId, userId, sheenProjectId, 'completed', `Cloudflare deployment completed successfully`, deploymentResult.deploymentId, {
        deployedUrl: deploymentResult.deployedUrl,
        target: deploymentResult.target,
        switched: deploymentResult.switched,
        framework: 'cloudflare-three-lane'
      });
    }

    return deploymentResult;
  }

  /**
   * Deploy to Pages Static
   */
  private async deployStatic(
    projectPath: string,
    projectName: string,
    branch: string,
    supabaseEnvVars: Record<string, string>
  ): Promise<DeploymentResult> {
    console.log('[Deploy Static] Initializing Pages Static deployment...');
    let buildDir = this.findBuildDir(['out', 'dist', 'build'], projectPath);
    if (!buildDir) {
      // Try to auto-build if Next.js is detected
      const isNext = await this.isNextProject(projectPath);
      if (isNext) {
        console.log('🔧 No build output found, attempting to build Next.js project...');
        try {
          await this.runCapture('npm', ['run', 'build'], projectPath);
          const newBuildDir = this.findBuildDir(['out', 'dist', 'build'], projectPath);
          if (!newBuildDir) {
            throw new Error('Build completed but no static output found. Ensure output: "export" is configured in next.config.js');
          }
          console.log('✅ Build completed successfully');
          buildDir = newBuildDir;
        } catch (buildError) {
          throw new Error(`Build failed: ${(buildError as Error).message}. Please run the build manually and ensure static export is configured.`);
        }
      } else {
        throw new Error('No static output found. Run next export or SPA build first.');
      }
    }

    // Build deploy command with Supabase environment variables
    const finalBuildDir = buildDir || this.findBuildDir(['out', 'dist', 'build'], projectPath);
    if (!finalBuildDir) {
      throw new Error('Build directory not found after build attempt');
    }

    // Filter environment variables based on target allowlist
    const filteredEnvVars = this.filterEnvVars(supabaseEnvVars, 'pages-static');

    const deployArgs = ['pages', 'deploy', finalBuildDir, '--project-name', projectName, '--branch', branch];
    // REMOVED: --env not supported by pages deploy command
    // Environment variables for Pages must be configured via Dashboard or wrangler.toml

    // Safe logging of command
    this.safeLog('Pages Static Deploy', 'wrangler', deployArgs);

    console.log('[Deploy Static] Executing wrangler pages deploy command...');
    const result = await this.runWranglerJSON(deployArgs, projectPath);
    console.log('[Deploy Static] Wrangler command completed, processing result...');
    const deployedUrl = result.url || result.deployment_url || result.preview_url;
    const deploymentId = result.id || result.deployment_id;

    if (!deployedUrl) {
      throw new Error('Failed to extract deployment URL from JSON response');
    }

    console.log('[Deploy Static] Pages Static deployment successful:', { deployedUrl, deploymentId });

    return {
      deployedUrl,
      target: 'pages-static',
      output: JSON.stringify(result),
      deploymentId
    };
  }

  /**
   * Deploy to Pages Edge
   */
  private async deployEdge(
    projectPath: string,
    projectName: string,
    branch: string,
    supabaseEnvVars: Record<string, string>,
    manifest: DeploymentManifest
  ): Promise<DeploymentResult> {
    console.log('[Deploy Edge] Initializing Pages Edge deployment...');

    // ✅ NEW: Pre-deployment validation for edge compatibility
    console.log('[Deploy Edge] Running pre-deployment validation...');
    await this.validatePagesEdgeCompatibility(projectPath);

    console.log('[Deploy Edge] Building with @cloudflare/next-on-pages...');
    const buildOutput = await this.runCapture('npx', ['--yes', '@cloudflare/next-on-pages@latest'], projectPath);

    // Build log safety net - check for Edge-incompatible patterns
    console.log('[Deploy Edge] Checking build output for Edge compatibility...');
    const edgeIncompatible = /(node:fs|node:crypto|child_process|unsupported in the Edge)/i;
    if (edgeIncompatible.test(buildOutput)) {
      console.log('[Deploy Edge] ⚠️ Build log indicates Edge-incompatible usage → switching to Workers');

      // Update manifest with actual deployed target
      const updatedManifest = {
        ...manifest,
        target: 'workers-node' as const,
        switched: true,
        switchReason: 'Build log detected Edge-incompatible code'
      };
      await this.updateManifest(projectPath, updatedManifest);

      console.log('[Deploy Edge] Rebuilding with @opennextjs/cloudflare for Workers...');
      await runOpenNextBuild(projectPath);

      // Workers deployment with filtered environment variables (including service keys)
      const filteredEnvVars = this.filterEnvVars(supabaseEnvVars, 'workers-node');

      // Detect preview mode and build complete environment variable set
      const isPreview = /^build-/.test(branch) || process.env.SHEEN_PREVIEW === 'true';
      const deploymentEnvVars = await this.buildDeploymentEnvVars(projectPath, filteredEnvVars, isPreview);

      const deployArgs = ['deploy', '.open-next/worker.js', '--name', 'sheenapps-preview', '--compatibility-flag', 'nodejs_compat', '--compatibility-date', '2024-09-23', '--var', `SHEEN_BUILD_ID:${branch}`];

      Object.entries(deploymentEnvVars).forEach(([key, value]) => {
        deployArgs.push('--var', `${key}:${value}`);
      });

      // Safe logging of command
      this.safeLog('Workers Deploy (switched from Edge)', 'wrangler', deployArgs);

      console.log('[Deploy Edge] Executing wrangler deploy to Workers (switched from Edge)...');
      const result = await this.runWranglerJSON(deployArgs, projectPath);
      console.log('[Deploy Edge] Workers deployment completed, processing result...');
      const deployedUrl = result.url || result.deployment_url || result.preview_url;
      const deploymentId = result.id || result.deployment_id;

      if (!deployedUrl) {
        throw new Error('Failed to extract deployment URL from JSON response');
      }

      console.log('[Deploy Edge] Workers deployment successful (switched from Edge):', { deployedUrl, deploymentId });

      return {
        deployedUrl,
        target: 'workers-node',
        switched: true,
        switchReason: 'Build log detected Edge-incompatible code',
        output: JSON.stringify(result),
        deploymentId
      };
    } else {
      console.log('[Deploy Edge] Build compatible with Edge Runtime, proceeding with Pages Edge deployment...');
      // Pages Edge deployment with filtered environment variables
      const filteredEnvVars = this.filterEnvVars(supabaseEnvVars, 'pages-edge');

      const deployArgs = ['pages', 'deploy', '.vercel/output/static', '--project-name', projectName, '--branch', branch];
      // REMOVED: --env not supported by pages deploy command
      // Environment variables for Pages must be configured via Dashboard or wrangler.toml

      // Safe logging of command
      this.safeLog('Pages Edge Deploy', 'wrangler', deployArgs);

      console.log('[Deploy Edge] Executing wrangler pages deploy for Edge Runtime...');
      const result = await this.runWranglerJSON(deployArgs, projectPath);
      console.log('[Deploy Edge] Pages Edge deployment completed, processing result...');
      const deployedUrl = result.url || result.deployment_url || result.preview_url;
      const deploymentId = result.id || result.deployment_id;

      if (!deployedUrl) {
        throw new Error('Failed to extract deployment URL from JSON response');
      }

      console.log('[Deploy Edge] Pages Edge deployment successful:', { deployedUrl, deploymentId });

      return {
        deployedUrl,
        target: 'pages-edge',
        output: JSON.stringify(result),
        deploymentId
      };
    }
  }

  /**
   * Validate pages-edge compatibility before deployment
   * Warn about Node.js built-ins that won't work in Edge Runtime
   */
  private async validatePagesEdgeCompatibility(projectPath: string): Promise<void> {
    const path = await import('node:path');
    const fs = await import('node:fs');
    const { glob } = await import('glob');

    try {
      // Check for Node.js built-ins that won't work in Edge Runtime
      const sourceFiles = await glob('app/**/*.@(ts|tsx|js|mjs|cjs)', { cwd: projectPath });
      const edgeWarnings: string[] = [];

      for (const sourceFile of sourceFiles) {
        const fullPath = path.join(projectPath, sourceFile);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');

          // Check for Node.js built-ins that are problematic in Edge Runtime
          const nodeBuiltinPattern = /from\s+["']node:/;
          const processEnvPattern = /process\.env(?!\.NODE_ENV)/; // Allow NODE_ENV, warn about others

          if (nodeBuiltinPattern.test(content) || processEnvPattern.test(content)) {
            edgeWarnings.push(sourceFile);
          }
        }
      }

      if (edgeWarnings.length > 0) {
        console.warn('[Deploy Edge] ⚠️ POTENTIAL EDGE COMPATIBILITY ISSUES:');
        console.warn('[Deploy Edge] The following files may have Edge Runtime compatibility issues:');
        edgeWarnings.forEach(file => console.warn(`   - ${file}`));
        console.warn('');
        console.warn('[Deploy Edge] 💡 COMMON ISSUES:');
        console.warn('   - Node.js built-ins (node:fs, node:crypto, etc.) are not available');
        console.warn('   - process.env access should be minimal (prefer build-time env vars)');
        console.warn('   - File system operations are not available');
        console.warn('');
        console.warn('[Deploy Edge] 🔧 IF DEPLOYMENT FAILS:');
        console.warn('   - Consider switching to workers-node lane for Node.js compatibility');
        console.warn('   - Or refactor code to use Edge-compatible alternatives');
        console.warn('');
        console.warn('[Deploy Edge] Proceeding with deployment - @cloudflare/next-on-pages will attempt build...');
      } else {
        console.log('[Deploy Edge] ✅ No obvious Edge compatibility issues detected');
      }

    } catch (error) {
      // Don't fail deployment for validation errors - just warn
      console.warn('[Deploy Edge] ⚠️ Pre-deployment validation failed:', error);
      console.warn('[Deploy Edge] Continuing with deployment...');
    }
  }

  /**
   * Validate workers-node compatibility before deployment
   * Expert recommendation: Catch edge/workers conflicts early with clear error messages
   */
  private async validateWorkersNodeCompatibility(projectPath: string): Promise<void> {
    const path = await import('node:path');
    const fs = await import('node:fs');
    const { glob } = await import('glob');

    try {
      // Check for edge runtime markers in API routes (exact issue from expert analysis)
      const apiRoutes = await glob('app/api/**/route.@(ts|tsx|js|mjs|cjs)', { cwd: projectPath });
      const edgeConflicts: string[] = [];

      for (const routeFile of apiRoutes) {
        const fullPath = path.join(projectPath, routeFile);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');

          // Detect edge runtime markers (exact patterns from expert analysis)
          if (/export\s+const\s+runtime\s*=\s*["']edge["']/.test(content) ||
              /runtime\s*:\s*["']edge["']/.test(content)) {
            edgeConflicts.push(routeFile);
          }
        }
      }

      if (edgeConflicts.length > 0) {
        console.error('[Deploy Workers] ❌ VALIDATION FAILED: Edge runtime conflict detected');
        console.error('[Deploy Workers] The following API routes use edge runtime, which is incompatible with workers-node:');
        edgeConflicts.forEach(file => console.error(`   - ${file}`));
        console.error('');
        console.error('[Deploy Workers] 🔧 FIX OPTIONS:');
        console.error('   1. Remove or comment out: export const runtime = "edge"');
        console.error('   2. Change to: export const runtime = "nodejs"');
        console.error('   3. Or deploy to pages-edge lane instead of workers-node');
        console.error('');
        console.error('[Deploy Workers] 💡 WHY: Workers Node.js runtime cannot execute edge-only code');
        console.error('[Deploy Workers] This would cause deployment failure or 404 errors');

        throw new Error(`Edge runtime conflict: ${edgeConflicts.length} API route(s) use edge runtime but deploying to workers-node lane. See details above.`);
      }

      console.log('[Deploy Workers] ✅ Validation passed: No edge/workers conflicts detected');

    } catch (error) {
      if (error instanceof Error && error.message.includes('Edge runtime conflict')) {
        // Re-throw our validation errors with full context
        throw error;
      }

      // Handle other validation errors gracefully
      console.warn('[Deploy Workers] ⚠️ Pre-deployment validation failed:', error);
      console.warn('[Deploy Workers] Continuing with deployment - OpenNext will catch any remaining issues');
    }
  }

  /**
   * Auto-heal edge runtime conflicts by rewriting to nodejs runtime
   * Friend's recommendation: Turn validation failures into guided automatic fixes
   */
  private async autoHealEdgeApiRuntime(projectPath: string): Promise<{ patched: string[] }> {
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const fssync = await import('node:fs');
    const { glob } = await import('glob');

    const matches = await glob('app/api/**/route.@(ts|tsx|js|jsx|mjs|cjs)', { cwd: projectPath });
    const patched: string[] = [];

    for (const rel of matches) {
      const abs = path.join(projectPath, rel);
      if (!fssync.existsSync(abs)) continue;

      const src = await fs.readFile(abs, 'utf8');
      if (!/runtime\s*[:=]\s*["']edge["']/.test(src)) continue;

      const out = src
        // canonical export style
        .replace(/export\s+const\s+runtime\s*=\s*["']edge["']/g, `export const runtime = "nodejs"`)
        // pages-router style config object on routes (rare, but be safe)
        .replace(/runtime\s*:\s*["']edge["']/g, `runtime: "nodejs"`);

      if (out !== src) {
        await fs.writeFile(abs, out, 'utf8');
        patched.push(rel);
        console.log(`[AutoHeal] ✅ Rewrote edge → nodejs in ${rel}`);
      }
    }

    if (patched.length === 0) {
      console.log('[AutoHeal] No edge runtime beacons found to patch in app/api/**/route.*');
    } else {
      console.log(`[AutoHeal] 🔧 Successfully patched ${patched.length} API route(s) for workers-node compatibility`);
      // Bust any naive build caches that key off mtime
      try {
        fssync.utimesSync(projectPath, new Date(), new Date());
      } catch (e) {
        // Ignore cache bust failures
      }
    }

    return { patched };
  }

  /**
   * Ensure workers-node lane coherence (types and configs)
   * Friend's recommendation: Keep lane beacons coherent
   */
  private async ensureWorkersNodeCoherence(projectPath: string): Promise<void> {
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const fssync = await import('node:fs');

    try {
      // tsconfig: ensure "types": ["node"]
      const tscPath = path.join(projectPath, 'tsconfig.json');
      if (fssync.existsSync(tscPath)) {
        const json = JSON.parse(await fs.readFile(tscPath, 'utf8'));
        const types = json.compilerOptions?.types ?? [];
        if (!types.includes('node')) {
          json.compilerOptions = json.compilerOptions || {};
          json.compilerOptions.types = [...new Set([...types, 'node'])];
          await fs.writeFile(tscPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
          console.log('[Coherence] ✅ Added "node" types to tsconfig.json');
        }
      }

      // next.config.*: remove output:"export" if present (that's static-only)
      for (const file of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
        const configPath = path.join(projectPath, file);
        if (!fssync.existsSync(configPath)) continue;

        const src = await fs.readFile(configPath, 'utf8');
        if (/output\s*:\s*["']export["']/.test(src)) {
          const out = src.replace(/output\s*:\s*["']export["']\s*,?/, ''); // simple removal
          await fs.writeFile(configPath, out, 'utf8');
          console.log(`[Coherence] ✅ Removed output:"export" from ${file}`);
          break;
        }
      }

      console.log('[Coherence] ✅ Workers-node coherence check completed');

    } catch (error) {
      console.warn('[Coherence] ⚠️ Coherence check failed (continuing anyway):', error);
    }
  }

  /**
   * Deploy to Workers with Node.js compatibility
   */
  private async deployWorkers(
    projectPath: string,
    branch: string,
    supabaseEnvVars: Record<string, string>
  ): Promise<DeploymentResult> {
    console.log('[Deploy Workers] Initializing Workers deployment...');

    // ✅ NEW: Pre-deployment validation with auto-healing (friend's recommendation)
    console.log('[Deploy Workers] Running pre-deployment validation...');
    try {
      await this.validateWorkersNodeCompatibility(projectPath);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('Edge runtime conflict')) {
        console.log('[Deploy Workers] 🔧 Attempting automatic remediation (edge → nodejs in API routes)...');
        const { patched } = await this.autoHealEdgeApiRuntime(projectPath);

        if (patched.length === 0) {
          console.error('[Deploy Workers] ❌ Auto-healing found no edge runtime markers to fix');
          throw e; // nothing to fix; bubble up original error
        }

        // Re-run validation after the patch
        console.log('[Deploy Workers] Re-validating after auto-healing...');
        await this.validateWorkersNodeCompatibility(projectPath);
        console.log('[Deploy Workers] ✅ Remediation succeeded; continuing with deployment');
      } else {
        throw e; // unrelated failure
      }
    }

    // ✅ NEW: Ensure lane coherence (types and configs)
    console.log('[Deploy Workers] Ensuring workers-node lane coherence...');
    await this.ensureWorkersNodeCoherence(projectPath);

    console.log('[Deploy Workers] Building with @opennextjs/cloudflare...');
    await runOpenNextBuild(projectPath);

    // Workers deployment with filtered environment variables (including service keys)
    const filteredEnvVars = this.filterEnvVars(supabaseEnvVars, 'workers-node');

    // Detect preview mode and build complete environment variable set
    const isPreview = /^build-/.test(branch) || process.env.SHEEN_PREVIEW === 'true';
    const deploymentEnvVars = await this.buildDeploymentEnvVars(projectPath, filteredEnvVars, isPreview);

    const deployArgs = ['deploy', '.open-next/worker.js', '--name', 'sheenapps-preview', '--compatibility-flag', 'nodejs_compat', '--compatibility-date', '2024-09-23', '--var', `SHEEN_BUILD_ID:${branch}`];

    Object.entries(deploymentEnvVars).forEach(([key, value]) => {
      deployArgs.push('--var', `${key}:${value}`);
    });

    // Safe logging of command
    this.safeLog('Workers Deploy', 'wrangler', deployArgs);

    console.log('[Deploy Workers] Executing wrangler deploy...');
    const result = await this.runWranglerJSON(deployArgs, projectPath);
    console.log('[Deploy Workers] Wrangler deployment completed, processing result...');
    const deployedUrl = result.url || result.deployment_url || result.preview_url;
    const deploymentId = result.id || result.deployment_id;

    if (!deployedUrl) {
      throw new Error('Failed to extract deployment URL from JSON response');
    }

    console.log('[Deploy Workers] Workers deployment successful:', { deployedUrl, deploymentId });

    return {
      deployedUrl,
      target: 'workers-node',
      output: JSON.stringify(result),
      deploymentId
    };
  }

  /**
   * Save deployment manifest
   */
  async saveManifest(projectPath: string, detection: DetectionResult): Promise<void> {
    const manifest: DeploymentManifest = {
      target: detection.target,
      reasons: detection.reasons,
      notes: detection.notes,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      supabaseIntegration: detection.supabaseIntegration,
      switched: detection.switched,
      switchReason: detection.switchReason
    };

    const sheenappsDir = path.join(projectPath, '.sheenapps');
    await fsPromises.mkdir(sheenappsDir, { recursive: true });

    const manifestPath = path.join(sheenappsDir, 'deploy-target.json');
    await fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Update existing manifest
   */
  private async updateManifest(projectPath: string, updatedManifest: DeploymentManifest): Promise<void> {
    // ✅ FIXED: Use projectPath directly for manifest path (avoid Next-only resolver)
    const manifestPath = path.join(projectPath, '.sheenapps', 'deploy-target.json');
    await fsPromises.writeFile(manifestPath, JSON.stringify(updatedManifest, null, 2));
  }

  /**
   * Fast pattern detection using ripgrep + git fallback
   */
  async checkForPattern(cwd: string, dirGlobs: string[], needles: string[]): Promise<boolean> {
    // Triple fallback: ripgrep → git → filesystem glob
    const viaRg = this.tryRipgrep(cwd, dirGlobs, needles);
    if (viaRg !== null) return viaRg;

    const viaGit = await this.scanWithGit(cwd, dirGlobs, needles);
    if (viaGit !== null) return viaGit;

    return await this.scanWithFSGlob(cwd, dirGlobs, needles);
  }

  /**
   * Try ripgrep for pattern detection
   */
  private tryRipgrep(cwd: string, dirGlobs: string[], needles: string[]): boolean | null {
    const args = ["-n", "--no-messages", "-S", "--fixed-strings"];
    dirGlobs.forEach(g => args.push("-g", g));
    needles.forEach(n => args.push("-e", n));
    const rg = spawnSync("rg", args, { cwd, encoding: "utf8" });
    if (rg.status === 0) return true;     // match found
    if (rg.status === 1) return false;    // no match
    return null;                          // ripgrep unavailable
  }

  /**
   * Scan with git for pattern detection
   */
  private async scanWithGit(cwd: string, dirGlobs: string[], needles: string[]): Promise<boolean | null> {
    const git = spawnSync("git", ["ls-files", "-z"], { cwd, encoding: "utf8" });
    if (git.status !== 0) return null; // git failed, try final fallback

    const prefixList = dirGlobs.map(g => g.replace("/**", "/").replace("*", ""));
    const files = git.stdout.split("\0").filter(f =>
      /\.(js|ts|jsx|tsx)$/.test(f) &&
      prefixList.some(p => f.startsWith(p))
    );

    const needleRE = new RegExp(needles.map(n =>
      n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("|"));

    for (const f of files) {
      try {
        const stream = require('fs').createReadStream(`${cwd}/${f}`, { encoding: "utf8" });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        for await (const line of rl) {
          if (needleRE.test(line)) {
            rl.close();
            stream.close();
            return true;
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
    return false;
  }

  /**
   * Scan with filesystem glob for pattern detection
   */
  private async scanWithFSGlob(cwd: string, dirGlobs: string[], needles: string[]): Promise<boolean> {
    const files: string[] = [];

    async function walkDir(dir: string) {
      try {
        const entries = await fsPromises.readdir(path.join(cwd, dir), { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walkDir(path.join(dir, entry.name));
          } else if (entry.isFile() && /\.(js|ts|jsx|tsx)$/.test(entry.name)) {
            files.push(path.join(dir, entry.name));
          }
        }
      } catch {
        // ignore errors
      }
    }

    for (const glob of dirGlobs) {
      const baseDir = glob.replace('/**', '').replace('*', '');
      await walkDir(baseDir);
    }

    const needleRE = new RegExp(needles.map(n =>
      n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("|"));

    for (const f of files) {
      try {
        const stream = require('fs').createReadStream(path.join(cwd, f), { encoding: "utf8" });
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        for await (const line of rl) {
          if (needleRE.test(line)) {
            rl.close();
            stream.close();
            return true;
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
    return false;
  }

  /**
   * Check if a file path represents edge-bound code that executes on Edge runtime
   */
  private isEdgeBoundFile(relPath: string): boolean {
    // Files that actually execute on Edge runtime
    return (
      /^middleware\.(t|j)sx?$/i.test(relPath) ||
      /^app\/api\/.+\/route\.(t|j)sx?$/i.test(relPath)
    );
  }

  /**
   * Check if a Node signal is credible (has specific file info, not fallback detection)
   */
  private isCredibleNodeSignal(signal: NodeSignal): boolean {
    // Discard vague fallback hits that don't provide actionable file information
    return !!signal.file && signal.file !== '(detection method could not determine file)';
  }

  /**
   * Enhanced Node built-ins detection with file/line information (EXPERT FIX)
   */
  async checkForNodeBuiltins(cwd: string, globs: string[]): Promise<NodeSignal[]> {
    const nodePatterns = [
      "from 'node:", 'from "node:', "require('node:", 'require("node:',
      "from 'fs'", 'from "fs"', "require('fs'", 'require("fs"', 'child_process'
    ];

    const signals: NodeSignal[] = [];

    // Try ripgrep first (fastest and most accurate)
    try {
      for (const pattern of nodePatterns) {
        const rgArgs = [
          '--line-number',
          '--no-heading',
          '--fixed-strings'
        ];

        // Add glob patterns
        globs.forEach(g => {
          rgArgs.push('--glob', g);
        });

        rgArgs.push(pattern, cwd);

        const result = await this.runCapture('rg', rgArgs, cwd);

        if (result.trim()) {
          const lines = result.trim().split('\n');
          for (const line of lines) {
            const match = line.match(/^([^:]+):(\d+):(.*)$/);
            if (match && match[1] && match[2] && match[3]) {
              signals.push({
                file: path.relative(cwd, match[1]),
                line: parseInt(match[2], 10),
                match: match[3].trim()
              });
            }
          }
        }
      }
    } catch (rgError) {
      // Fallback to basic pattern detection if ripgrep fails
      console.warn('[ThreeLane] ripgrep failed for Node built-ins detection, using fallback');
      const hasNodeBuiltins = await this.checkForPattern(cwd, globs, nodePatterns);
      if (hasNodeBuiltins) {
        signals.push({
          file: '(detection method could not determine file)',
          line: 0,
          match: 'Node built-ins detected (fallback detection)'
        });
      }
    }

    // Limit output size (expert recommendation)
    return signals.slice(0, 10);
  }

  /**
   * Regex fallback for edge runtime detection (handles unusual formatting)
   */
  private async scanForEdgeRuntimeRegex(cwd: string, dirGlobs: string[]): Promise<boolean> {
    const edgeRuntimeRegex = /export\s+const\s+runtime\s*=\s*['"]edge['"]/;
    const pagesConfigRegex = /export\s+const\s+config\s*=\s*{[^}]*runtime\s*:\s*['"]edge['"][^}]*}/s;

    // Try git first, then filesystem fallback
    const { spawnSync } = await import('node:child_process');
    const git = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' });

    let files: string[] = [];
    if (git.status === 0) {
      const prefixList = dirGlobs.map(g => g.replace('/**', '/').replace('*', ''));
      files = git.stdout.split('\0').filter(f =>
        /\.(js|ts|jsx|tsx)$/.test(f) &&
        prefixList.some(p => f.startsWith(p))
      );
    } else {
      // Filesystem fallback
      for (const glob of dirGlobs) {
        const baseDir = glob.replace('/**', '').replace('*', '');
        await this.walkDirForFiles(path.join(cwd, baseDir), (f: string) => {
          if (/\.(js|ts|jsx|tsx)$/.test(f)) {
            files.push(path.relative(cwd, f));
          }
        });
      }
    }

    for (const f of files) {
      try {
        const content = await fsPromises.readFile(path.join(cwd, f), 'utf8');
        if (edgeRuntimeRegex.test(content) || pagesConfigRegex.test(content)) {
          return true;
        }
      } catch {
        // Skip files that can't be read
      }
    }
    return false;
  }

  /**
   * Walk directory for files (helper for regex scanning)
   */
  private async walkDirForFiles(dir: string, onFile: (abs: string) => void): Promise<void> {
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await this.walkDirForFiles(abs, onFile);
        } else {
          onFile(abs);
        }
      }
    } catch {
      // Missing dirs are fine
    }
  }

  /**
   * Check for PPR (Partial Prerendering) in Next.js config
   */
  private async checkForPPR(projectPath: string): Promise<boolean> {
    const configFiles = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
    for (const file of configFiles) {
      const content = await this.readFileIfExists(path.join(projectPath, file));
      if (/partial|ppr|partial.*prerender/i.test(content)) return true;
    }
    return false;
  }

  /**
   * Check Next.js config for specific patterns
   */
  private async checkNextConfig(projectPath: string, pattern: string): Promise<boolean> {
    const configFiles = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
    const regex = new RegExp(pattern, 'i');

    for (const file of configFiles) {
      const content = await this.readFileIfExists(path.join(projectPath, file));
      if (regex.test(content)) return true;
    }
    return false;
  }

  /**
   * Check if project is Next.js
   */
  private async isNextProject(projectPath: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fsPromises.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      return !!(packageJson.dependencies?.next || packageJson.devDependencies?.next);
    } catch {
      return false;
    }
  }

  /**
   * Get Next.js major version
   */
  private async getNextMajorVersion(projectPath: string): Promise<number | null> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const content = await fsPromises.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      const version = packageJson.dependencies?.next || packageJson.devDependencies?.next;
      if (version) {
        const match = version.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check for manual override configuration
   */
  private async checkManualOverride(projectPath: string): Promise<{ deployTarget: 'pages-static' | 'pages-edge' | 'workers-node' } | null> {
    const overrideFile = path.join(projectPath, '.sheenapps/config.json');
    const content = await this.readFileIfExists(overrideFile);
    if (content) {
      try {
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Find build directory
   */
  private findBuildDir(possibleDirs: string[], projectPath: string): string | null {
    for (const dir of possibleDirs) {
      const fullPath = path.join(projectPath, dir);
      try {
        require('fs').accessSync(fullPath, require('fs').constants.F_OK);
        return fullPath;
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Resolve command path with fallbacks
   */
  private resolveCommand(cmd: string): string {
    if (cmd === 'wrangler') {
      // Try multiple paths for wrangler
      const possiblePaths = [
        process.env.WRANGLER_PATH,
        '/opt/homebrew/bin/wrangler',
        '/usr/local/bin/wrangler',
        'wrangler' // Global PATH lookup
      ].filter(Boolean);

      for (const path of possiblePaths) {
        try {
          require('child_process').execSync(`which ${path}`, { stdio: 'ignore' });
          return path!;
        } catch {
          continue;
        }
      }

      // Fallback to global command
      return 'wrangler';
    }
    return cmd;
  }

  /**
   * Detect environment variables used in the project
   * Simplified approach: scan common Next.js files for process.env.* patterns
   */
  private async detectEnvironmentVars(projectPath: string): Promise<Set<string>> {
    const fs = require('node:fs');
    const path = require('node:path');
    const detectedVars = new Set<string>();

    // Common files to scan for environment variables
    const commonFiles = [
      'app/page.tsx',
      'app/layout.tsx',
      'src/pages/index.tsx',
      'pages/index.tsx',
      'src/app/page.tsx'
    ];

    const appRoot = resolveAppRoot(projectPath);

    for (const filePattern of commonFiles) {
      const filePath = path.join(appRoot, filePattern);

      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');

          // Match process.env.VARIABLE_NAME patterns
          const matches = content.matchAll(/process\.env\.([A-Z0-9_]+)/g);
          for (const match of matches) {
            detectedVars.add(match[1]);
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Remove system/runtime vars we already handle
    ['NODE_ENV', 'SHEEN_BUILD_ID', 'CI', 'VERCEL', 'NETLIFY'].forEach(v => detectedVars.delete(v));

    if (detectedVars.size > 0) {
      console.log(`[EnvDetection] Detected environment variables: ${Array.from(detectedVars).join(', ')}`);
    }
    return detectedVars;
  }

  /**
   * Check if environment variable looks like a secret
   * Accounts for platform integrations (Supabase, Stripe, Sanity)
   */
  private isSecretLike(varName: string): boolean {
    // Platform integration secrets are handled by our OAuth system - not secrets for preview purposes
    const platformIntegrationVars = [
      /^SUPABASE_.*$/i,           // Handled by Supabase OAuth integration
      /^NEXT_PUBLIC_SUPABASE_/i,  // Public Supabase vars are safe
      /^STRIPE_.*$/i,             // Handled by Stripe integration
      /^SANITY_.*$/i,             // Handled by Sanity integration
      /^DATABASE_URL$/i           // Handled by database integrations
    ];

    // If it's a platform integration variable, it's not a "user secret" for our purposes
    if (platformIntegrationVars.some(pattern => pattern.test(varName))) {
      return false;
    }

    // These are user-defined secrets that we should never auto-configure
    const userSecretPatterns = [
      /API_KEY$/i, /SECRET$/i, /TOKEN$/i, /PASSWORD$/i, /PASS$/i,
      /_KEY$/i, /_SECRET$/i, /_TOKEN$/i, /_PASSWORD$/i,
      /^SECRET_/i, /^PRIVATE_/i,
      /CREDENTIAL/i, /AUTH_TOKEN/i, /SIGNING/i,
      /OPENAI_/i, /ANTHROPIC_/i,  // AI service keys
      /WEBHOOK_SECRET/i, /JWT_SECRET/i
    ];

    return userSecretPatterns.some(pattern => pattern.test(varName));
  }

  /**
   * Get preview defaults for detected environment variables
   * Only provides safe defaults for preview deployments, never for secrets
   */
  private getPreviewDefaults(detectedVars: Set<string>): { defaults: Record<string, string>, warnings: string[] } {
    const defaults: Record<string, string> = {};
    const warnings: string[] = [];

    for (const varName of detectedVars) {
      // NEVER provide defaults for secret-like variables
      if (this.isSecretLike(varName)) {
        warnings.push(`${varName} (appears to be a secret - requires explicit configuration)`);
        continue;
      }

      // Handle platform integration variables (these are handled by OAuth/integration system)
      if (varName.startsWith('SUPABASE_') || varName.startsWith('NEXT_PUBLIC_SUPABASE_')) {
        // Don't provide defaults - these are handled by Supabase OAuth integration
        warnings.push(`${varName} (managed by Supabase integration - configure via OAuth)`);
      } else if (varName.startsWith('STRIPE_')) {
        warnings.push(`${varName} (managed by Stripe integration - configure via dashboard)`);
      } else if (varName.startsWith('SANITY_')) {
        warnings.push(`${varName} (managed by Sanity integration - configure via dashboard)`);
      } else if (varName === 'DATABASE_URL') {
        warnings.push(`${varName} (managed by database integration - configure via dashboard)`);
      }
      // Handle common safe patterns with preview defaults
      else if (varName === 'HELLO_MESSAGE') {
        defaults[varName] = 'Hello from the server!';
      } else if (varName.startsWith('NEXT_PUBLIC_') && !varName.includes('SUPABASE')) {
        defaults[varName] = 'preview-value';
      } else if (varName === 'APP_NAME') {
        defaults[varName] = 'Preview App';
      } else if (varName === 'APP_VERSION') {
        defaults[varName] = '1.0.0-preview';
      } else if (varName.includes('TITLE')) {
        defaults[varName] = 'Preview Title';
      } else if (varName.includes('MESSAGE')) {
        defaults[varName] = 'Preview message';
      } else if (varName.includes('URL') && !varName.includes('SECRET')) {
        defaults[varName] = 'https://preview.example.com';
      } else if (varName.includes('PORT')) {
        defaults[varName] = '3000';
      } else {
        // For unknown variables, don't guess - add to warnings
        warnings.push(`${varName} (unknown variable - requires explicit configuration)`);
      }
    }

    if (Object.keys(defaults).length > 0) {
      console.log(`[EnvDefaults] Preview defaults applied: ${Object.keys(defaults).join(', ')}`);
    }

    if (warnings.length > 0) {
      console.warn(`[EnvDefaults] Variables requiring explicit configuration: ${warnings.join(', ')}`);
    }

    return { defaults, warnings };
  }

  /**
   * Build complete environment variable set for deployment
   * Combines detected vars with supplied values and preview defaults
   */
  private async buildDeploymentEnvVars(
    projectPath: string,
    suppliedVars: Record<string, string>,
    isPreview: boolean
  ): Promise<Record<string, string>> {
    const finalVars: Record<string, string> = { ...suppliedVars };

    if (isPreview) {
      // Detect environment variables used in the project
      const detectedVars = await this.detectEnvironmentVars(projectPath);

      // Get preview defaults for detected variables (with security checks)
      const { defaults: previewDefaults, warnings } = this.getPreviewDefaults(detectedVars);

      // Apply defaults only for vars that aren't already supplied
      for (const [key, defaultValue] of Object.entries(previewDefaults)) {
        if (!finalVars[key] && !process.env[key]) {
          finalVars[key] = defaultValue;
          console.log(`[EnvDefaults] Applied preview default: ${key}=${defaultValue}`);
        }
      }

      // Log warnings about variables that need explicit configuration
      if (warnings.length > 0) {
        console.warn(`[EnvSecurity] Environment variables detected that require explicit configuration:`);
        warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`));
        console.warn(`[EnvSecurity] These variables were not auto-configured for security reasons.`);
      }
    }

    return finalVars;
  }

  /**
   * Run wrangler command with robust text parsing and unified deploy logging
   */
  private async runWranglerJSON(args: string[], cwd: string = process.cwd(), env: NodeJS.ProcessEnv = {}): Promise<any> {
    const resolvedCmd = this.resolveCommand('wrangler');

    // All wrangler commands output text - we'll parse for URLs and success indicators
    const finalArgs = [...args];

    // Hard-disable interactivity/emoji/color
    const enhancedEnv = {
      WRANGLER_NON_INTERACTIVE: 'true',
      CI: '1',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      ...process.env,
      ...env
    };

    // Get build context for deploy logging
    // buildId is passed from method parameter, not environment variable
    const userId = process.env.SHEEN_USER_ID;
    const projectId = process.env.SHEEN_PROJECT_ID;

    // Log command execution start
    if (userId && projectId && this.currentBuildId) {
      unifiedLogger.deploy(this.currentBuildId, userId, projectId, 'stdout', `$ ${resolvedCmd} ${finalArgs.join(' ')}`, undefined, {
        command: 'wrangler',
        args: finalArgs,
        cwd
      });
    }

    const run = async (argv: string[]) => {
      const process = execa(resolvedCmd, argv, {
        env: enhancedEnv,
        timeout: 15 * 60_000,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd
      });

      // Stream stdout to deploy logs
      process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        if (userId && projectId && output.trim()) {
          // Log each line of stdout
          output.split('\n').filter(line => line.trim()).forEach((line: string) => {
            unifiedLogger.deploy(this.currentBuildId!, userId, projectId, 'stdout', line.trim(), undefined, {
              command: 'wrangler',
              source: 'stdout'
            });
          });
        }
        // Write to console stdout for immediate feedback
        console.log(output);
      });

      // Stream stderr to deploy logs
      process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        if (userId && projectId && output.trim()) {
          // Log each line of stderr
          output.split('\n').filter(line => line.trim()).forEach((line: string) => {
            unifiedLogger.deploy(this.currentBuildId!, userId, projectId, 'stderr', line.trim(), undefined, {
              command: 'wrangler',
              source: 'stderr'
            });
          });
        }
        // Write to console stderr for immediate feedback
        console.error(output);
      });

      return process;
    };

    // Execute wrangler command with text output parsing and streaming
    let stdout: string;
    try {
      console.log(`[Deploy Worker] Wrangler deploy starting: ${resolvedCmd} ${finalArgs.join(' ')}`);
      const res = await run(finalArgs);
      stdout = res.stdout ?? '';
    } catch (err: any) {
      console.error('[Deploy Worker] Wrangler deploy failed', {
        error: String(err),
        cmd: resolvedCmd,
        args: finalArgs
      });
      
      // Log deployment error
      if (userId && projectId) {
        unifiedLogger.deploy(this.currentBuildId!, userId, projectId, 'failed', `Wrangler deployment failed: ${String(err)}`, undefined, {
          command: 'wrangler',
          args: finalArgs,
          error: String(err)
        });
      }
      
      throw err;
    }

    // Parse text output for all wrangler commands (JSON not supported by deploy)
    const cleaned = this.stripAnsi(stdout).trim();

    // Check for successful deployment indicators
    const hasSuccess = /successfully published/i.test(cleaned) ||
                      /deployment complete/i.test(cleaned) ||
                      /published to/i.test(cleaned) ||
                      /uploaded.*deployed.*triggers/i.test(cleaned) ||
                      /current version id:/i.test(cleaned);

    // Extract URL from wrangler output (works for both Pages and Workers)
    const url =
      cleaned.match(/https:\/\/[^\s]+\.workers\.dev[^\s]*/i)?.[0] ||
      cleaned.match(/https:\/\/[^\s]+\.pages\.dev[^\s]*/i)?.[0] ||
      cleaned.match(/https:\/\/[^\s]+/i)?.[0] ||
      null;

    if (url) {
      console.log('[Deploy Worker] Wrangler deploy completed (text parsing)', {
        url: url,
        success: hasSuccess,
        raw_length: stdout.length
      });
      return {
        url,
        preview_url: url,
        deployment_url: url,
        success: hasSuccess,
        raw_output: stdout
      };
    }

    // No URL found - provide helpful error with output preview
    throw new Error(
      `Wrangler deploy completed but no URL found. Output preview: ${cleaned.slice(0, 300)}`
    );
  }

  // Small helpers for robust JSON parsing
  private stripAnsi(s: string): string {
    return s.replace(/\x1B\[[0-9;]*m/g, '');
  }

  private tryParseJSON(s: string): any | null {
    try { return JSON.parse(s); } catch { return null; }
  }

  /**
   * Run command and capture output (legacy method for non-wrangler commands)
   */
  private async runCapture(cmd: string, args: string[], cwd: string = process.cwd()): Promise<string> {
    const resolvedCmd = this.resolveCommand(cmd);

    try {
      const { stdout } = await execa(resolvedCmd, args, {
        cwd,
        timeout: 10 * 60_000, // 10 minute timeout
        stdio: ['ignore', 'pipe', 'pipe']
      });

      return stdout;
    } catch (error) {
      throw new Error(`${resolvedCmd} failed: ${String(error)}`);
    }
  }

  /**
   * Read file if exists, return empty string if not
   */
  private async readFileIfExists(filePath: string): Promise<string> {
    try {
      return await fsPromises.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Validate environment variables
   */
  private validateEnvironment(): void {
    const required = [
      'CF_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      'CF_API_TOKEN_WORKERS' // Alternative token name
    ];

    const accountId = process.env.CF_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN_WORKERS;

    if (!accountId) {
      throw new Error('Missing required environment variable: CF_ACCOUNT_ID');
    }

    if (!token) {
      throw new Error('Missing required environment variable: CLOUDFLARE_API_TOKEN or CF_API_TOKEN_WORKERS');
    }

    // Validate wrangler availability
    try {
      const resolvedWrangler = this.resolveCommand('wrangler');
      require('child_process').execSync(`${resolvedWrangler} --version`, { stdio: 'ignore' });
      console.log('✅ Cloudflare environment variables and Wrangler CLI validated');
    } catch (error) {
      throw new Error('Wrangler CLI not found. Please install with: npm install -g wrangler');
    }
  }

  /**
   * Post-deploy validation with lightweight smoke tests
   */
  async validateDeployment(deployedUrl: string): Promise<void> {
    if (!deployedUrl) {
      console.log('⚠️ No deployment URL captured, skipping validation');
      return;
    }

    const tests = [
      { path: '/', name: 'Homepage', required: true },
      { path: '/api/health', name: 'API Health', required: false },
      { path: '/_next/image?url=/test.jpg&w=100&q=75', name: 'Image Optimization', required: false }
    ];

    for (const test of tests) {
      try {
        // Add shorter timeout for resilience and check if fetch is available
        const timeoutMs = 5000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(`${deployedUrl}${test.path}`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Cloudflare-Three-Lane-Validator/1.0'
          }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`✅ ${test.name}: ${response.status}`);
        } else if (test.required) {
          throw new Error(`${test.name} failed: ${response.status}`);
        } else {
          console.log(`⚠️ ${test.name}: ${response.status} (optional)`);
        }
      } catch (error) {
        const errorMsg = (error as Error).message;
        if (test.required && !errorMsg.includes('AbortError') && !errorMsg.includes('timeout')) {
          throw error;
        }
        console.log(`⚠️ ${test.name}: ${errorMsg} (${test.required ? 'timeout ignored' : 'optional'})`);
      }
    }
  }

  /**
   * Update project with deployment lane information
   */
  async updateProjectDeploymentLane(
    projectId: string,
    detection: DetectionResult
  ): Promise<void> {
    if (!pool) {
      console.log('⚠️ Database not configured, skipping project deployment lane update');
      return;
    }

    try {
      const query = `
        UPDATE public.projects
        SET
          deployment_lane = $1,
          deployment_lane_detected_at = NOW(),
          deployment_lane_detection_origin = $2,
          deployment_lane_reasons = $3,
          deployment_lane_switched = $4,
          deployment_lane_switch_reason = $5,
          updated_at = NOW()
        WHERE id = $6
      `;

      await pool.query(query, [
        detection.target,
        detection.origin,
        detection.reasons,
        detection.switched || false,
        detection.switchReason || null,
        projectId
      ]);

      console.log(`✅ Project ${projectId} deployment lane updated: ${detection.target}`);
    } catch (error) {
      await this.loggingService.logCriticalError(
        'project_deployment_lane_update_failed',
        error as Error,
        { projectId, target: detection.target }
      );
    }
  }

  /**
   * Update project version with deployment lane information
   */
  async updateProjectVersionDeploymentLane(
    versionId: string,
    detection: DetectionResult,
    deploymentResult?: DeploymentResult
  ): Promise<void> {
    if (!pool) {
      console.log('⚠️ Database not configured, skipping version deployment lane update');
      return;
    }

    try {
      const query = `
        UPDATE public.project_versions
        SET
          deployment_lane = $1,
          deployment_lane_detected_at = NOW(),
          deployment_lane_detection_origin = $2,
          deployment_lane_reasons = $3,
          deployment_lane_switched = $4,
          deployment_lane_switch_reason = $5,
          final_deployment_url = $6,
          deployment_lane_manifest = $7
        WHERE version_id = $8
      `;

      const manifest = {
        target: detection.target,
        reasons: detection.reasons,
        notes: detection.notes,
        origin: detection.origin,
        supabaseIntegration: detection.supabaseIntegration,
        switched: detection.switched || deploymentResult?.switched,
        switchReason: detection.switchReason || deploymentResult?.switchReason,
        detectionTimestamp: new Date().toISOString(),
        deploymentTimestamp: deploymentResult ? new Date().toISOString() : null
      };

      await pool.query(query, [
        deploymentResult?.target || detection.target,
        detection.origin,
        detection.reasons,
        (detection.switched || deploymentResult?.switched) || false,
        detection.switchReason || deploymentResult?.switchReason || null,
        deploymentResult?.deployedUrl || null,
        JSON.stringify(manifest),
        versionId
      ]);

      console.log(`✅ Version ${versionId} deployment lane updated: ${deploymentResult?.target || detection.target}`);
    } catch (error) {
      await this.loggingService.logCriticalError(
        'version_deployment_lane_update_failed',
        error as Error,
        { versionId, target: detection.target }
      );
    }
  }

  /**
   * Get deployment lane analytics from database
   */
  async getDeploymentLaneAnalytics(): Promise<{
    totalDeployments: number;
    targetDistribution: Record<string, number>;
    switchRate: number;
    manualOverrideRate: number;
    recentDeployments: Array<{
      versionId: string;
      target: string;
      detectedAt: string;
      reasons: string[];
      switched: boolean;
    }>;
  }> {
    if (!pool) {
      return {
        totalDeployments: 0,
        targetDistribution: {},
        switchRate: 0,
        manualOverrideRate: 0,
        recentDeployments: []
      };
    }

    try {
      // Get analytics from the view
      const analyticsQuery = `
        SELECT * FROM public.deployment_lane_analytics
        WHERE deployment_lane != 'TOTAL'
        ORDER BY total_deployments DESC
      `;
      const analyticsResult = await pool.query(analyticsQuery);

      // Get recent deployments
      const recentQuery = `
        SELECT
          version_id,
          deployment_lane as target,
          deployment_lane_detected_at as detected_at,
          deployment_lane_reasons as reasons,
          deployment_lane_switched as switched
        FROM public.project_versions
        WHERE deployment_lane IS NOT NULL
        ORDER BY deployment_lane_detected_at DESC
        LIMIT 10
      `;
      const recentResult = await pool.query(recentQuery);

      // Get totals
      const totalsQuery = `
        SELECT * FROM public.deployment_lane_analytics
        WHERE deployment_lane = 'TOTAL'
      `;
      const totalsResult = await pool.query(totalsQuery);
      const totals = totalsResult.rows[0] || {};

      const targetDistribution: Record<string, number> = {};
      analyticsResult.rows.forEach(row => {
        targetDistribution[row.deployment_lane] = parseInt(row.total_deployments);
      });

      return {
        totalDeployments: parseInt(totals.total_deployments) || 0,
        targetDistribution,
        switchRate: parseFloat(totals.switch_rate_percentage) || 0,
        manualOverrideRate: parseFloat(totals.manual_override_percentage) || 0,
        recentDeployments: recentResult.rows.map(row => ({
          versionId: row.version_id,
          target: row.target,
          detectedAt: row.detected_at,
          reasons: row.reasons || [],
          switched: row.switched || false
        }))
      };
    } catch (error) {
      await this.loggingService.logCriticalError(
        'deployment_analytics_query_failed',
        error as Error,
        {}
      );

      return {
        totalDeployments: 0,
        targetDistribution: {},
        switchRate: 0,
        manualOverrideRate: 0,
        recentDeployments: []
      };
    }
  }
}
