// Environment variable validation with fail-fast
export function validateEnvironment(): void {
  const required = [
    'SHARED_SECRET',
    'DATABASE_URL',
    'CF_ACCOUNT_ID',
    'CF_API_TOKEN_WORKERS',
    'CF_API_TOKEN_R2',
    'R2_BUCKET_NAME',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'CF_KV_NAMESPACE_ID',
    'CF_PAGES_PROJECT_NAME'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ FATAL: Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('\n📝 Copy .env.example to .env and fill in the values');
    process.exit(1);
  }

  // In-House Mode validation (Gate 1 requirement)
  validateInhouseEnvironment();
  
  // Validate Redis based on architecture mode
  const archMode = process.env.ARCH_MODE || 'stream';  // Default to stream (current production mode)
  const skipQueue = process.env.SKIP_QUEUE === 'true' || process.env.DIRECT_MODE === 'true';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (!skipQueue && archMode !== 'direct' && !isDevelopment) {
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      console.error('❌ FATAL: Redis configuration required for queue mode');
      console.error('  Set REDIS_URL or REDIS_HOST/REDIS_PORT');
      console.error('  Or set SKIP_QUEUE=true or DIRECT_MODE=true for direct mode');
      process.exit(1);
    }
  }
  
  // Warn about important optional variables
  const important = [
    { key: 'LOG_LEVEL', default: 'info' },
    { key: 'PORT', default: '3000' },
    { key: 'NODE_ENV', default: 'production' }
  ];
  
  important.forEach(({ key, default: defaultValue }) => {
    if (!process.env[key]) {
      console.warn(`⚠️  ${key} not set, using default: ${defaultValue}`);
      process.env[key] = defaultValue;
    }
  });
  
  console.log('✅ Environment validation passed');
  console.log(`📊 Mode: ${archMode}, Queue: ${!skipQueue}, Environment: ${process.env.NODE_ENV}`);
}

/**
 * Validate In-House Mode environment variables
 *
 * Gate 1 requirement: System should fail fast if in-house infra isn't configured.
 * This prevents "half-wired staging" where random endpoints fail later.
 *
 * Strategy:
 * - If INHOUSE_MODE_ENABLED=true, require all in-house vars
 * - If not explicitly enabled, warn about missing vars (allows gradual rollout)
 */
export function validateInhouseEnvironment(): void {
  const inhouseModeEnabled = process.env.INHOUSE_MODE_ENABLED === 'true'

  // Core in-house infrastructure vars
  const inhouseRequired = [
    'CF_KV_NAMESPACE_HOSTNAME',   // KV for subdomain → projectId mapping
    'CF_KV_NAMESPACE_BUILDS',     // KV for projectId → buildId mapping
    'CF_R2_BUCKET_BUILDS',        // R2 bucket for static assets
    'CF_DISPATCH_NAMESPACE',      // Workers for Platforms namespace
  ]

  // Optional vars with sensible defaults
  const inhouseOptional = [
    { key: 'CF_R2_BUCKET_MEDIA', default: 'sheenapps-media' },
    { key: 'INHOUSE_CUSTOM_DOMAINS_ENABLED', default: 'false' },
    { key: 'INHOUSE_EXPORTS_ENABLED', default: 'false' },
    { key: 'INHOUSE_EJECT_ENABLED', default: 'false' },
    { key: 'INHOUSE_CUSTOM_DOMAINS_CNAME_TARGET', default: 'custom.sheenapps.com' },
    { key: 'INHOUSE_MAGIC_LINK_RETURN_TOKEN', default: 'false' },
  ]

  const missing = inhouseRequired.filter(key => !process.env[key])

  if (inhouseModeEnabled) {
    // Strict mode: fail fast if any required var is missing
    if (missing.length > 0) {
      console.error('❌ FATAL: In-House Mode enabled but missing required environment variables:')
      missing.forEach(key => console.error(`  - ${key}`))
      console.error('\n📝 Either set these variables or disable INHOUSE_MODE_ENABLED')
      process.exit(1)
    }
    console.log('✅ In-House Mode: All required environment variables present')
  } else {
    // Permissive mode: warn about missing vars but don't fail
    if (missing.length > 0) {
      console.warn('⚠️  In-House Mode: Some environment variables not configured:')
      missing.forEach(key => console.warn(`  - ${key} (will use fallback or disable feature)`))
      console.warn('  Set INHOUSE_MODE_ENABLED=true to enforce strict validation')
    }
  }

  // Set defaults for optional vars
  inhouseOptional.forEach(({ key, default: defaultValue }) => {
    if (!process.env[key]) {
      process.env[key] = defaultValue
    }
  })

  // Log feature flag status
  const featureFlags = {
    customDomains: process.env.INHOUSE_CUSTOM_DOMAINS_ENABLED === 'true',
    exports: process.env.INHOUSE_EXPORTS_ENABLED === 'true',
    eject: process.env.INHOUSE_EJECT_ENABLED === 'true',
  }
  console.log(`📊 In-House Features: domains=${featureFlags.customDomains}, exports=${featureFlags.exports}, eject=${featureFlags.eject}`)

  // Validate Easy Mode SDK environment variables
  validateEasyModeSDKEnvironment(inhouseModeEnabled)
}

