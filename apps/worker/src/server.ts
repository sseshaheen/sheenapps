import * as dotenv from 'dotenv';
// Load environment variables BEFORE any other imports
dotenv.config();

// Add comprehensive validation BEFORE other imports
import { validateEnvironment, assertInfraReady } from './config/envValidation';
validateEnvironment();

// Validate Stripe configuration if payment features are enabled
import { isStripeConfigured, validateStripeEnvironment } from './config/stripeEnvironmentValidation';
if (isStripeConfigured()) {
  validateStripeEnvironment();
} else {
  console.log('⚠️  Stripe not configured - payment features will be disabled');
}

// Initialize OpenTelemetry BEFORE any other imports
import './observability/init';

// Initialize unified logging early
import { unifiedLogger } from './services/unifiedLogger';

import { spawn } from 'child_process';
import { createHmac, timingSafeEqual } from 'crypto';
import fastify from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initializePnpmCache } from './config/buildCache';
import { cleanupJob } from './jobs/cleanupJob';
import { dailyResetJob } from './jobs/dailyResetJob';
import { enhancedDailyBonusResetJob } from './jobs/enhancedDailyBonusResetJob';
import { ghostBuildDetectionJob } from './jobs/ghostBuildDetectionJob';
import { logCleanupJob } from './jobs/logCleanupJob';
import { monthlyRolloverJob } from './jobs/monthlyRolloverJob';
import { r2CleanupJob } from './jobs/r2CleanupJob';
import { initializeScheduledJobs } from './jobs/scheduledJobs';
import { buildQueueEvents } from './queue/buildQueue';
// DEPRECATED: Legacy endpoint - use /v1/create-preview-for-new-project instead
// import { registerBuildPreviewRoutes } from './routes/buildPreview';
import { registerAdminRoutes } from './routes/admin';
import adminAlertRoutes from './routes/adminAlerts';
import adminAuditLogRoutes from './routes/adminAuditLogs';
import adminAuthRoutes from './routes/adminAuth';
import adminBilling from './routes/adminBilling';
import adminBuildLogRoutes from './routes/adminBuildLogs';
import adminCustomer360Routes from './routes/adminCustomer360';
import adminCustomerHealthRoutes from './routes/adminCustomerHealth';
import adminFeatureFlagsRoutes from './routes/adminFeatureFlags';
import adminIncidentRoutes from './routes/adminIncidents';
import adminLogStreamingRoutes from './routes/adminLogStreaming';
import adminMetricsRoutes from './routes/adminMetrics';
import adminPerformanceRoutes from './routes/adminPerformance';
import { registerAdminPricingRoutes } from './routes/adminPricing';
import { adminPromotionRoutes } from './routes/adminPromotions';
import { registerAdminReferralRoutes } from './routes/adminReferrals';
import adminSystemHealthRoutes from './routes/adminSystemHealth';
import adminUnifiedLogRoutes from './routes/adminUnifiedLogs';
import adminUsersRoutes from './routes/adminUsers';
import adminVoiceRecordingRoutes from './routes/adminVoiceRecordings';
import adminInhouseProjectsRoutes from './routes/adminInhouseProjects';
import adminInhouseActivityRoutes from './routes/adminInhouseActivity';
import adminInhouseFlagsRoutes from './routes/adminInhouseFlags';
import adminInhouseConnectorsRoutes from './routes/adminInhouseConnectors';
import adminInhouseAIRoutes from './routes/adminInhouseAI';
import adminInhouseRealtimeRoutes from './routes/adminInhouseRealtime';
import adminInhouseNotificationsRoutes from './routes/adminInhouseNotifications';
import adminInhouseFormsRoutes from './routes/adminInhouseForms';
import adminInhouseSearchRoutes from './routes/adminInhouseSearch';
import adminInhouseBackupsRoutes from './routes/adminInhouseBackups';
import adminInhouseJobsRoutes from './routes/adminInhouseJobs';
import adminInhouseEmailsRoutes from './routes/adminInhouseEmails';
import adminInhouseStorageRoutes from './routes/adminInhouseStorage';
import adminInhousePaymentsRoutes from './routes/adminInhousePayments';
import adminInhouseAuthRoutes from './routes/adminInhouseAuth';
import adminInhouseMonitoringRoutes from './routes/adminInhouseMonitoring';
import adminInhouseUsageRoutes from './routes/adminInhouseUsage';
import adminInhouseAnalyticsRoutes from './routes/adminInhouseAnalytics';
import adminInhouseAlertsRoutes from './routes/adminInhouseAlerts';
import adminInhouseSecretsRoutes from './routes/adminInhouseSecrets';
import adminInhouseRevenueRoutes from './routes/adminInhouseRevenue';
import adminInhouseEmailDomainsRoutes from './routes/adminInhouseEmailDomains';
import adminInhouseRegisteredDomainsRoutes from './routes/adminInhouseRegisteredDomains';
import adminInhouseWebhookEventsRoutes from './routes/adminInhouseWebhookEvents';
import adminInhouseHealthRoutes from './routes/adminInhouseHealth';
import adminInhouseMailboxesRoutes from './routes/adminInhouseMailboxes';
import adminInhouseInboxRoutes from './routes/adminInhouseInbox';
import adminInhouseDatabaseRoutes from './routes/adminInhouseDatabase';
import adminInhouseObservabilityRoutes from './routes/adminInhouseObservability';
import adminInhouseSupportRoutes from './routes/adminInhouseSupport';
import adminInhouseRunHubRoutes from './routes/adminInhouseRunHub';
import adminInhouseOpenClawRoutes from './routes/adminInhouseOpenClaw';
import advisorApplicationRoutes from './routes/advisorApplications';
import { registerAdvisorNetworkRoutes } from './routes/advisorNetwork';
import advisorWorkspaceRoutes from './routes/advisorWorkspace';
import { registerBillingRoutes } from './routes/billing';
import { billingOverviewRoutes } from './routes/billingOverview';
import { buildRecommendationsRoute } from './routes/buildRecommendations';
import internalEventsRoutes from './routes/internalEvents';
import { registerReferralPartnerRoutes } from './routes/referralPartners';
import { registerStripePaymentRoutes } from './routes/stripePayment';
import { registerSupportTicketRoutes } from './routes/supportTickets';
import { registerTrustSafetyRoutes } from './routes/trustSafety';
// import buildsRoutes from './routes/builds'; // DISABLED: Duplicate route in progress.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import e2eModePlugin from './middleware/e2eMode';
import { requireDispatchSecret } from './middleware/requireDispatchSecret';
import { buildQueue } from './queue/buildQueue';
import { migrationQueue } from './queue/migrationQueue';
import { deployQueue, planQueue, taskQueue, webhookQueue, inboxWebhookQueue, inboxRetentionQueue, domainVerificationQueue, closeAllQueues } from './queue/modularQueues';
import { streamQueue } from './queue/streamQueue';
import { buildAcceptRoutes } from './routes/buildAccept';
import { buildArtifactsRoutes } from './routes/buildArtifacts';
import { buildStreamRoutes } from './routes/buildStream';
import careerAdminRoutes from './routes/careerAdmin';
import careersRoutes from './routes/careers';
import { registerChatPlanRoutes } from './routes/chatPlan';
import { registerClaudeHealthRoutes } from './routes/claudeHealth';
import { healthRoutes } from './routes/health';
import { cloudflareThreeLaneRoutes } from './routes/cloudflareThreeLane';
import { registerCreatePreviewRoutes } from './routes/createPreview';
import e2eCleanupRoutes from './routes/e2eCleanup';
import feedbackRoutes from './routes/feedback';
import { registerGitHubRoutes } from './routes/github';
import { registerHmacDebugRoutes } from './routes/hmacDebug';
import { inhouseAuthRoutes } from './routes/inhouseAuth';
import { platformMobileAuthRoutes } from './routes/platformMobileAuth';
import { inhouseCmsRoutes } from './routes/inhouseCms';
import { inhouseCmsAdminRoutes } from './routes/inhouseCmsAdmin';
import { inhouseDeploymentRoutes } from './routes/inhouseDeployment';
import { inhouseDomainsRoutes } from './routes/inhouseDomains';
import { inhouseGatewayRoutes } from './routes/inhouseGateway';
import { inhouseJobsRoutes } from './routes/inhouseJobs';
import { inhouseProjectRoutes } from './routes/inhouseProjects';
import { inhouseStorageRoutes } from './routes/inhouseStorage';
import { inhouseEmailRoutes } from './routes/inhouseEmail';
import { inhouseEmailDomainsRoutes } from './routes/inhouseEmailDomains';
import { inhouseMailboxRoutes } from './routes/inhouseMailboxes';
import { inhouseDomainRegistrationRoutes } from './routes/inhouseDomainRegistration';
import inhouseDomainTransferRoutes from './routes/inhouseDomainTransfer';
import { inhouseInboxRoutes } from './routes/inhouseInbox';
import { inhouseInboxSummaryRoutes } from './routes/inhouseInboxSummary';
import { inhouseEmailOverviewRoutes } from './routes/inhouseEmailOverview';
import { inhouseInboxWebhookRoutes } from './routes/inhouseInboxWebhook';
import { opensrsWebhookRoutes } from './routes/opensrsWebhook';
import { inhousePaymentsRoutes } from './routes/inhousePayments';
import { inhouseAnalyticsRoutes } from './routes/inhouseAnalytics';
import { inhouseBusinessEventsRoutes } from './routes/inhouseBusinessEvents';
import { inhouseBusinessKpisRoutes } from './routes/inhouseBusinessKpis';
import { inhouseRunAlertsRoutes } from './routes/inhouseRunAlerts';
import { inhouseRunOverviewRoutes } from './routes/inhouseRunOverview';
import { inhouseWorkflowRunsRoutes } from './routes/inhouseWorkflowRuns';
import { inhouseBackupRoutes } from './routes/inhouseBackup';
import { inhouseFlagsRoutes } from './routes/inhouseFlags';
import inhouseConnectorsRoutes from './routes/inhouseConnectors';
import inhouseEdgeFunctionsRoutes from './routes/inhouseEdgeFunctions';
import { inhouseAIRoutes } from './routes/inhouseAI';
import { inhouseRealtimeRoutes } from './routes/inhouseRealtime';
import { inhouseNotificationsRoutes } from './routes/inhouseNotifications';
import { inhouseFormsRoutes } from './routes/inhouseForms';
import { inhouseSearchRoutes } from './routes/inhouseSearch';
import figmaImportRoutes from './routes/figmaImport';
import integrationStatusRoutes from './routes/integrationStatus';
import { migrationRoutes } from './routes/migration';
import persistentChatRoutes from './routes/persistentChat';
import { registerProgressRoutes } from './routes/progress';
import { projectFilesRoutes } from './routes/projectFiles';
import { registerProjectStatusRoutes } from './routes/projectStatus';
import { registerPublicationRoutes } from './routes/publication';
import { registerRealtimeTranscriptionRoutes } from './routes/realtimeTranscription';
import { recommendationsRoute } from './routes/recommendations';
import { sanityRoutes } from './routes/sanity';
import { supabaseBreakglassRoutes } from './routes/supabaseBreakglass';
import { supabaseDeploymentRoutes } from './routes/supabaseDeployment';
import { supabaseOAuthRoutes } from './routes/supabaseOAuth';
import { supabaseOAuthCallbackRoutes } from './routes/supabaseOAuthCallback';
import { registerTranscribeRoutes } from './routes/transcribe';
import { registerUnifiedChatRoutes } from './routes/unifiedChat';
import { updateProjectRoute } from './routes/updateProject';
import { versionHistoryRoutes } from './routes/versionHistory';
import { registerVersionRoutes } from './routes/versions';
import { registerVoiceTranscriptionRoutes } from './routes/voiceTranscription';
import voiceTranscriptionDemoRoutes from './routes/voiceTranscriptionDemo';
import { registerWebhookRoutes } from './routes/webhook';
import { claudeCLIMainProcess } from './services/claudeCLIMainProcess';
import { testConnection } from './services/databaseWrapper';
import { isDirectModeEnabled } from './services/directBuildService';
import { getErrorRecoverySystem, initializeErrorRecoverySystem } from './services/errorRecoverySystem';
import { startAlertEvaluator, stopAlertEvaluator } from './workers/alertEvaluatorWorker';
import { createBuildWorker } from './workers/buildWorker';
import { initializeCalComWebhookWorker } from './workers/calComWebhookWorker';
import './workers/chatWorker'; // Start chat message processor
import { initializeInboxWebhookWorker, shutdownInboxWebhookWorker } from './workers/inboxWebhookWorker';
import { initializeDomainVerificationWorker, shutdownDomainVerificationWorker } from './workers/domainVerificationWorker';
import { initializeDomainRenewalWorker, shutdownDomainRenewalWorker } from './workers/domainRenewalWorker';
import { initializeInboxRetentionWorker, shutdownInboxRetentionWorker } from './workers/inboxRetentionWorker';
import { startOpenClawWebhookWorker, stopOpenClawWebhookWorker } from './workers/openclawWebhookWorker';
import { shutdownBestEffortRedis } from './services/redisBestEffort';
import { shutdownDeployWorker, startDeployWorker } from './workers/deployWorker';
import { startGitHubSyncWorker, stopGitHubSyncWorker } from './workers/githubSyncWorker';
import { startHealthScoreWorker, stopHealthScoreWorker } from './workers/healthScoreWorker';
import './workers/migrationWorker'; // Start migration worker
import './workers/adminRestoreWorker'; // Start admin restore worker
import { shutdownModularWorkers, startModularWorkers } from './workers/modularWorkers';
import { shutdownStreamWorker, startStreamWorker } from './workers/streamWorker';
import { initializeStripeWebhookWorker, shutdownStripeWebhookWorker } from './workers/stripeWebhookWorker';
import { startWorkspaceProvisioningWorker, stopWorkspaceProvisioningWorker } from './workers/workspaceProvisioningWorker';

