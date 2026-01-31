import { Job, Worker } from 'bullmq';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import { ulid } from 'ulid';
import { getPnpmInstallCommand } from '../config/buildCache';
import { isDirectModeEnabled } from '../config/directMode';
import { setLatestVersion } from '../services/cloudflareKV';
import { createTarGzFromDirectory, deployToCloudflarePages, detectBuildOutput, getDeploymentStatus } from '../services/cloudflarePages';
import { getArtifactKey, uploadToR2, getRetentionPolicy } from '../services/cloudflareR2';
import { getDatabase } from '../services/database';
import { calculateSHA256, getFileSize, formatFileSize } from '../utils/checksums';
import { createProjectVersion, getLatestProjectVersion, listProjectVersions, updateProjectVersion } from '../services/databaseWrapper';
import { mockDeployToCloudflarePages, mockUploadToR2 } from '../services/directModeMocks';
import { commitVersion, initGitRepo, manageSlidingWindow } from '../services/gitDiff';
import { getInhouseDeploymentService, type BuildAsset } from '../services/inhouse/InhouseDeploymentService';
import type { BuildJobData, BuildJobResult, ClaudeGenerateResponse } from '../types/build';
import { getWebhookService } from '../services/webhookService';
import { getBusinessEventsService } from '../services/businessEventsService';
import { JobTracer, logger, metrics } from '../observability';
import { buildSDKContext, detectFeatureType } from '../services/ai/sdk-context';
import { getTemplate, type TemplateScaffold, type TemplateBudget } from '@sheenapps/templates';

// Default fallback when no template budget is available
const DEFAULT_MAX_BUILD_TIME_MINUTES = 10;
const MAX_BUILD_TIME = DEFAULT_MAX_BUILD_TIME_MINUTES * 60 * 1000; // 10 minutes
const MAX_OUTPUT_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_CMD_OUTPUT = 2 * 1024 * 1024; // 2 MB max captured output per command

// Artifact size limits
const MAX_ARTIFACT_SIZE = 1024 * 1024 * 1024; // 1 GB
const WARN_ARTIFACT_SIZE = 100 * 1024 * 1024; // 100 MB warning threshold

const EASY_MODE_WORKER_ENTRY = 'index.js';
const EASY_MODE_WORKER_CODE = `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const buildId = await env.PROJECT_BUILDS.get(env.PROJECT_ID);
    if (!buildId) {
      return new Response('Build not found', { status: 404 });
    }

    const pathname = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const normalizedPath = pathname.startsWith('/') ? pathname : '/' + pathname;
    const assetKey = \`builds/\${env.PROJECT_ID}/\${buildId}\${normalizedPath}\`;

    let asset = await env.ASSETS.get(assetKey);
    if (!asset) {
      const indexKey = \`builds/\${env.PROJECT_ID}/\${buildId}/index.html\`;
      asset = await env.ASSETS.get(indexKey);
    }

    if (!asset) {
      return new Response('Not found', { status: 404 });
    }

    const contentType = asset.httpMetadata?.contentType || 'text/html; charset=utf-8';
    return new Response(asset.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=0, must-revalidate'
      }
    });
  }
};
`;

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  map: 'application/json',
};

function getContentTypeForPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

async function collectBuildAssets(rootDir: string): Promise<BuildAsset[]> {
  const assets: BuildAsset[] = [];

  const walk = async (currentDir: string): Promise<void> => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      const assetPath = `/${relativePath}`;
      const content = await fs.readFile(fullPath);
      assets.push({
        path: assetPath,
        content,
        contentType: getContentTypeForPath(fullPath),
      });
    }
  };

  await walk(rootDir);
  return assets;
}

async function getProjectTemplateScaffold(projectId: string): Promise<TemplateScaffold | null> {
  try {
    const db = getDatabase();
    const result = await db.query(
      `SELECT config->'templateData'->'selection'->>'templateId' as template_id FROM projects WHERE id = $1`,
      [projectId]
    );
    const templateId = result.rows[0]?.template_id;
    if (!templateId) return null;
    const template = getTemplate(templateId);
    return template?.scaffold || null;
  } catch {
    return null;
  }
}

async function getProjectInfraMode(projectId: string): Promise<'easy' | 'pro' | null> {
  const db = getDatabase();
  const result = await db.query('SELECT infra_mode FROM projects WHERE id = $1', [projectId]);
  if (result.rows.length === 0) {
    return null;
  }
  const mode = result.rows[0]?.infra_mode as 'easy' | 'pro' | null | undefined;
  return mode || null;
}

/**
 * Get the template budget for a project.
 * Returns null if no template is set or template has no budget defined.
 */
async function getProjectTemplateBudget(projectId: string): Promise<TemplateBudget | null> {
  try {
    const db = getDatabase();
    const result = await db.query(
      `SELECT config->'templateData'->'selection'->>'templateId' as template_id FROM projects WHERE id = $1`,
      [projectId]
    );
    const templateId = result.rows[0]?.template_id;
    if (!templateId) return null;
    const template = getTemplate(templateId);
    return template?.budget || null;
  } catch {
    return null;
  }
}

/**
 * Get the maximum build time in milliseconds for a project.
 * Uses template budget if available, otherwise falls back to default.
 */
async function getProjectMaxBuildTime(projectId: string): Promise<number> {
  const budget = await getProjectTemplateBudget(projectId);
  if (budget?.maxBuildTime) {
    const timeoutMs = budget.maxBuildTime * 60 * 1000;
    logger.info({ projectId, maxBuildTimeMinutes: budget.maxBuildTime, timeoutMs }, '[Budget] Using template build time limit');
    return timeoutMs;
  }
  logger.info({ projectId, maxBuildTimeMinutes: DEFAULT_MAX_BUILD_TIME_MINUTES }, '[Budget] Using default build time limit');
  return MAX_BUILD_TIME;
}

// Default max steps when no template budget is available
const DEFAULT_MAX_STEPS = 50;

/**
 * Get the maximum build steps for a project.
 * Uses template budget if available, otherwise falls back to default.
 */