/**
 * Validate Easy Mode SDK environment variables
 *
 * These are required for the @sheenapps/* SDK services to function:
 * - Secrets: Envelope encryption for third-party API keys
 * - Email: Transactional email delivery via Resend
 * - Backups: Database backup encryption
 *
 * When INHOUSE_MODE_ENABLED=true, missing vars cause fatal startup error.
 * When false, we warn but allow startup (services will fail at runtime).
 */
/**
 * Async infrastructure readiness gate.
 * Verifies that external services (DB, R2, KV, Redis) are actually reachable,
 * not just that env vars are present.
 *
 * Called in startServer() before app.listen().
 * Logs results for operational visibility; optionally blocks startup in strict mode.
 */
export async function assertInfraReady(): Promise<void> {
  const inhouseEnabled = process.env.INHOUSE_MODE_ENABLED === 'true'

  interface CheckResult {
    name: string
    ok: boolean
    error?: string
    durationMs: number
  }

  async function runCheck(name: string, fn: () => Promise<void>): Promise<CheckResult> {
    const start = Date.now()
    try {
      await fn()
      return { name, ok: true, durationMs: Date.now() - start }
    } catch (err) {
      return {
        name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }
    }
  }

  const checks = await Promise.all([
    // 1. Database reachable
    runCheck('Database (Neon)', async () => {
      const { pool } = await import('../services/database')
      if (!pool) throw new Error('DATABASE_URL not configured')
      await pool.query('SELECT 1')
    }),

    // 2. Redis reachable
    runCheck('Redis', async () => {
      const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL
      if (!redisUrl) throw new Error('No Redis URL configured')
      const Redis = (await import('ioredis')).default
      const client = new Redis(redisUrl, { connectTimeout: 5000, lazyConnect: true })
      try {
        await client.connect()
        await client.ping()
      } finally {
        client.disconnect()
      }
    }),

    // 3. Resend API key valid (lightweight check — HEAD request)
    runCheck('Resend (Email)', async () => {
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) throw new Error('RESEND_API_KEY not configured')
      const resp = await fetch('https://api.resend.com/domains', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      })
      if (resp.status === 401) throw new Error('Invalid API key')
      // 200 or 403 (scope issue) means key is valid
    }),

    // 4. Cloudflare API reachable (verify token)
    runCheck('Cloudflare Workers API', async () => {
      const token = process.env.CF_API_TOKEN_WORKERS
      if (!token) throw new Error('CF_API_TOKEN_WORKERS not configured')
      const resp = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      })
      const data = await resp.json() as { success?: boolean }
      if (!data.success) throw new Error('Token verification failed')
    }),
  ])

  // Log all results
  console.log('\n🏗️  Infrastructure Readiness Check:')
  for (const check of checks) {
    const icon = check.ok ? '✅' : '❌'
    const timing = `${check.durationMs}ms`
    const detail = check.error ? ` — ${check.error}` : ''
    console.log(`  ${icon} ${check.name} (${timing})${detail}`)
  }

  const failed = checks.filter((c) => !c.ok)
  if (failed.length > 0) {
    if (inhouseEnabled) {
      console.error(
        `\n❌ FATAL: ${failed.length} infrastructure check(s) failed. Fix before serving traffic.`
      )
      process.exit(1)
    } else {
      console.warn(
        `\n⚠️  ${failed.length} infrastructure check(s) failed (non-fatal — INHOUSE_MODE_ENABLED is not true)`
      )
    }
  } else {
    console.log('  ✅ All infrastructure checks passed\n')
  }
}

function validateEasyModeSDKEnvironment(strictMode: boolean): void {
  const sdkRequired = [
    { key: 'SHEEN_SECRETS_MASTER_KEY', service: 'Secrets (envelope encryption)' },
    { key: 'RESEND_API_KEY', service: 'Email (Resend delivery)' },
    { key: 'SHEEN_BACKUP_MASTER_KEY', service: 'Backups (backup encryption)' },
  ]

  const missing = sdkRequired.filter(({ key }) => !process.env[key])

  if (strictMode) {
    // Strict mode: fail fast if any SDK var is missing
    if (missing.length > 0) {
      console.error('❌ FATAL: Easy Mode SDK services require these environment variables:')
      missing.forEach(({ key, service }) => console.error(`  - ${key} (${service})`))
      console.error('\n📝 Set these variables or disable INHOUSE_MODE_ENABLED')
      process.exit(1)
    }
    console.log('✅ Easy Mode SDK: All required environment variables present')
  } else {
    // Permissive mode: warn but don't fail
    if (missing.length > 0) {
      console.warn('⚠️  Easy Mode SDK: Some environment variables not configured:')
      missing.forEach(({ key, service }) => console.warn(`  - ${key} (${service}) - service will fail at runtime`))
    }
  }
}