// Configure Fastify logger based on environment
const loggerConfig = () => {
  // Completely disable logging
  if (process.env.DISABLE_REQUEST_LOGGING === 'true') {
    return false;
  }

  // Development-friendly logging
  if (process.env.NODE_ENV === 'development' && process.env.PRETTY_LOGS !== 'false') {
    return {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          colorize: true,
          singleLine: true,
          messageFormat: '{reqId} {method} {url} - {statusCode} in {responseTime}ms'
        }
      }
    };
  }

  // Production JSON logging
  return {
    level: process.env.LOG_LEVEL || 'info',
    // Customize log format
    serializers: {
      req(request: any) {
        return {
          method: request.method,
          url: request.url,
          path: request.routerPath,
          parameters: request.params,
          headers: process.env.LOG_HEADERS === 'true' ? request.headers : undefined
        };
      },
      res(reply: any) {
        return {
          statusCode: reply.statusCode
        };
      }
    },
    // Redact sensitive data
    redact: ['req.headers.authorization', 'req.headers["x-sheen-signature"]']
  };
};

const app = fastify({
  logger: loggerConfig(),
  // Trust proxy for proper client IP detection behind load balancers/Cloudflare
  // This makes request.ip return the real client IP from x-forwarded-for
  trustProxy: true,
});