async function getProjectMaxSteps(projectId: string): Promise<number> {
  const budget = await getProjectTemplateBudget(projectId);
  if (budget?.maxSteps) {
    logger.info({ projectId, maxSteps: budget.maxSteps }, '[Budget] Using template step limit');
    return budget.maxSteps;
  }
  logger.info({ projectId, maxSteps: DEFAULT_MAX_STEPS }, '[Budget] Using default step limit');
  return DEFAULT_MAX_STEPS;
}

/**
 * Count tool calls in a line of Claude CLI JSON output.
 * Tool calls appear as:
 * - Events with type: 'tool_use'
 * - Assistant messages with content items having type: 'tool_use'
 */
function countToolCallsInLine(line: string): number {
  if (!line.trim()) return 0;

  try {
    const json = JSON.parse(line);

    // Direct tool_use event
    if (json.type === 'tool_use') {
      return 1;
    }

    // Assistant message with tool_use content items
    if (json.type === 'assistant' && json.message?.content) {
      const content = json.message.content;
      if (Array.isArray(content)) {
        return content.filter((item: any) => item.type === 'tool_use').length;
      }
    }

    // Tool result (indicates a tool call completed)
    if (json.type === 'tool_result') {
      return 1;
    }

    return 0;
  } catch {
    return 0;
  }
}

// Redis connection for worker
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
};

// Get Node and pnpm versions
async function getEnvironmentVersions() {
  const nodeVersion = process.version;
  let pnpmVersion = 'unknown';

  try {
    const { stdout } = await execCommand('pnpm --version');
    pnpmVersion = stdout.trim();
  } catch (error) {
    console.warn('Could not get pnpm version:', error);
  }

  return { nodeVersion, pnpmVersion };
}

// Execute command with proper timeout and output cap
// Note: spawn() doesn't support timeout option, so we implement it manually
function execCommand(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    logger.info({ command, cwd: cwd || 'default' }, '[execCommand] start');

    let killed = false;
    let stdout = '';
    let stderr = '';

    // Start in its own process group so we can kill the whole tree
    const child = spawn('sh', ['-c', command], {
      cwd,
      env: process.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const killTree = () => {
      if (killed) return;
      killed = true;
      try {
        // Negative PID kills the process group on *nix
        if (child.pid) {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch {
        // Process may already be dead
      }
    };

    // Manual timeout since spawn() doesn't support timeout option
    const timer = setTimeout(() => {
      killTree();
      reject(new Error(`Command timed out after ${MAX_BUILD_TIME}ms: ${command}`));
    }, MAX_BUILD_TIME);

    const append = (buf: Buffer, target: 'stdout' | 'stderr') => {
      const s = buf.toString();
      if (target === 'stdout') stdout += s;
      else stderr += s;

      // Cap memory to prevent unbounded growth from noisy builds
      if (stdout.length + stderr.length > MAX_CMD_OUTPUT) {
        stderr += '\n[execCommand] Output capped; truncating...\n';
        killTree();
        clearTimeout(timer);
        reject(new Error(`Command output exceeded ${MAX_CMD_OUTPUT} bytes: ${command}`));
      }
    };

    child.stdout?.on('data', (b) => append(b, 'stdout'));
    child.stderr?.on('data', (b) => append(b, 'stderr'));

    child.on('error', (err) => {
      clearTimeout(timer);
      killTree();
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        logger.info({ command, code }, '[execCommand] success');
        resolve({ stdout, stderr });
      } else {
        logger.error({ command, code, signal, stderr: stderr.slice(-4000) }, '[execCommand] failed');
        reject(new Error(`Command failed (code=${code}, signal=${signal}): ${stderr}`));
      }
    });
  });
}

// Write files from Claude response
async function writeProjectFiles(
  projectDir: string,
  files: Array<{ path: string; content: string }>
): Promise<void> {
  for (const file of files) {
    const filePath = path.join(projectDir, file.path);
    const fileDir = path.dirname(filePath);

    // Create directory if it doesn't exist
    await fs.mkdir(fileDir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, file.content, 'utf8');
  }
}

async function hasAnalyticsDependency(projectDir: string): Promise<boolean> {
  const packagePath = path.join(projectDir, 'package.json');
  try {
    const raw = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return Boolean(
      pkg.dependencies?.['@sheenapps/analytics']
      || pkg.devDependencies?.['@sheenapps/analytics']
      || pkg.peerDependencies?.['@sheenapps/analytics']
    );
  } catch {
    return false;
  }
}

async function ensureAnalyticsDependency(projectDir: string): Promise<boolean> {
  const packagePath = path.join(projectDir, 'package.json');
  try {
    const raw = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    if (
      pkg.dependencies?.['@sheenapps/analytics']
      || pkg.devDependencies?.['@sheenapps/analytics']
      || pkg.peerDependencies?.['@sheenapps/analytics']
    ) {
      return true;
    }
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies['@sheenapps/analytics'] = 'latest';
    await fs.writeFile(packagePath, JSON.stringify(pkg, null, 2), 'utf8');
    console.warn('[Analytics] Added @sheenapps/analytics to package.json');
    return true;
  } catch {
    return false;
  }
}

function createSourceFile(filePath: string, sourceText: string): ts.SourceFile {
  const ext = path.extname(filePath).toLowerCase();
  const scriptKind =
    ext === '.tsx' ? ts.ScriptKind.TSX :
    ext === '.jsx' ? ts.ScriptKind.JSX :
    ext === '.js' ? ts.ScriptKind.JS :
    ts.ScriptKind.TS;

  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
}

function applyEdits(sourceText: string, edits: Array<{ pos: number; text: string }>): string {
  const sorted = [...edits].sort((a, b) => b.pos - a.pos);
  let output = sourceText;
  for (const edit of sorted) {
    output = output.slice(0, edit.pos) + edit.text + output.slice(edit.pos);
  }
  return output;
}

function findLastImportEnd(sourceFile: ts.SourceFile): number {
  let last = 0;
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
      last = Math.max(last, statement.end);
    }
  }
  return last;
}

function hasNamedImport(sourceFile: ts.SourceFile, modulePath: string, named: string): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== modulePath) continue;
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    if (bindings.elements.some(el => el.name.text === named)) return true;
  }
  return false;
}