// Register CORS plugin to handle preflight OPTIONS requests
app.register(require('@fastify/cors'), {
  origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
    // Allow localhost for development
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      cb(null, true);
    } else {
      // Allow specific origins from environment variable
      const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [];
      cb(null, allowedOrigins.includes(origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-sheen-signature',
    'x-direct-mode',
    'x-correlation-id',
    'x-api-key',              // Required for in-house CMS/Auth routes
    'idempotency-key',        // Required for idempotent operations
    'Idempotency-Key'         // Case variation support
  ]
});

// Enforce dispatch fallback authentication only when the dispatch header is present
app.addHook('preHandler', requireDispatchSecret());

// Register multipart plugin for file uploads (voice transcription)
// CRITICAL: Must be registered BEFORE routes that use multipart
app.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB (OpenAI limit)
    files: 1                      // Only accept single file
  }
});

// Custom content type parser to preserve raw body for HMAC signature validation
app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    // Store the raw body string on the request object for HMAC validation
    (req as any).rawBody = body;
    // Parse the JSON for normal use
    const json = JSON.parse(body as string);
    done(null, json);
  } catch (err) {
    done(err as Error, undefined);
  }
});

// SSE compression bypass middleware - must run before routes
app.addHook('onRequest', async (request, reply) => {
  // Bypass compression for SSE endpoints to prevent buffering
  if (request.url.includes('/api/workspace/logs/stream')) {
    reply.header('Content-Encoding', 'identity');
    reply.header('X-Accel-Buffering', 'no'); // Nginx directive
  }
});

// Add no-cache headers to admin and auth endpoints (security best practice)
app.addHook('onSend', async (request, reply, payload) => {
  if (request.url.startsWith('/v1/admin') || request.url.startsWith('/v1/inhouse/auth')) {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
  }
  return payload;
});

// Environment config
const SHARED_SECRET = process.env.SHARED_SECRET!;
const PORT = parseInt(process.env.PORT || '3000', 10);
const MAX_GLOBAL_CALLS_PER_HR = parseInt(process.env.MAX_GLOBAL_CALLS_PER_HR || '800', 10);
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

if (!SHARED_SECRET) {
  console.error('SHARED_SECRET environment variable is required');
  process.exit(1);
}

// Rate limit tracking
let globalCalls = 0;
let windowStart = Date.now();
function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > 60 * 60 * 1000) {
    globalCalls = 0;
    windowStart = now;
  }
  if (globalCalls >= MAX_GLOBAL_CALLS_PER_HR) return false;
  globalCalls++;
  return true;
}

export function verifySignature(payload: string, signature: string): boolean {
  const expected = createHmac('sha256', SHARED_SECRET).update(payload).digest('hex');
  // Use timing-safe comparison to prevent timing attacks
  // Both must be same length for timingSafeEqual, so pad/check first
  if (expected.length !== signature.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Health-check endpoint (legacy)
app.get('/myhealthz', async (_, reply) => {
  // Log health check to unified system (for monitoring/alerting)
  unifiedLogger.system('health_check', 'info', 'Health check performed', {
    uptime: process.uptime(),
    globalCalls,
    maxCalls: MAX_GLOBAL_CALLS_PER_HR,
    memoryUsage: process.memoryUsage()
  });

  return reply.send({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    rateLimit: { calls: globalCalls, limit: MAX_GLOBAL_CALLS_PER_HR }
  });
});

// CI/CD health check endpoint - returns version from .version file
app.get('/healthz', async (_, reply) => {
  // Read version from .version file (created during deployment)
  let version = 'unknown';
  try {
    const versionFile = path.join(process.cwd(), '.version');
    if (fs.existsSync(versionFile)) {
      version = fs.readFileSync(versionFile, 'utf-8').trim();
    }
  } catch {
    // Ignore errors reading version file
  }

  return reply.send({
    status: 'ok',
    version,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint for Cloudflare environment testing (DISABLED IN PRODUCTION)
app.get('/debug/cloudflare-env', async (_, reply) => {
  // Block this endpoint in production
  if (process.env.NODE_ENV === 'production') {
    return reply.code(404).send({ error: 'Not found' });
  }
  const cfToken = process.env.CF_API_TOKEN_WORKERS;
  const cfAccountId = process.env.CF_ACCOUNT_ID;

  return reply.send({
    timestamp: new Date().toISOString(),
    workingDirectory: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
    environment: {
      CF_API_TOKEN_WORKERS: cfToken ? `SET (${cfToken.substring(0, 8)}...)` : 'NOT SET',
      CF_ACCOUNT_ID: cfAccountId ? `SET (${cfAccountId})` : 'NOT SET'
    },
    allCloudflareVars: Object.keys(process.env).filter(k => k.includes('CLOUDFLARE') || k.includes('CF_')),
    envVarCount: Object.keys(process.env).length,
    hasToken: !!cfToken,
    hasAccountId: !!cfAccountId,
    tokenLength: cfToken?.length || 0
  });
});

// Debug endpoint for signature testing (DISABLED IN PRODUCTION)
app.post('/debug-signature', async (request, reply) => {
  // Block this endpoint in production
  if (process.env.NODE_ENV === 'production') {
    return reply.code(404).send({ error: 'Not found' });
  }
  const sig = (request.headers['x-sheen-signature'] as string) || '';
  const body = request.body;
  const bodyString = JSON.stringify(body);
  const expectedSig = createHmac('sha256', SHARED_SECRET).update(bodyString).digest('hex');

  // Test with common default secret
  const testSecret = 'your-shared-secret';
  const testSig = createHmac('sha256', testSecret).update(bodyString).digest('hex');

  return reply.send({
    receivedSignature: sig,
    expectedSignature: expectedSig,
    receivedBody: body,
    bodyAsString: bodyString,
    sharedSecretLength: SHARED_SECRET.length,
    signatureMatch: sig === expectedSig,
    headers: request.headers,
    // Additional debug info
    serverSecretFirst5: SHARED_SECRET.substring(0, 5) + '...',
    matchesDefaultSecret: sig === testSig,
    hint: sig === testSig ? 'You are using the default secret "your-shared-secret". Update it in Postman variables!' : 'Check your Postman sharedSecret variable'
  });
});

// Streaming /generate endpoint
app.post('/generate', async (request, reply) => {
  // Validate signature using rawBody (preserved by custom content-type parser)
  // CRITICAL: Must use rawBody, not JSON.stringify - ordering changes break signatures
  const sig = (request.headers['x-sheen-signature'] as string) || '';
  const rawBody = (request as any).rawBody as string | undefined;
  if (!sig || !rawBody || !verifySignature(rawBody, sig)) {
    return reply.code(401).send({ error: 'Invalid signature' });
  }

  // Rate limiting
  if (!checkRateLimit()) {
    return reply.code(429).send({ error: 'Rate limit exceeded' });
  }

  // Extract and validate parameters
  const { userId, projectId, prompt } = request.body as {
    userId?: string;
    projectId?: string;
    prompt?: string;
  };
  if (!userId || !projectId) {
    return reply.code(400).send({ error: 'userId and projectId are required' });
  }
  if (!prompt) {
    return reply.code(400).send({ error: 'Prompt is required' });
  }

  // Enforce safe working directory: ~/projects/{userId}/{projectId}
  const baseDir = path.join(os.homedir(), 'projects');
  const safeDir = path.join(baseDir, userId, projectId);
  const resolvedSafeDir = path.resolve(safeDir);
  const resolvedBaseDir = path.resolve(baseDir) + path.sep;

  if (!resolvedSafeDir.startsWith(resolvedBaseDir)) {
    return reply.code(403).send({ error: 'Invalid project path' });
  }
  if (!fs.existsSync(resolvedSafeDir) || !fs.statSync(resolvedSafeDir).isDirectory()) {
    return reply.code(404).send({ error: 'Project directory not found' });
  }

  // Hijack for streaming JSON response
  reply.hijack();
  const raw = reply.raw as import('http').ServerResponse;
  raw.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });
  // initial heartbeat
  raw.write(' ');

  // Spawn Claude CLI in the safe directory
  const child = spawn(
    'claude',
    // ['-p', prompt, '--output-format', 'json'],
    // ['-p', prompt, '--dangerously-skip-permissions'],
    [
      '-p', prompt,
      '--output-format', 'json',
      '--dangerously-skip-permissions'
    ],
    {
      cwd: resolvedSafeDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  let stdout = '';
  let stderr = '';
  let bufferExceeded = false;

  child.stdout.on('data', (chunk) => {
    const str = chunk.toString();
    if (stdout.length + str.length > MAX_BUFFER_SIZE) {
      bufferExceeded = true;
      child.kill();
      return;
    }
    stdout += str;
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    let payload: any;
    if (bufferExceeded) {
      payload = { success: false, error: 'Output buffer exceeded' };
    } else if (code === 0) {
      try {
        const parsed = JSON.parse(stdout);
        payload = {
          success: true,
          output: parsed.completion ?? parsed.result ?? stdout
        };
      } catch {
        payload = { success: true, output: stdout };
      }
    } else {
      payload = { success: false, error: stderr || `Exit code ${code}` };
    }
    raw.write(JSON.stringify(payload));
    raw.end();
  });
/*
example full response from claude cli:
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 3851,
  "duration_api_ms": 7884,
  "num_turns": 1,
  "result": "Waves whisper secrets, salt kisses the endless blue—horizon dreams.",
  "session_id": "ef92118a-c222-4a2b-ab8a-d5f1fc482b5c",
  "total_cost_usd": 0.08233905,
  "usage": {
    "input_tokens": 4,
    "cache_creation_input_tokens": 3311,
    "cache_read_input_tokens": 10178,
    "output_tokens": 30,
    "server_tool_use": {
      "web_search_requests": 0
    },
    "service_tier": "standard"
  }
}
*/
  child.on('error', (err) => {
    raw.write(JSON.stringify({ success: false, error: err.message }));
    raw.end();
  });

  // no explicit return: response is handled via raw stream
});

// Root debug endpoint
app.get('/', async (_, reply) => {
  return reply
    .type('text/html')
    .send('');
});

// Favicon route - return empty icon to prevent 404s
app.get('/favicon.ico', async (_, reply) => {
  return reply
    .code(204) // No Content
    .send();
});

// Register additional routes
// DEPRECATED: registerBuildPreviewRoutes(app); // Use registerCreatePreviewRoutes instead
registerCreatePreviewRoutes(app);
registerWebhookRoutes(app);
registerGitHubRoutes(app);
registerVersionRoutes(app);
registerPublicationRoutes(app);
updateProjectRoute(app);
recommendationsRoute(app);
buildRecommendationsRoute(app);
registerClaudeHealthRoutes(app);
app.register(healthRoutes); // Comprehensive health monitoring endpoints
registerProgressRoutes(app);
// Register Generated Code Viewer routes
app.register(projectFilesRoutes);
app.register(buildStreamRoutes);
app.register(buildAcceptRoutes);
// DISABLED: Duplicate route - same endpoint exists in progress.ts using clean events system
// app.register(buildsRoutes, { prefix: '/v1' }); // Build events and related endpoints
app.register(buildArtifactsRoutes, { prefix: '/v1' }); // Build artifacts for deployment
versionHistoryRoutes(app);
registerBillingRoutes(app);
app.register(billingOverviewRoutes);
registerStripePaymentRoutes(app);
registerAdvisorNetworkRoutes(app);
// Register website migration tool routes
app.register(migrationRoutes, { prefix: '/api' });
app.register(advisorApplicationRoutes);
app.register(advisorWorkspaceRoutes);

// Register admin panel routes
app.register(adminAuthRoutes); // Authentication exchange endpoint (no middleware)
app.register(adminUsersRoutes); // Admin user management (super_admin only)
app.register(adminMetricsRoutes); // Revenue metrics endpoints (MRR, LTV, ARPU)
app.register(adminPerformanceRoutes); // Web Vitals performance dashboard
app.register(adminPromotionRoutes); // Promotion management (create, analytics, cleanup)
app.register(adminAuditLogRoutes); // Audit log retrieval and statistics
app.register(adminVoiceRecordingRoutes); // Voice recording signed URLs (audio playback)
app.register(adminBuildLogRoutes); // Build log retrieval for admin debugging
app.register(adminUnifiedLogRoutes); // Unified multi-tier log access
app.register(adminLogStreamingRoutes); // Real-time log streaming via WebSocket
app.register(internalEventsRoutes); // Admin access to internal build events
app.register(adminSystemHealthRoutes); // System health dashboard (SLO monitoring)
app.register(adminIncidentRoutes); // Incident management
app.register(adminAlertRoutes); // Alert rules and firing alerts
app.register(adminCustomerHealthRoutes); // Customer health scores
app.register(adminCustomer360Routes); // Customer 360 view
app.register(adminFeatureFlagsRoutes); // Feature flags (kill switches & targeted releases)
app.register(adminInhouseProjectsRoutes); // In-House Mode admin panel (projects, monitoring)
app.register(adminInhouseActivityRoutes); // In-House Mode activity log
app.register(adminInhouseFlagsRoutes); // In-House Mode flags admin
app.register(adminInhouseConnectorsRoutes); // In-House Mode connectors admin
app.register(adminInhouseAIRoutes); // In-House Mode AI admin
app.register(adminInhouseRealtimeRoutes); // In-House Mode Realtime admin
app.register(adminInhouseNotificationsRoutes); // In-House Mode Notifications admin
app.register(adminInhouseFormsRoutes); // In-House Mode Forms admin
app.register(adminInhouseSearchRoutes); // In-House Mode Search admin
app.register(adminInhouseBackupsRoutes); // In-House Mode Backups admin
app.register(adminInhouseJobsRoutes); // In-House Mode Jobs admin
app.register(adminInhouseEmailsRoutes); // In-House Mode Emails admin
app.register(adminInhouseStorageRoutes); // In-House Mode Storage admin
app.register(adminInhousePaymentsRoutes); // In-House Mode Payments admin
app.register(adminInhouseAuthRoutes); // In-House Mode Auth admin
app.register(adminInhouseMonitoringRoutes); // In-House Mode Monitoring admin
app.register(adminInhouseUsageRoutes); // In-House Mode Usage/Quotas admin
app.register(adminInhouseAnalyticsRoutes); // In-House Mode Analytics admin
app.register(adminInhouseAlertsRoutes); // In-House Mode Alerts admin
app.register(adminInhouseSecretsRoutes); // In-House Mode Secrets admin
app.register(adminInhouseRevenueRoutes); // In-House Mode Revenue admin
app.register(adminInhouseEmailDomainsRoutes); // In-House Mode Email Domains admin
app.register(adminInhouseRegisteredDomainsRoutes); // In-House Mode Registered Domains admin
app.register(adminInhouseWebhookEventsRoutes); // In-House Mode Webhook Events admin
app.register(adminInhouseHealthRoutes); // In-House Mode Health endpoints
app.register(adminInhouseMailboxesRoutes); // In-House Mode Mailboxes admin
app.register(adminInhouseInboxRoutes); // In-House Mode Inbox admin
app.register(adminInhouseDatabaseRoutes); // In-House Mode Database Inspector
app.register(adminInhouseObservabilityRoutes); // In-House Mode Observability Links
app.register(adminInhouseSupportRoutes); // In-House Mode Support Tools (Impersonation, Replay)
app.register(adminInhouseRunHubRoutes); // In-House Mode Run Hub admin (workflows, business events, KPI health)
app.register(adminInhouseOpenClawRoutes); // In-House Mode OpenClaw AI Assistant admin
registerAdminRoutes(app);
registerAdminPricingRoutes(app);
app.register(adminBilling, { prefix: '/admin/billing' });
registerSupportTicketRoutes(app);
registerTrustSafetyRoutes(app);
// Register referral program routes
registerReferralPartnerRoutes(app);
registerAdminReferralRoutes(app);

registerChatPlanRoutes(app);
app.register(persistentChatRoutes);
registerUnifiedChatRoutes(app);
registerHmacDebugRoutes(app);

// Register Sanity CMS integration routes
app.register(sanityRoutes);
// Register career portal routes
app.register(careersRoutes);
app.register(careerAdminRoutes);

// Register Feedback Collection System routes
app.register(feedbackRoutes);
console.log('[Server] Feedback collection routes registered');

// Register Integration Status System routes
app.register(integrationStatusRoutes, { prefix: '/api/integrations' });

// Register Supabase OAuth integration routes
app.register(supabaseOAuthRoutes);
app.register(supabaseOAuthCallbackRoutes);
app.register(supabaseDeploymentRoutes);
app.register(supabaseBreakglassRoutes);

// Register Cloudflare three-lane deployment routes
app.register(cloudflareThreeLaneRoutes);

// Register In-House Mode (Easy Mode) routes
app.register(inhouseGatewayRoutes);
app.register(inhouseProjectRoutes);
app.register(inhouseDeploymentRoutes);
app.register(inhouseAuthRoutes);
app.register(platformMobileAuthRoutes);
app.register(inhouseCmsRoutes);
app.register(inhouseCmsAdminRoutes);
app.register(inhouseDomainsRoutes);
app.register(inhouseStorageRoutes);
app.register(inhouseJobsRoutes);
app.register(inhouseEmailRoutes);
app.register(inhouseEmailDomainsRoutes);
app.register(inhouseMailboxRoutes);
app.register(inhouseDomainRegistrationRoutes);
app.register(inhouseDomainTransferRoutes);
app.register(inhouseInboxRoutes);
app.register(inhouseInboxSummaryRoutes);
app.register(inhouseEmailOverviewRoutes);
app.register(inhouseInboxWebhookRoutes);
app.register(opensrsWebhookRoutes);
app.register(inhousePaymentsRoutes);
app.register(inhouseAnalyticsRoutes);
app.register(inhouseBusinessEventsRoutes);
app.register(inhouseBusinessKpisRoutes);
app.register(inhouseRunAlertsRoutes);
app.register(inhouseRunOverviewRoutes);
app.register(inhouseWorkflowRunsRoutes);
app.register(inhouseBackupRoutes);
app.register(inhouseFlagsRoutes);
app.register(inhouseConnectorsRoutes);
app.register(inhouseEdgeFunctionsRoutes);
app.register(inhouseAIRoutes);
app.register(inhouseRealtimeRoutes);
app.register(inhouseNotificationsRoutes);
app.register(inhouseFormsRoutes);
app.register(inhouseSearchRoutes);
app.register(figmaImportRoutes);
console.log('[Server] In-House Mode routes registered (including backup, flags, connectors, edge functions, ai, realtime, notifications, forms, search, and figma import routes)');

// Register voice transcription routes
registerVoiceTranscriptionRoutes(app);
console.log('[Server] Voice transcription routes registered');

// Register real-time transcription routes (OpenAI streaming for Safari/Firefox)
registerRealtimeTranscriptionRoutes(app);
registerTranscribeRoutes(app);
console.log('[Server] Real-time transcription routes registered at /v1/realtime/transcribe');

// Register demo voice transcription routes (unauthenticated, for homepage)
app.register(voiceTranscriptionDemoRoutes);
console.log('[Server] Demo voice transcription routes registered');

// Register debug routes (development only)
if (process.env.NODE_ENV !== 'production') {
  registerProjectStatusRoutes(app);
  console.log('[Server] Debug project status routes registered');
}

// Register E2E mode plugin (adds isE2ERequest and e2eRunId to requests via decorateRequest)
app.register(e2eModePlugin);

// Register E2E cleanup routes (only active when E2E_MODE=true)
app.register(e2eCleanupRoutes);
console.log('[Server] E2E mode plugin and cleanup routes registered (active when E2E_MODE=true)');

// Setup Bull Board for queue monitoring
const serverAdapter = new FastifyAdapter();
serverAdapter.setBasePath('/admin/queues');

const archMode = process.env.ARCH_MODE || 'monolith';

// Create Bull Board with appropriate queues based on architecture mode
// Filter out null queues (can happen in test mode)
if (archMode === 'stream') {
  const queues = [streamQueue, deployQueue, webhookQueue, migrationQueue, inboxWebhookQueue, inboxRetentionQueue, domainVerificationQueue]
    .filter((q): q is NonNullable<typeof q> => q !== null)
    .map(q => new BullMQAdapter(q, { readOnlyMode: false }));
  createBullBoard({ queues, serverAdapter: serverAdapter });
} else if (archMode === 'modular') {
  const queues = [planQueue, taskQueue, deployQueue, webhookQueue, migrationQueue, inboxWebhookQueue, inboxRetentionQueue, domainVerificationQueue]
    .filter((q): q is NonNullable<typeof q> => q !== null)
    .map(q => new BullMQAdapter(q, { readOnlyMode: false }));
  createBullBoard({ queues, serverAdapter: serverAdapter });
} else {
  const queues = [buildQueue, migrationQueue]
    .filter((q): q is NonNullable<typeof q> => q !== null)
    .map(q => new BullMQAdapter(q, { readOnlyMode: false }));
  createBullBoard({ queues, serverAdapter: serverAdapter });
}

// Register Bull Board routes with basic auth (optional)
app.register(async function (fastify) {
  // Optional: Add basic authentication for production
  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_PASSWORD) {
    fastify.addHook('preHandler', async (request, reply) => {
      const auth = request.headers.authorization;
      if (!auth || !auth.startsWith('Basic ')) {
        reply.header('WWW-Authenticate', 'Basic realm="Admin"');
        reply.code(401).send({ error: 'Authentication required' });
        return;
      }

      const [username, password] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
      if (username !== 'admin' || password !== process.env.ADMIN_PASSWORD) {
        reply.code(401).send({ error: 'Invalid credentials' });
        return;
      }
    });
  }

  await fastify.register(serverAdapter.registerPlugin());
}, { prefix: '/admin/queues' });

// Initialize services and start server
async function startServer() {
  try {
    // 🔍 DEBUG: Environment variable analysis at startup
    console.log('\n🔍 [Environment Debug] Server Startup Analysis:');
    console.log(`📅 Server built at: ${process.env.BUILD_TIMESTAMP || 'unknown'}`);
    console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`📍 Working Directory: ${process.cwd()}`);
    console.log(`🔐 Environment Analysis:`);
    console.log(`   CF_API_TOKEN_WORKERS: ${process.env.CF_API_TOKEN_WORKERS ? '✅ SET (' + process.env.CF_API_TOKEN_WORKERS.substring(0, 8) + '...)' : '❌ NOT SET'}`);
    console.log(`   CF_ACCOUNT_ID: ${process.env.CF_ACCOUNT_ID ? '✅ SET (' + process.env.CF_ACCOUNT_ID + ')' : '❌ NOT SET'}`);
    console.log(`   SHARED_SECRET: ${process.env.SHARED_SECRET ? '✅ SET (' + process.env.SHARED_SECRET.length + ' chars)' : '❌ NOT SET'}`);
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`   All CLOUDFLARE env vars: ${Object.keys(process.env).filter(k => k.includes('CLOUDFLARE')).join(', ') || 'none'}`);
    console.log('');

    // Initialize pnpm cache
    await initializePnpmCache();

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Failed to connect to database. Please check DATABASE_URL');
      // Continue anyway - we might be running without DB for now
    }

    // Infrastructure readiness gate — verifies external services are reachable
    await assertInfraReady();

    // Initialize Error Recovery System
    console.log('🔧 Attempting to initialize Error Recovery System...');
    try {
      await initializeErrorRecoverySystem({
        enabled: process.env.ERROR_RECOVERY_ENABLED !== 'false', // Default to enabled
        claude: {
          enabled: process.env.CLAUDE_RECOVERY_ENABLED === 'true',
          apiKey: process.env.CLAUDE_API_KEY,
          model: 'claude-3-sonnet-20240229',
          maxCostPerHour: parseFloat(process.env.ERROR_RECOVERY_MAX_COST_PER_HOUR || '5.0')
        },
        sandbox: {
          enabled: process.env.ERROR_RECOVERY_SANDBOX !== 'false', // Default to enabled
          maxConcurrent: parseInt(process.env.ERROR_RECOVERY_MAX_CONCURRENT || '3'),
          cleanupIntervalHours: parseInt(process.env.ERROR_RECOVERY_CLEANUP_HOURS || '2')
        }
      });
      // console.log('✅ Error Recovery System initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Error Recovery System:', error);
      console.warn('⚠️  Continuing without error recovery - manual intervention required for build failures');
    }

    // Phase 3: Early Claude CLI detection for fail-fast feedback
    try {
      const { execSync } = require('child_process');
      const claudePath = execSync('command -v claude', { encoding: 'utf8' }).trim();
      console.log(`✅ Claude CLI found at: ${claudePath}`);
    } catch (error) {
      console.warn('⚠️  Claude CLI not found in PATH - modular workers may fail');
      console.warn('   Install Claude CLI with: npm install -g @anthropic-ai/claude-code');
    }

    // Check if direct mode is enabled
    if (isDirectModeEnabled()) {
      console.log('🎯 Direct mode enabled - skipping Redis/BullMQ setup');
      console.log('   Builds will execute synchronously without queueing');
    } else {
      // Check architecture mode
      const archMode = process.env.ARCH_MODE || 'monolith';
      const buildTime = new Date().toISOString();
      console.log(`📅 Server built at: ${buildTime}`);
      console.log(`🏗️  Architecture mode: ${archMode.toUpperCase()}`);

      if (archMode === 'stream') {
        // Stream mode needs both stream worker AND Claude CLI main process for chat-plan
        try {
          // Initialize Claude CLI main process for chat-plan feature
          await claudeCLIMainProcess.initialize();
          console.log('✅ Claude CLI main process service initialized for chat-plan');
        } catch (error) {
          console.error('Failed to initialize Claude CLI main process:', error);
          // Continue anyway as it's only needed for chat-plan
        }

        try {
          // Start stream worker but don't wait for it - run() might not resolve until it processes a job
          startStreamWorker().then(() => {
            console.log('✅ Stream worker started successfully');
          }).catch((error) => {
            console.error('Failed to start stream worker:', error);
          });
          console.log('✅ Stream worker initialization triggered');
        } catch (error) {
          console.error('Failed to start stream worker:', error);
          throw error;
        }

        try {
          // Start deploy worker to process deployment jobs queued by stream worker
          await startDeployWorker();
          console.log('✅ Deploy worker started for stream mode');
        } catch (error) {
          console.error('Failed to start deploy worker:', error);
          throw error;
        }

        // Start Stripe webhook worker (if configured)
        try {
          initializeStripeWebhookWorker();
          console.log('✅ Stripe webhook worker initialized');
        } catch (error) {
          console.error('Failed to start Stripe webhook worker:', error);
          // Don't throw - Stripe webhooks are not critical for basic functionality
        }

        // Start Cal.com webhook worker (if configured)
        try {
          initializeCalComWebhookWorker();
          console.log('✅ Cal.com webhook worker initialized');
        } catch (error) {
          console.error('Failed to start Cal.com webhook worker:', error);
          // Don't throw - Cal.com webhooks are not critical for basic functionality
        }

        // Start inbox webhook worker for inbound email processing
        try {
          initializeInboxWebhookWorker();
          console.log('✅ Inbox webhook worker initialized');
        } catch (error) {
          console.error('Failed to start inbox webhook worker:', error);
          // Don't throw - inbox webhooks are not critical for basic functionality
        }

        // Start inbox retention worker for periodic message cleanup
        try {
          await initializeInboxRetentionWorker();
          console.log('✅ Inbox retention worker initialized');
        } catch (error) {
          console.error('Failed to start inbox retention worker:', error);
          // Don't throw - retention worker is not critical for basic functionality
        }

        // Start domain verification worker for periodic DNS verification
        try {
          await initializeDomainVerificationWorker();
          console.log('✅ Domain verification worker initialized');
        } catch (error) {
          console.error('Failed to start domain verification worker:', error);
          // Don't throw - domain verification is not critical for basic functionality
        }

        // Start domain renewal worker for auto-renewals and reminders
        try {
          await initializeDomainRenewalWorker();
          console.log('✅ Domain renewal worker initialized');
        } catch (error) {
          console.error('Failed to start domain renewal worker:', error);
          // Don't throw - domain renewal worker is not critical for basic functionality
        }

        // Start OpenClaw webhook worker for AI Assistant events
        try {
          startOpenClawWebhookWorker();
          console.log('✅ OpenClaw webhook worker initialized');
        } catch (error) {
          console.error('Failed to start OpenClaw webhook worker:', error);
          // Don't throw - OpenClaw is not critical for basic functionality
        }

        // Start alert evaluator worker for admin alerting system
        try {
          startAlertEvaluator();
          console.log('✅ Alert evaluator worker started');
        } catch (error) {
          console.error('Failed to start alert evaluator worker:', error);
          // Don't throw - alert evaluator is not critical for basic functionality
        }

        // Start health score worker for customer health monitoring (runs nightly)
        try {
          startHealthScoreWorker();
          console.log('✅ Health score worker started');
        } catch (error) {
          console.error('Failed to start health score worker:', error);
          // Don't throw - health score worker is not critical for basic functionality
        }
      } else if (archMode === 'modular') {
        // Initialize Claude CLI main process service for modular mode
        try {
          await claudeCLIMainProcess.initialize();
          console.log('✅ Claude CLI main process service initialized');
        } catch (error) {
          console.error('Failed to initialize Claude CLI main process:', error);
          throw error;
        }

        // Start modular workers
        try {
          await startModularWorkers();
          console.log('✅ Modular workers started successfully');
        } catch (error) {
          console.error('Failed to start modular workers:', error);
          throw error;
        }

        // Start GitHub sync worker (if configured)
        try {
          await startGitHubSyncWorker();
          console.log('✅ GitHub sync worker started successfully');
        } catch (error) {
          console.error('Failed to start GitHub sync worker:', error);
          // Don't throw - GitHub sync is optional
        }

        // Start Stripe webhook worker (if configured)
        try {
          initializeStripeWebhookWorker();
          console.log('✅ Stripe webhook worker initialized');
        } catch (error) {
          console.error('Failed to start Stripe webhook worker:', error);
          // Don't throw - Stripe webhooks are not critical for basic functionality
        }

        // Start Cal.com webhook worker (if configured)
        try {
          initializeCalComWebhookWorker();
          console.log('✅ Cal.com webhook worker initialized');
        } catch (error) {
          console.error('Failed to start Cal.com webhook worker:', error);
          // Don't throw - Cal.com webhooks are not critical for basic functionality
        }

        // Start inbox webhook worker for inbound email processing
        try {
          initializeInboxWebhookWorker();
          console.log('✅ Inbox webhook worker initialized');
        } catch (error) {
          console.error('Failed to start inbox webhook worker:', error);
          // Don't throw - inbox webhooks are not critical for basic functionality
        }

        // Start inbox retention worker for periodic message cleanup
        try {
          await initializeInboxRetentionWorker();
          console.log('✅ Inbox retention worker initialized');
        } catch (error) {
          console.error('Failed to start inbox retention worker:', error);
          // Don't throw - retention worker is not critical for basic functionality
        }

        // Start domain verification worker for periodic DNS verification
        try {
          await initializeDomainVerificationWorker();
          console.log('✅ Domain verification worker initialized');
        } catch (error) {
          console.error('Failed to start domain verification worker:', error);
          // Don't throw - domain verification is not critical for basic functionality
        }

        // Start domain renewal worker for auto-renewals and reminders
        try {
          await initializeDomainRenewalWorker();
          console.log('✅ Domain renewal worker initialized');
        } catch (error) {
          console.error('Failed to start domain renewal worker:', error);
          // Don't throw - domain renewal worker is not critical for basic functionality
        }

        // Start OpenClaw webhook worker for AI Assistant events
        try {
          startOpenClawWebhookWorker();
          console.log('✅ OpenClaw webhook worker initialized');
        } catch (error) {
          console.error('Failed to start OpenClaw webhook worker:', error);
          // Don't throw - OpenClaw is not critical for basic functionality
        }

        // Start workspace provisioning worker for advisor matching
        try {
          startWorkspaceProvisioningWorker();
          console.log('✅ Workspace provisioning worker started');
        } catch (error) {
          console.error('Failed to start workspace provisioning worker:', error);
          // Don't throw - worker will auto-restart on next server restart
        }

        // Start alert evaluator worker for admin alerting system
        try {
          startAlertEvaluator();
          console.log('✅ Alert evaluator worker started');
        } catch (error) {
          console.error('Failed to start alert evaluator worker:', error);
          // Don't throw - alert evaluator is not critical for basic functionality
        }

        // Start health score worker for customer health monitoring (runs nightly)
        try {
          startHealthScoreWorker();
          console.log('✅ Health score worker started');
        } catch (error) {
          console.error('Failed to start health score worker:', error);
          // Don't throw - health score worker is not critical for basic functionality
        }
      } else {
        // Start monolith build worker
        try {
          createBuildWorker();
          console.log('Build worker started');

          // Monitor queue events
          buildQueueEvents.on('waiting' as any, (job: any) => {
            console.log(`Job ${job.id} is waiting`);
          });

          buildQueueEvents.on('active' as any, (job: any) => {
            console.log(`Job ${job.id} is active`);
          });

          buildQueueEvents.on('completed' as any, (job: any) => {
            console.log(`Job ${job.id} completed`);
          });

          buildQueueEvents.on('failed' as any, (job: any, err: any) => {
            console.error(`Job ${job?.id} failed:`, err);
          });
        } catch (error) {
          console.error('Failed to start build worker:', error);
          console.log('You can enable direct mode by setting SKIP_QUEUE=true');
        }
      }
    }

    // Start cleanup job
    cleanupJob.start();

    // Start daily AI time reset job
    dailyResetJob.start();

    // Start enhanced daily bonus reset job (runs at 00:05 UTC)
    enhancedDailyBonusResetJob.start();

    // Start monthly rollover job (runs 1st of month at 00:15 UTC)
    monthlyRolloverJob.start();

    // Start ghost build detection job
    ghostBuildDetectionJob.start();

    // Start R2 cleanup job
    r2CleanupJob.start();

    // Start log cleanup job (runs at 02:00 UTC)
    logCleanupJob.start();

    // Initialize scheduled jobs (exchange rates, materialized view refresh)
    initializeScheduledJobs();

    // Start server
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server listening at http://0.0.0.0:${PORT}`);
    console.log('MOCK_CLAUDE is:', process.env.MOCK_CLAUDE); // trigger restart

    // Log server startup to unified logging system
    unifiedLogger.lifecycle('server_start', 'fastify-api', `Server started successfully on port ${PORT}`, {
      port: PORT,
      nodeEnv: process.env.NODE_ENV,
      instanceId: unifiedLogger.getInstanceId(),
      mockClaude: process.env.MOCK_CLAUDE === 'true'
    });
  } catch (err) {
    console.error('Failed to start:', err);

    // Log startup failure to unified logging system
    unifiedLogger.system('error', 'fatal', `Server startup failed: ${err instanceof Error ? err.message : String(err)}`, {
      error: err instanceof Error ? {
        name: err.name,
        message: err.message,
        stack: err.stack
      } : { message: String(err) },
      port: PORT,
      nodeEnv: process.env.NODE_ENV
    });

    process.exit(1);
  }
}

// Handle graceful shutdown
const shutdownHandler = async () => {
  console.log('Shutting down gracefully...');

  // Log shutdown start to unified logging system
  unifiedLogger.lifecycle('server_stop', 'fastify-api', 'Server shutdown initiated', {
    instanceId: unifiedLogger.getInstanceId(),
    uptime: process.uptime()
  });

  // First, tell error interceptor to stop processing
  const { getErrorInterceptor } = require('./services/errorInterceptor');
  const errorInterceptor = getErrorInterceptor();
  errorInterceptor.shutdown();

  // Stop cleanup job
  cleanupJob.stop();

  // Stop daily AI time reset job
  dailyResetJob.stop();

  // Stop enhanced daily bonus reset job
  enhancedDailyBonusResetJob.stop();

  // Stop monthly rollover job
  monthlyRolloverJob.stop();

  // Stop ghost build detection job
  ghostBuildDetectionJob.stop();

  // Stop R2 cleanup job
  r2CleanupJob.stop();

  // Stop log cleanup job
  logCleanupJob.stop();

  // Shutdown error recovery system
  try {
    const errorRecoverySystem = getErrorRecoverySystem();
    await errorRecoverySystem.shutdown();
    console.log('✅ Error Recovery System shut down');
  } catch (error) {
    console.error('❌ Error shutting down Error Recovery System:', error);
  }

  // Shutdown OpenTelemetry with cluster-safe handling
  try {
    const { shutdownClusterSafeTelemetry } = require('./observability/cluster-safe');
    await shutdownClusterSafeTelemetry();
    console.log('✅ OpenTelemetry shut down');
  } catch (error) {
    console.error('❌ Error shutting down OpenTelemetry:', error);
  }

  // Shutdown workers based on architecture mode
  const archMode = process.env.ARCH_MODE || 'monolith';
  if (!isDirectModeEnabled()) {
    if (archMode === 'stream') {
      await shutdownStreamWorker();
      await shutdownDeployWorker();
      // Also shutdown Claude CLI main process if it was initialized for chat-plan
      try {
        await claudeCLIMainProcess.shutdown();
      } catch (error) {
        // Ignore errors if it wasn't initialized
      }
    } else if (archMode === 'modular') {
      await shutdownModularWorkers();
      await claudeCLIMainProcess.shutdown();
    }

    // Shutdown GitHub sync worker
    try {
      await stopGitHubSyncWorker();
    } catch (error) {
      console.error('Error shutting down GitHub sync worker:', error);
    }

    // Shutdown workspace provisioning worker
    try {
      await stopWorkspaceProvisioningWorker();
    } catch (error) {
      console.error('Error shutting down workspace provisioning worker:', error);
    }

    // Shutdown alert evaluator worker
    try {
      stopAlertEvaluator();
    } catch (error) {
      console.error('Error shutting down alert evaluator worker:', error);
    }

    // Shutdown health score worker
    try {
      stopHealthScoreWorker();
    } catch (error) {
      console.error('Error shutting down health score worker:', error);
    }

    // Shutdown Stripe webhook worker
    try {
      await shutdownStripeWebhookWorker();
    } catch (error) {
      console.error('Error shutting down Stripe webhook worker:', error);
    }

    // Shutdown inbox webhook worker
    try {
      await shutdownInboxWebhookWorker();
    } catch (error) {
      console.error('Error shutting down inbox webhook worker:', error);
    }

    // Shutdown inbox retention worker
    try {
      await shutdownInboxRetentionWorker();
    } catch (error) {
      console.error('Error shutting down inbox retention worker:', error);
    }

    // Shutdown domain verification worker
    try {
      await shutdownDomainVerificationWorker();
    } catch (error) {
      console.error('Error shutting down domain verification worker:', error);
    }

    // Shutdown domain renewal worker
    try {
      await shutdownDomainRenewalWorker();
    } catch (error) {
      console.error('Error shutting down domain renewal worker:', error);
    }

    // Shutdown OpenClaw webhook worker
    try {
      await stopOpenClawWebhookWorker();
    } catch (error) {
      console.error('Error shutting down OpenClaw webhook worker:', error);
    }
  }

  // Close all BullMQ queues and QueueEvents (Redis connections)
  try {
    await closeAllQueues();
  } catch (error) {
    console.error('Error closing BullMQ queues:', error);
  }

  // Shutdown shared best-effort Redis client
  try {
    await shutdownBestEffortRedis();
  } catch (error) {
    console.error('Error shutting down best-effort Redis:', error);
  }

  // Gracefully shutdown unified logging system (flush all log streams)
  try {
    console.log('[Server] Flushing unified logging system...');
    await unifiedLogger.shutdown();
    console.log('[Server] Unified logging system flushed successfully');
  } catch (error) {
    console.error('[Server] Error flushing unified logging system:', error);
    // Continue with server shutdown even if logging flush fails
  }

  await app.close();
  process.exit(0);
};

process.on('SIGTERM', shutdownHandler);
process.on('SIGINT', shutdownHandler);

// Start the server
startServer();

export { app };