function findBodyJsxElement(sourceFile: ts.SourceFile): ts.JsxElement | null {
  let found: ts.JsxElement | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName;
      if (ts.isIdentifier(tag) && tag.text === 'body') {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function findFirstJsxElement(sourceFile: ts.SourceFile): ts.JsxElement | null {
  let found: ts.JsxElement | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isJsxElement(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function findComponentJsxNode(sourceFile: ts.SourceFile): ts.Node | null {
  let found: ts.Node | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName;
      if (ts.isIdentifier(tag) && tag.text === 'Component') {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

async function injectAppRouterAnalytics(layoutPath: string): Promise<boolean> {
  const sourceText = await fs.readFile(layoutPath, 'utf8');
  if (sourceText.includes('PageTracker') || sourceText.includes('@sheenapps/analytics')) {
    return false;
  }

  const sourceFile = createSourceFile(layoutPath, sourceText);
  const edits: Array<{ pos: number; text: string }> = [];

  if (!hasNamedImport(sourceFile, '@/components/analytics/page-tracker', 'PageTracker')) {
    const importPos = findLastImportEnd(sourceFile);
    const importLine = importPos === 0
      ? `import { PageTracker } from '@/components/analytics/page-tracker'\n`
      : `\nimport { PageTracker } from '@/components/analytics/page-tracker'\n`;
    edits.push({ pos: importPos, text: importLine });
  }

  const bodyElement = findBodyJsxElement(sourceFile);
  if (bodyElement) {
    const insertPos = bodyElement.openingElement.end;
    edits.push({ pos: insertPos, text: `\n      <PageTracker />` });
  } else {
    const firstElement = findFirstJsxElement(sourceFile);
    if (!firstElement) {
      console.warn('[Analytics] App Router injection failed: no JSX element found');
      return false;
    }
    const insertPos = firstElement.openingElement.end;
    edits.push({ pos: insertPos, text: `\n      <PageTracker />` });
    console.warn('[Analytics] App Router injection fallback: inserted after first JSX element');
  }

  if (!edits.length) return false;
  const updated = applyEdits(sourceText, edits);
  await fs.writeFile(layoutPath, updated, 'utf8');
  return true;
}

async function injectPagesRouterAnalytics(pagesAppPath: string): Promise<boolean> {
  const sourceText = await fs.readFile(pagesAppPath, 'utf8');
  if (sourceText.includes('PageTracker') || sourceText.includes('@sheenapps/analytics')) {
    return false;
  }

  const sourceFile = createSourceFile(pagesAppPath, sourceText);
  const edits: Array<{ pos: number; text: string }> = [];

  if (!hasNamedImport(sourceFile, '@/components/analytics/page-tracker-pages', 'PageTracker')) {
    const importPos = findLastImportEnd(sourceFile);
    const importLine = importPos === 0
      ? `import { PageTracker } from '@/components/analytics/page-tracker-pages'\n`
      : `\nimport { PageTracker } from '@/components/analytics/page-tracker-pages'\n`;
    edits.push({ pos: importPos, text: importLine });
  }

  const componentNode = findComponentJsxNode(sourceFile);
  if (componentNode) {
    edits.push({ pos: componentNode.getStart(sourceFile), text: `\n      <PageTracker />\n      ` });
  } else {
    const firstElement = findFirstJsxElement(sourceFile);
    if (!firstElement) {
      console.warn('[Analytics] Pages Router injection failed: no JSX element found');
      return false;
    }
    edits.push({ pos: firstElement.openingElement.end, text: `\n      <PageTracker />` });
    console.warn('[Analytics] Pages Router injection fallback: inserted after first JSX element');
  }

  if (!edits.length) return false;
  const updated = applyEdits(sourceText, edits);
  await fs.writeFile(pagesAppPath, updated, 'utf8');
  return true;
}

// Ensure analytics bootstrap (Next.js App Router or Pages Router)
async function ensureAnalyticsBootstrap(
  projectDir: string,
  mode: 'easy' | 'non-easy' = 'easy'
): Promise<void> {
  let hasAnalytics = await hasAnalyticsDependency(projectDir);
  if (!hasAnalytics && mode === 'easy') {
    const seeded = await ensureAnalyticsDependency(projectDir);
    hasAnalytics = seeded || await hasAnalyticsDependency(projectDir);
  }
  if (!hasAnalytics && mode === 'non-easy') {
    console.warn('[Analytics] @sheenapps/analytics missing; skipping auto-injection for non-Easy Mode');
    return;
  }
  if (!hasAnalytics && mode === 'easy') {
    console.warn('[Analytics] @sheenapps/analytics missing in Easy Mode; injecting anyway');
  }

  const layoutPathTsx = path.join(projectDir, 'src/app/layout.tsx');
  const layoutPathJsx = path.join(projectDir, 'src/app/layout.jsx');
  const layoutPathJs = path.join(projectDir, 'src/app/layout.js');
  const layoutPath = (await fs.stat(layoutPathTsx).then(() => layoutPathTsx).catch(() => null))
    || (await fs.stat(layoutPathJsx).then(() => layoutPathJsx).catch(() => null))
    || (await fs.stat(layoutPathJs).then(() => layoutPathJs).catch(() => null));

  if (!layoutPath) {
    const pagesAppTsx = path.join(projectDir, 'src/pages/_app.tsx');
    const pagesAppJsx = path.join(projectDir, 'src/pages/_app.jsx');
    const pagesAppJs = path.join(projectDir, 'src/pages/_app.js');
    const pagesAppPath = (await fs.stat(pagesAppTsx).then(() => pagesAppTsx).catch(() => null))
      || (await fs.stat(pagesAppJsx).then(() => pagesAppJsx).catch(() => null))
      || (await fs.stat(pagesAppJs).then(() => pagesAppJs).catch(() => null));
    if (pagesAppPath) {
      await ensurePagesRouterAnalytics(projectDir, pagesAppPath, hasAnalytics);
    }
    return;
  }

  const trackerPath = path.join(projectDir, 'src/components/analytics/page-tracker.tsx');
  await fs.mkdir(path.dirname(trackerPath), { recursive: true });
  const trackerContent = `'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@sheenapps/analytics'

const analytics = createClient({
  apiKey: process.env.NEXT_PUBLIC_SHEEN_PK!
})

export function PageTracker() {
  const pathname = usePathname()

  useEffect(() => {
    analytics.page(pathname)
  }, [pathname])

  return null
}
`;
  await fs.writeFile(trackerPath, trackerContent, 'utf8');

  await injectAppRouterAnalytics(layoutPath);
}

async function ensurePagesRouterAnalytics(
  projectDir: string,
  pagesAppPath: string,
  hasAnalytics: boolean
): Promise<void> {
  if (!hasAnalytics) {
    console.warn('[Analytics] Pages Router detected but @sheenapps/analytics missing; skipping injection');
    return;
  }

  const trackerPath = path.join(projectDir, 'src/components/analytics/page-tracker-pages.tsx');
  await fs.mkdir(path.dirname(trackerPath), { recursive: true });
  const trackerContent = `'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@sheenapps/analytics'

const analytics = createClient({
  apiKey: process.env.NEXT_PUBLIC_SHEEN_PK!
})

export function PageTracker() {
  const router = useRouter()

  useEffect(() => {
    const handle = (url: string) => {
      analytics.page(url)
    }
    router.events.on('routeChangeComplete', handle)
    return () => {
      router.events.off('routeChangeComplete', handle)
    }
  }, [router.events])

  return null
}
`;
  await fs.writeFile(trackerPath, trackerContent, 'utf8');
  await injectPagesRouterAnalytics(pagesAppPath);
}

// Build process - wrapped with OpenTelemetry tracing
export async function processBuildJob(job: Job<BuildJobData, BuildJobResult>): Promise<BuildJobResult> {
  // Create job context for tracing
  const jobContext = {
    id: job.id || 'unknown',
    type: 'build',
    queue: job.queueName,
    attempt: job.attemptsMade + 1,
    createdAt: new Date(job.timestamp),
    metadata: job.data,
    _traceContext: job.data._traceContext, // Extract if exists from enqueue
  };

  // Process with distributed tracing
  const result = await JobTracer.processWithTrace(jobContext, async (tracedJob, span) => {
    const startTime = Date.now();
    const { userId, projectId, prompt, versionId, baseVersionId, framework, isInitialBuild } = job.data;

    // Add span attributes
    span.setAttributes({
      'build.user_id': userId,
      'build.project_id': projectId,
      'build.version_id': versionId || 'auto',
      'build.framework': framework || 'unknown',
      'build.is_initial': isInitialBuild || false,
    });

    logger.info(`Processing build job`);

    // Track active jobs
    metrics.incrementActiveJobs('build');

    // Get webhook service
    const webhookService = getWebhookService();

  // Compute effective versionId once to avoid divergence from multiple ulid() calls
  const effectiveVersionId = versionId || ulid();

  // Send build started webhook
  await webhookService.send({
    type: 'build_started',
    buildId: effectiveVersionId,
    data: {
      userId,
      projectId,
      prompt,
      framework,
      isInitialBuild
    }
  });

  // Funnel: build_started
  try {
    await getBusinessEventsService().insertEvent({
      projectId,
      eventType: 'build_started',
      occurredAt: new Date().toISOString(),
      source: 'server',
      payload: { buildId: effectiveVersionId, framework, isInitialBuild },
      idempotencyKey: `build-started:${effectiveVersionId}`,
      actorId: userId,
      actorType: 'user',
    });
  } catch (_) { /* non-critical */ }

  // Get environment versions
  const { nodeVersion, pnpmVersion } = await getEnvironmentVersions();

  // Create version record
  const version = await createProjectVersion({
    userId,
    projectId,
    versionId: effectiveVersionId,
    prompt,
    parentVersionId: baseVersionId,
    framework,
    status: 'building',
    needsRebuild: false,
    nodeVersion,
    pnpmVersion,
  });

  try {
    // Project directory
    const baseDir = path.join(os.homedir(), 'projects');
    const projectDir = path.join(baseDir, userId, projectId);

    const infraMode = await getProjectInfraMode(projectId);
    const isEasyMode = infraMode === 'easy';

    // Ensure project directory exists
    await fs.mkdir(projectDir, { recursive: true });

    let claudeResponse: ClaudeGenerateResponse | null = null;
    let claudeResponseText: string | null = null;
    let stdout: string;

    if (isInitialBuild) {
      // Call Claude CLI for initial generation
      console.log('Calling Claude CLI for initial generation...');
      const claudeStart = Date.now();
      // Check if we should mock Claude (for testing without Claude CLI)
      console.log('MOCK_CLAUDE env var:', process.env.MOCK_CLAUDE);
      if (process.env.MOCK_CLAUDE === 'true') {
        console.log('📝 Using mock Claude response for testing');
        stdout = JSON.stringify({
          name: "test-app",
          slug: "test-app",
          description: "Mock generated app",
          version: "0.1.0",
          files: [
            {
              path: "index.html",
              content: "<!DOCTYPE html>\n<html>\n<head>\n  <title>Test App</title>\n  <style>body { background: #3498db; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial; }</style>\n</head>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>",
            },
            {
              path: "package.json",
              content: JSON.stringify(
                {
                  name: "test-app",
                  version: "0.1.0",
                  scripts: {
                    build: "echo 'Mock build' && mkdir -p dist && cp index.html dist/",
                  },
                  dependencies: {},
                },
                null,
                2
              ),
            },
          ],
        });
      } else {
        try {
          // Build the effective prompt - inject SDK context for Easy Mode projects
          let effectivePrompt = prompt;
          if (isEasyMode) {
            const featureType = detectFeatureType(prompt);
            const sdkContext = buildSDKContext({
              enabledPrimitives: ['auth', 'db', 'storage', 'jobs', 'secrets', 'email', 'payments', 'analytics'],
              featureType,
              includeFullReference: true,
              includeFrameworkVersions: true,
            });
            effectivePrompt = `${sdkContext}\n\n---\n\n## User Request\n\n${prompt}`;
            console.log('[Easy Mode] Injected SDK context, feature type:', featureType || 'none');
          }

          // Get template-based build limits
          const buildTimeoutMs = await getProjectMaxBuildTime(projectId);
          const maxSteps = await getProjectMaxSteps(projectId);

          stdout = await new Promise<string>((resolve, reject) => {
            // Build Claude CLI args - only add --dangerously-skip-permissions if explicitly enabled
            const claudeArgs = ["-p", "--print", "--output-format", "json"];
            if (process.env.CLAUDE_SKIP_PERMISSIONS === 'true') {
              claudeArgs.push("--dangerously-skip-permissions");
            }

            const proc = spawn(
              "claude",
              claudeArgs,
              { cwd: projectDir }
            );
            let out = "";
            let err = "";
            let killed = false;
            let stepCount = 0;
            let lineBuffer = "";

            // Set up build time limit
            const timeoutId = setTimeout(() => {
              if (!killed) {
                killed = true;
                logger.error({ projectId, timeoutMs: buildTimeoutMs }, '[Budget] BUILD_TIME_EXCEEDED: Killing Claude CLI process');
                proc.kill('SIGTERM');
                // Give process time to clean up, then force kill
                setTimeout(() => {
                  if (!proc.killed) {
                    proc.kill('SIGKILL');
                  }
                }, 5000);
                reject(new Error('BUILD_TIME_EXCEEDED: Build exceeded maximum allowed time'));
              }
            }, buildTimeoutMs);

            proc.stdout.on("data", (chunk) => {
              const text = chunk.toString();
              out += text;
              lineBuffer += text;

              // Process complete lines for step counting
              const lines = lineBuffer.split('\n');
              lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                const toolCalls = countToolCallsInLine(line);
                if (toolCalls > 0) {
                  stepCount += toolCalls;
                  logger.info({ projectId, stepCount, maxSteps }, '[Budget] Step count updated');

                  // Check if step limit exceeded
                  if (stepCount > maxSteps && !killed) {
                    killed = true;
                    logger.error({ projectId, stepCount, maxSteps }, '[Budget] STEP_LIMIT_EXCEEDED: Killing Claude CLI process');
                    clearTimeout(timeoutId);
                    proc.kill('SIGTERM');
                    setTimeout(() => {
                      if (!proc.killed) {
                        proc.kill('SIGKILL');
                      }
                    }, 5000);
                    reject(new Error(`STEP_LIMIT_EXCEEDED: Build exceeded maximum allowed steps (${stepCount}/${maxSteps})`));
                    return;
                  }
                }
              }
            });
            proc.stderr.on("data", (c) => (err += c));
            proc.on("error", (error) => {
              clearTimeout(timeoutId);
              reject(error);
            });
            proc.on("close", (code) => {
              clearTimeout(timeoutId);
              if (killed) return; // Already rejected due to timeout or step limit
              if (code !== 0) {
                return reject(new Error(`Claude CLI exited ${code}: ${err}`));
              }
              logger.info({ projectId, finalStepCount: stepCount, maxSteps }, '[Budget] Build completed within step limit');
              resolve(out);
            });
            proc.stdin.write(effectivePrompt);
            proc.stdin.end();
          });
          console.log("Claude response received, length:", stdout.length);
        } catch (error: any) {
          console.error("Claude CLI failed:", error.message);
          throw new Error(`Claude CLI failed: ${error.message}`);
        }
      }

      // Parse Claude response - it might be in the new format
      const claudeResult = JSON.parse(stdout);

      // Check if it's the new Claude CLI format
      if (claudeResult.type === 'result' && claudeResult.result) {
        console.log('Claude returned text result, creating mock response');
        claudeResponseText = claudeResult.result;

        // Claude created files directly, let's check what files exist
        const filesInDir = await fs.readdir(projectDir);
        console.log('Files in project directory after Claude:', filesInDir);

        // Create a mock response with the files Claude created
        claudeResponse = {
          name: "claude-generated-app",
          slug: "claude-generated-app",
          description: "Generated by Claude",
          version: "0.1.0",
          author: "",
          repository: "",
          license: "MIT",
          tech_stack: [],
          metadata: {
            tags: [],
            industry_tags: [],
            style_tags: [],
            core_pages: {},
            components: [],
            design_tokens: {},
            rsc_path: ""
          },
          templateFiles: [],
          files: []
        };

        // Read the files Claude created and add them to the response
        for (const file of filesInDir) {
          const filePath = path.join(projectDir, file);
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            const content = await fs.readFile(filePath, 'utf8');
            claudeResponse.files.push({
              path: file,
              content: content
            });
          }
        }

        // If no package.json was created, add a minimal one
        if (!filesInDir.includes('package.json')) {
          claudeResponse.files.push({
            path: "package.json",
            content: JSON.stringify({
              name: "claude-generated",
              version: "0.1.0",
              scripts: {
                build: "mkdir -p dist && cp *.html dist/ 2>/dev/null || echo 'No HTML files to copy'"
              },
              dependencies: {}
            }, null, 2)
          });
        }
      } else {
        console.log('Claude returned JSON result:');
        console.log(claudeResult);
        claudeResponse = claudeResult;
      }

      // Only write files if we have a claudeResponse with files
      // (Claude may have already created files directly)
      if (claudeResponse?.templateFiles?.length) {
        await writeProjectFiles(projectDir, claudeResponse.templateFiles);
      }

      if (isEasyMode) {
        await ensureAnalyticsBootstrap(projectDir, 'easy');
      } else {
        await ensureAnalyticsBootstrap(projectDir, 'non-easy');
      }
      // Write additional files
      if (claudeResponse?.files?.length) {
        // Only write files that don't already exist (to avoid overwriting Claude's direct creations)
        for (const file of claudeResponse.files) {
          const filePath = path.join(projectDir, file.path);
          try {
            await fs.access(filePath);
            console.log(`File ${file.path} already exists, skipping...`);
          } catch {
            // File doesn't exist, write it
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, file.content, 'utf8');
            console.log(`Wrote file: ${file.path}`);
          }
        }
      }

      console.log(`Claude generation took ${Date.now() - claudeStart}ms`);
    } else {
      // For rebuilds, we need to pass existing code context
      // This would involve reading current files and passing them to Claude
      // For now, we'll just use the prompt to modify existing code
      console.log('Calling Claude CLI for code modification...');

      // Build the effective prompt - inject SDK context for Easy Mode projects (rebuilds use minimal context)
      let effectiveModPrompt = prompt;
      if (isEasyMode) {
        const featureType = detectFeatureType(prompt);
        const sdkContext = buildSDKContext({
          enabledPrimitives: ['auth', 'db', 'storage', 'jobs', 'secrets', 'email', 'payments', 'analytics'],
          featureType,
          includeFullReference: false, // Minimal for rebuilds
          includeFrameworkVersions: true,
        });
        effectiveModPrompt = `${sdkContext}\n\n---\n\n## User Request\n\n${prompt}`;
        console.log('[Easy Mode] Injected SDK context for rebuild, feature type:', featureType || 'none');
      }

      let modStdout: string;
      try {
        // Build Claude CLI args - only add --dangerously-skip-permissions if explicitly enabled
        const claudeModArgs = ['-p', '--print', '--output-format', 'json'];
        if (process.env.CLAUDE_SKIP_PERMISSIONS === 'true') {
          claudeModArgs.push('--dangerously-skip-permissions');
        }

        // Get template-based build limits
        const buildTimeoutMs = await getProjectMaxBuildTime(projectId);
        const maxSteps = await getProjectMaxSteps(projectId);

        modStdout = await new Promise<string>((resolve, reject) => {
          const proc = spawn(
            'claude',
            claudeModArgs,
            { cwd: projectDir }
          );
          let out = '';
          let err = '';
          let killed = false;
          let stepCount = 0;
          let lineBuffer = '';

          // Set up build time limit
          const timeoutId = setTimeout(() => {
            if (!killed) {
              killed = true;
              logger.error({ projectId, timeoutMs: buildTimeoutMs }, '[Budget] BUILD_TIME_EXCEEDED: Killing Claude CLI process (rebuild)');
              proc.kill('SIGTERM');
              // Give process time to clean up, then force kill
              setTimeout(() => {
                if (!proc.killed) {
                  proc.kill('SIGKILL');
                }
              }, 5000);
              reject(new Error('BUILD_TIME_EXCEEDED: Build exceeded maximum allowed time'));
            }
          }, buildTimeoutMs);

          proc.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            out += text;
            lineBuffer += text;

            // Process complete lines for step counting
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              const toolCalls = countToolCallsInLine(line);
              if (toolCalls > 0) {
                stepCount += toolCalls;
                logger.info({ projectId, stepCount, maxSteps }, '[Budget] Step count updated (rebuild)');

                // Check if step limit exceeded
                if (stepCount > maxSteps && !killed) {
                  killed = true;
                  logger.error({ projectId, stepCount, maxSteps }, '[Budget] STEP_LIMIT_EXCEEDED: Killing Claude CLI process (rebuild)');
                  clearTimeout(timeoutId);
                  proc.kill('SIGTERM');
                  setTimeout(() => {
                    if (!proc.killed) {
                      proc.kill('SIGKILL');
                    }
                  }, 5000);
                  reject(new Error(`STEP_LIMIT_EXCEEDED: Build exceeded maximum allowed steps (${stepCount}/${maxSteps})`));
                  return;
                }
              }
            }
          });
          proc.stderr.on('data', c => err += c);
          proc.on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
          proc.on('close', code => {
            clearTimeout(timeoutId);
            if (killed) return; // Already rejected due to timeout or step limit
            if (code !== 0) {
              return reject(new Error(`Claude CLI exited ${code}: ${err}`));
            }
            logger.info({ projectId, finalStepCount: stepCount, maxSteps }, '[Budget] Rebuild completed within step limit');
            resolve(out);
          });
          proc.stdin.write(effectiveModPrompt);
          proc.stdin.end();
        });
        console.log('Claude modification response length:', modStdout.length);
      } catch (error: any) {
        console.error('Claude CLI failed:', error.message);
        throw new Error(`Claude CLI failed: ${error.message}`);
      }

      // Parse Claude response - it might be in the new format
      const claudeResult = JSON.parse(modStdout);
      // Check if it's the new Claude CLI format
      if (claudeResult.type === 'result' && claudeResult.result) {
        console.log('Claude returned text result, creating mock response');
        claudeResponseText = claudeResult.result;
        // Create a mock response with a simple HTML file
        claudeResponse = {
          name: "claude-generated-app",
          slug: "claude-generated-app",
          description: "Generated by Claude",
          version: "0.1.0",
          author: "",
          repository: "",
          license: "MIT",
          tech_stack: [],
          metadata: {
            tags: [],
            industry_tags: [],
            style_tags: [],
            core_pages: {},
            components: [],
            design_tokens: {},
            rsc_path: ""
          },
          templateFiles: [],
          files: [
            {
              path: "index.html",
              content: `<!DOCTYPE html>
    <html>
    <head><title>Claude Response</title></head>
    <body><p>${claudeResult.result}</p></body>
    </html>`
            },
            {
              path: "package.json",
              content: JSON.stringify({
                name: "claude-generated",
                version: "0.1.0",
                scripts: { build: "mkdir -p dist && cp index.html dist/" },
                dependencies: {}
              }, null, 2)
            }
          ]
        };
      } else {
        // Assume it's already in the expected format
        claudeResponse = claudeResult;
      }
    }
    // Initialize git repo if needed
    await initGitRepo(projectDir);

    // Install dependencies with shared cache
    console.log('Installing dependencies...');
    const installStart = Date.now();
    const installCmd = getPnpmInstallCommand(projectDir);
    await execCommand(installCmd, projectDir);
    const installDuration = Date.now() - installStart;

    // Run security audit
    console.log('Running security audit...');
    try {
      await execCommand('pnpm audit --prod --audit-level critical', projectDir);
    } catch (error: any) {
      if (error.message.includes('critical')) {
        throw new Error('Critical security vulnerabilities found in dependencies');
      }
    }

    // Build project
    console.log('Building project...');
    const buildStart = Date.now();
    await execCommand('pnpm build', projectDir);
    const buildDuration = Date.now() - buildStart;

    if (isEasyMode && framework === 'nextjs') {
      try {
        const packageJsonPath = path.join(projectDir, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        if (packageJson?.scripts?.export) {
          console.log('Running Next.js export for Easy Mode...');
          await execCommand('pnpm run export', projectDir);
        }
      } catch (error) {
        console.warn('Easy Mode export step failed or not configured:', error);
      }
    }

    // Detect build output
    let buildOutputDir = detectBuildOutput(projectDir);
    if (isEasyMode && framework === 'nextjs') {
      const exportDir = path.join(projectDir, 'out');
      if (existsSync(exportDir) && (await fs.stat(exportDir)).isDirectory()) {
        buildOutputDir = exportDir;
      }
    }
    if (!buildOutputDir) {
      throw new Error('No build output directory found');
    }

    // ── Post-build template scaffold verification (warning-only) ──
    if (isEasyMode) {
      try {
        const scaffold = await getProjectTemplateScaffold(projectId);
        if (scaffold) {
          // Collect all files in the project source directory
          const collectFiles = async (dir: string, base: string): Promise<string[]> => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const files: string[] = [];
            for (const entry of entries) {
              const rel = path.join(base, entry.name);
              if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
                files.push(...await collectFiles(path.join(dir, entry.name), rel));
              } else {
                files.push(rel);
              }
            }
            return files;
          };
          const allFiles = await collectFiles(projectDir, '');

          // Check expected pages exist as route files
          const missingPages: string[] = [];
          for (const expectedPage of scaffold.pages) {
            // Normalise: "/products/:id" → "products", "/checkout" → "checkout"
            const slug = expectedPage.replace(/^\//, '').replace(/\/:[^/]+/g, '').split('/').pop() || '';
            if (!slug) continue;
            const pageExists = allFiles.some(f =>
              f.includes(`/${slug}/page.`) || f.includes(`/${slug}.tsx`) || f.includes(`/${slug}.jsx`)
            );
            if (!pageExists) missingPages.push(expectedPage);
          }

          const verificationResult = {
            templatePages: scaffold.pages.length,
            foundPages: scaffold.pages.length - missingPages.length,
            missingPages,
            pass: missingPages.length === 0,
          };

          if (missingPages.length > 0) {
            console.warn('⚠️ Scaffold verification: missing expected pages', verificationResult);
          } else {
            console.log('✅ Scaffold verification passed', verificationResult);
          }

          // Store result in build metadata (non-blocking)
          try {
            const db = getDatabase();
            await db.query(
              `UPDATE project_versions SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
              [JSON.stringify({ scaffoldVerification: verificationResult }), version.versionId]
            );
          } catch {
            // Non-blocking — don't fail the build for metadata storage issues
          }
        }
      } catch (verifyError) {
        console.warn('⚠️ Scaffold verification skipped due to error:', verifyError);
      }
    }

    // Calculate directory size for Wrangler deployment
    const getDirSize = async (dir: string): Promise<number> => {
      let size = 0;
      const files = await fs.readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
          size += await getDirSize(filePath);
        } else {
          const stats = await fs.stat(filePath);
          size += stats.size;
        }
      }
      return size;
    };

    const deploymentSize = await getDirSize(buildOutputDir);
    if (deploymentSize > MAX_OUTPUT_SIZE) {
      throw new Error(`Output size (${deploymentSize} bytes) exceeds maximum allowed (${MAX_OUTPUT_SIZE} bytes)`);
    }

    let deploymentUrl = '';
    let deployDuration = 0;
    let cfDeploymentId: string | null = null;

    if (isEasyMode) {
      console.log('Deploying to Easy Mode in-house hosting...');
      const deployStart = Date.now();
      const staticAssets = await collectBuildAssets(buildOutputDir);
      const deployment = await getInhouseDeploymentService().deploy({
        projectId,
        buildId: version.versionId,
        staticAssets,
        serverBundle: {
          code: EASY_MODE_WORKER_CODE,
          entryPoint: EASY_MODE_WORKER_ENTRY,
        },
      });
      deployDuration = deployment.duration || (Date.now() - deployStart);

      if (!deployment.success) {
        throw new Error(deployment.error || 'In-house deployment failed');
      }

      deploymentUrl = deployment.url;
      console.log('✅ Easy Mode deployment successful:', {
        deploymentId: deployment.deploymentId,
        url: deployment.url,
      });
    } else {
      // Deploy to Cloudflare Pages using Wrangler
      console.log('Deploying to Cloudflare Pages with Wrangler...');
      console.log('Build output directory:', buildOutputDir);

      const deployStart = Date.now();
      const deployment = (isDirectModeEnabled() && process.env.USE_REAL_SERVICES !== 'true')
        ? await mockDeployToCloudflarePages(buildOutputDir, 'mock-project', 'preview')
        : await deployToCloudflarePages(buildOutputDir);
      deployDuration = Date.now() - deployStart;
      deploymentUrl = deployment.url;
      cfDeploymentId = deployment.deploymentId;

      console.log('✅ Deployment successful:', {
        deploymentId: deployment.deploymentId,
        url: deployment.url,
        environment: deployment.environment
      });
    }

    // Upload to R2 for permanent storage with safety checks
    console.log('Uploading artifact to R2...');
    
    // Determine retention policy and generate key with appropriate prefix
    const retentionPolicy = getRetentionPolicy(userId, projectId);
    console.log(`[Build Worker] Using retention policy: ${retentionPolicy}`);
    
    const artifactKey = getArtifactKey(userId, projectId, version.versionId, retentionPolicy);

    // Create a tar.gz for R2 storage (GZIP compressed for consistency)
    const r2ZipPath = path.join(os.tmpdir(), `${versionId}.tar.gz`);
    console.log(`Creating tar.gz for R2 storage from ${buildOutputDir}...`);
    await createTarGzFromDirectory(buildOutputDir, r2ZipPath);

    // Check artifact size before upload
    const artifactSize = await getFileSize(r2ZipPath);
    console.log(`Artifact size: ${formatFileSize(artifactSize)}`);
    
    let r2Result: any = null;
    let artifactChecksum: string | undefined;
    
    if (artifactSize > MAX_ARTIFACT_SIZE) {
      console.warn(`Artifact too large: ${formatFileSize(artifactSize)} > ${formatFileSize(MAX_ARTIFACT_SIZE)}`);
      console.log('Skipping R2 upload due to size limit');
    } else {
      // Calculate checksum for integrity verification
      console.log('Calculating artifact checksum...');
      artifactChecksum = await calculateSHA256(r2ZipPath);
      console.log(`Artifact SHA256: ${artifactChecksum.substring(0, 16)}...`);
      
      // Retention policy already determined above
      
      r2Result = (isDirectModeEnabled() && process.env.USE_REAL_SERVICES !== 'true')
        ? await mockUploadToR2(r2ZipPath, artifactKey)
        : await uploadToR2(r2ZipPath, artifactKey, { retention: retentionPolicy });
        
      // Verify upload integrity (for real uploads)
      if (!isDirectModeEnabled() || process.env.USE_REAL_SERVICES === 'true') {
        if (r2Result.size !== artifactSize) {
          console.warn(`Upload size mismatch: expected ${artifactSize}, got ${r2Result.size}`);
        }
      }
    }

    // Clean up temp zip
    if (existsSync(r2ZipPath)) {
      await fs.unlink(r2ZipPath);
    }

    // Set up polling fallback for deployment status
    const pollDeploymentStatus = async (attemptCount = 0): Promise<void> => {
      if (attemptCount >= 24) { // 2 minutes max (5s * 24)
        console.log('Deployment status polling timeout');
        return;
      }

      try {
        if (!cfDeploymentId) {
          return;
        }
        const status = await getDeploymentStatus(cfDeploymentId);
        if (status.latest_stage?.status === 'success') {
          console.log('Deployment confirmed via polling');
          // Update status if webhook hasn't already done it
          const currentVersion = await getLatestProjectVersion(userId, projectId);
          if (currentVersion?.versionId === version.versionId && currentVersion.status !== 'deployed') {
            await updateProjectVersion(version.versionId, {
              status: 'deployed',
              previewUrl: deploymentUrl,
            });
          }
          return;
        } else if (status.latest_stage?.status === 'failure') {
          console.error('Deployment failed via polling');
          await updateProjectVersion(version.versionId, {
            status: 'failed',
            claudeJson: { ...claudeResponse, deploymentError: 'Deployment failed' },
          });
          return;
        }

        // Still in progress, poll again
        setTimeout(() => pollDeploymentStatus(attemptCount + 1), 5000);
      } catch (error) {
        console.error('Error polling deployment status:', error);
        setTimeout(() => pollDeploymentStatus(attemptCount + 1), 5000);
      }
    };

    // Start polling after 10 seconds (give webhook a chance first)
    // Skip polling in direct mode since we're using mocks
    if (!isDirectModeEnabled() && !isEasyMode) {
      setTimeout(() => pollDeploymentStatus(), 10000);
    }

    // Commit version to git
    console.log('Committing version to git...');
    await commitVersion(
      projectDir,
      version.versionId,
      `Version ${version.versionId}: ${prompt}`,
      true // Include dist for latest 3 versions
    );

    // Manage sliding window
    const allVersions = await listProjectVersions(userId, projectId, 1000);
    const versionIds = allVersions.map((v: any) => v.versionId);
    await manageSlidingWindow(projectDir, version.versionId, versionIds);

    // Update version record
    await updateProjectVersion(version.versionId, {
      status: 'deployed',
      previewUrl: deploymentUrl,
      artifactUrl: r2Result?.url,
      cfDeploymentId: cfDeploymentId || undefined,
      claudeJson: claudeResponse,
      buildDurationMs: buildDuration,
      installDurationMs: installDuration,
      deployDurationMs: deployDuration,
      outputSizeBytes: deploymentSize,
      artifactSize,
      artifactChecksum,
    });

    // Update KV
    if (isDirectModeEnabled() && process.env.USE_REAL_SERVICES !== 'true') {
      console.log('📝 Mock: Skip KV update in direct mode');
    } else {
      if (!isEasyMode) {
        await setLatestVersion(userId, projectId, {
          latestVersionId: version.versionId,
          previewUrl: deploymentUrl,
          timestamp: Date.now(),
        });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`Build completed in ${totalTime}ms`);

    // Send build completed webhook
    await webhookService.send({
      type: 'build_completed',
      buildId: version.versionId,
      data: {
        userId,
        projectId,
        versionId: version.versionId,
        previewUrl: deploymentUrl,
        buildTime: totalTime,
        metrics: {
          installDuration,
          buildDuration,
          deployDuration,
          outputSize: deploymentSize,
        },
      }
    });

    // Funnel: build_succeeded
    try {
      await getBusinessEventsService().insertEvent({
        projectId,
        eventType: 'build_succeeded',
        occurredAt: new Date().toISOString(),
        source: 'server',
        payload: {
          buildId: version.versionId,
          previewUrl: deploymentUrl,
          buildTimeMs: totalTime,
          outputSize: deploymentSize,
        },
        idempotencyKey: `build-succeeded:${version.versionId}`,
        actorId: userId,
        actorType: 'user',
      });
    } catch (_) { /* non-critical */ }

    return {
      success: true,
      versionId: version.versionId,
      previewUrl: deploymentUrl,
      buildTime: totalTime,
      claudeResponse: claudeResponseText || undefined,
      metrics: {
        installDuration,
        buildDuration,
        deployDuration,
        outputSize: deploymentSize,
      },
    };
    } catch (error: any) {
      logger.error('Build failed');

      // Update version record as failed
      await updateProjectVersion(version.versionId, {
        status: 'failed',
        claudeJson: { error: error.message },
      });

      // Funnel: build_failed
      try {
        await getBusinessEventsService().insertEvent({
          projectId,
          eventType: 'build_failed',
          occurredAt: new Date().toISOString(),
          source: 'server',
          payload: {
            buildId: version.versionId,
            errorMessage: error.message?.slice(0, 500),
          },
          idempotencyKey: `build-failed:${version.versionId}`,
          actorId: userId,
          actorType: 'user',
        });
      } catch (_) { /* non-critical */ }

      // Note: Don't decrement here - let finally handle it to avoid double-decrement
      return {
        success: false,
        versionId: version.versionId,
        error: error.message,
      };
    } finally {
      // Always decrement active jobs (only once, in finally)
      metrics.decrementActiveJobs('build');
    }
  });

  // Return the result based on tracing outcome
  if (result.success) {
    return result.data as BuildJobResult;
  } else {
    // The error is already logged and tracked, just return the error result
    return {
      success: false,
      versionId: job.data.versionId || 'unknown',
      error: result.error?.message || 'Unknown error',
    };
  }
}

// Create and start the worker
export function createBuildWorker() {
  const worker = new Worker<BuildJobData, BuildJobResult>(
    'builds',
    processBuildJob,
    {
      connection,
      concurrency: 1, // Process one build at a time per worker
      limiter: {
        max: 1,
        duration: 1000, // Max 1 job per second
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
  });

  return worker;
}
