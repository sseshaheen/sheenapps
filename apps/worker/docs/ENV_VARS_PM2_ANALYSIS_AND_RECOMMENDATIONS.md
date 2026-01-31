# Environment Variables & PM2 Configuration: Analysis and Recommendations

## Executive Summary

After analyzing the sheenapps-claude-worker codebase against the proposed ENV_VARS_PM2_CONFIGURATION_PLAN, I've identified significant strengths in your infrastructure but also critical gaps that need immediate attention. The codebase shows **sophisticated engineering** with excellent health monitoring and queue management, but has **fundamental gaps** in environment variable validation and PM2 configuration.

## 🔍 Codebase Analysis Results

### 1. Environment Variables Usage

**Current State:**
- **292 occurrences** of `process.env` across **63 files**
- **84 unique environment variables** actively used
- **Sophisticated timeout configuration** in `config/timeouts.env.ts` with 20+ configurable timeouts
- **Multiple architecture modes** (monolith, modular, stream) via `ARCH_MODE`

**Critical Finding:** Only `SHARED_SECRET` is validated at startup (server.ts:120-128). All other critical variables like `DATABASE_URL`, `CF_*`, and `R2_*` are used without validation, potentially causing silent failures.

### 2. Health Check Infrastructure

**Excellence Found:** Your health check system **far exceeds** the plan's recommendations:

```
/myhealthz          - Basic health
/health             - Detailed status  
/health/detailed    - Full metrics with DB, Redis, Claude CLI status
/health/capacity    - AI provider capacity tracking
/health/cluster     - Multi-server coordination
/health/logs        - Recent server logs
/health/errors      - Error summaries
/health/ai-limits   - Global AI usage limits
```

**ServerHealthService** provides comprehensive monitoring including:
- Database connectivity checks
- Redis availability
- Claude CLI validation
- Build queue metrics
- Memory usage tracking

### 3. Queue Architecture

**Sophisticated Implementation:**
- **Multiple queue types**: buildQueue, planQueue, taskQueue, deployQueue, webhookQueue, streamQueue
- **Architecture modes**: Supports monolith, modular, and stream architectures
- **Direct mode**: Can bypass queues entirely for development/testing
- **Conditional initialization**: Queues created based on environment

### 4. Security & Validation

**Strengths:**
- HMAC signature validation with version support (v1 and v2)
- Request signature verification
- SystemValidationService for Claude CLI validation

**Gaps:**
- No comprehensive environment variable validation
- Missing .env file permission enforcement
- Debug endpoints expose sensitive info in non-production

## 🚨 Critical Gaps Identified

### 1. **HIGH PRIORITY: Missing Environment Variable Validation**

**Current:** Only SHARED_SECRET is validated
**Impact:** Application may run with missing critical variables, causing runtime failures

**Required Variables Not Validated:**
```javascript
DATABASE_URL
CF_ACCOUNT_ID
CF_API_TOKEN_WORKERS
CF_API_TOKEN_R2
R2_BUCKET_NAME
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
CF_KV_NAMESPACE_ID
CF_PAGES_PROJECT_NAME
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

### 2. **HIGH PRIORITY: PM2 Configuration Missing Dotenv Preloading**

**Current ecosystem.config.js:**
- No `node_args: "-r dotenv/config"`
- No specific Node interpreter path
- Basic environment configuration

**Risk:** Environment variables may not load consistently, especially after PM2 restarts

### 3. **MEDIUM PRIORITY: Inconsistent Variable Naming**

**Duplicates Found:**
- `CF_ACCOUNT_ID` vs `CLOUDFLARE_ACCOUNT_ID`
- `CF_API_TOKEN_WORKERS` vs `CLOUDFLARE_API_TOKEN`

**Impact:** Confusion, potential bugs, harder maintenance

### 4. **LOW PRIORITY: Missing Developer Experience Files**

- No comprehensive `.env.example` (current one missing Cloudflare/R2 variables)
- No `.env` file permission enforcement
- Limited documentation for local development setup

## ✅ Actionable Recommendations

### Immediate Actions (Day 1)

#### 1. Add Comprehensive Environment Validation

Create `src/config/envValidation.ts`:
```typescript
// Environment variable validation with fail-fast
export interface RequiredEnvVars {
  // Core
  SHARED_SECRET: string;
  DATABASE_URL: string;
  
  // Cloudflare
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN_WORKERS: string;
  CF_API_TOKEN_R2: string;
  
  // R2 Storage
  R2_BUCKET_NAME: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  
  // KV & Pages
  CF_KV_NAMESPACE_ID: string;
  CF_PAGES_PROJECT_NAME: string;
}

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
  
  // Validate Redis based on architecture mode
  const archMode = process.env.ARCH_MODE || 'monolith';
  const skipQueue = process.env.SKIP_QUEUE === 'true';
  
  if (!skipQueue && archMode !== 'direct') {
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      console.error('❌ FATAL: Redis configuration required for queue mode');
      console.error('  Set REDIS_URL or REDIS_HOST/REDIS_PORT');
      console.error('  Or set SKIP_QUEUE=true for direct mode');
      process.exit(1);
    }
  }
  
  console.log('✅ Environment validation passed');
}
```

Update `src/server.ts` (line 1-3):
```typescript
import * as dotenv from 'dotenv';
dotenv.config();

// Add comprehensive validation BEFORE other imports
import { validateEnvironment } from './config/envValidation';
validateEnvironment();

// Then continue with existing imports...
import './observability/init';
```

#### 2. Upgrade PM2 Configuration

Create `ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [{
    name: 'sheenapps-claude-worker',
    script: './dist/server.js',
    cwd: process.env.WORKER_DIR || '/home/worker/sheenapps-claude-worker',
    
    // Process management
    exec_mode: 'cluster',
    instances: parseInt(process.env.PM2_INSTANCES || '1'),
    autorestart: true,
    max_memory_restart: '1G',
    watch: false,
    
    // Force specific Node version if using nvm
    interpreter: process.env.NODE_INTERPRETER || 'node',
    
    // Critical: Preload dotenv BEFORE app starts
    node_args: '-r dotenv/config',
    
    // Environment configuration
    env_production: {
      NODE_ENV: 'production',
      DOTENV_CONFIG_PATH: process.env.DOTENV_PATH || '.env'
    },
    
    // Enhanced logging
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DDTHH:mm:ss',
    
    // Graceful shutdown
    kill_timeout: 10000,
    listen_timeout: 5000,
    
    // Health check (optional)
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

#### 3. Create Comprehensive .env.example

```bash
# ===============================================
# Sheenapps Claude Worker Environment Variables
# ===============================================
# Copy to .env and fill in your values

# --- Core Configuration ---
NODE_ENV=production
PORT=3000
APP_VERSION=1.0.0
LOG_LEVEL=info
DISABLE_REQUEST_LOGGING=false

# --- Architecture Mode ---
# Options: monolith, modular, stream, direct
ARCH_MODE=monolith
SKIP_QUEUE=false

# --- Required: Authentication ---
SHARED_SECRET=your-32-character-secret-here

# --- Required: Database ---
DATABASE_URL=postgresql://user:password@host:5432/dbname

# --- Required: Cloudflare Configuration ---
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_API_TOKEN_WORKERS=your-workers-api-token
CF_API_TOKEN_R2=your-r2-api-token
CLOUDFLARE_API_TOKEN=your-general-api-token
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id

# --- Required: R2 Storage ---
R2_BUCKET_NAME=your-r2-bucket
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com

# --- Required: Cloudflare KV & Pages ---
CF_KV_NAMESPACE_ID=your-kv-namespace-id
CF_PAGES_PROJECT_NAME=your-pages-project

# --- Redis (Required unless SKIP_QUEUE=true) ---
REDIS_URL=redis://localhost:6379
# Or use separate host/port:
# REDIS_HOST=localhost
# REDIS_PORT=6379

# --- Claude CLI Timeouts (milliseconds) ---
CLAUDE_INITIAL_TIMEOUT=1200000
CLAUDE_RESUME_TIMEOUT=1200000
CLAUDE_RETRY_TIMEOUT=300000
CLAUDE_FINAL_TIMEOUT=180000
CLAUDE_COMPLEX_TIMEOUT=900000

# --- OpenTelemetry (Optional) ---
OTEL_SERVICE_NAME=sheenapps-worker
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_SDK_DISABLED=false
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1

# --- Instance Identification ---
HOSTNAME=worker-prod-1
INSTANCE_ID=prod-worker-1
```

### Short-term Actions (Week 1)

#### 1. Consolidate Duplicate Variables

Update all references to use consistent naming:
- Use `CF_ACCOUNT_ID` everywhere (deprecate `CLOUDFLARE_ACCOUNT_ID`)
- Use `CF_API_TOKEN` everywhere (deprecate `CLOUDFLARE_API_TOKEN`)

#### 2. Add Environment Schema Validation

Consider using `zod` or `joi` for schema validation:
```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().regex(/^\d+$/).transform(Number),
  SHARED_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  // ... etc
});

export const config = envSchema.parse(process.env);
```

#### 3. Implement Secrets Rotation Procedure

Create `scripts/rotate-secrets.sh`:
```bash
#!/bin/bash
# Backup current .env
cp .env .env.$(date +%Y%m%d-%H%M%S)

# Update secrets (manual step)
echo "Update secrets in .env file, then press Enter"
read

# Restart with new environment
pm2 restart sheenapps-claude-worker --update-env
pm2 save

# Verify
pm2 env 0 | grep -E 'SHARED_SECRET|DATABASE_URL'
```

### Long-term Improvements (Month 1)

1. **Migrate to Secret Manager**: Consider AWS Secrets Manager or HashiCorp Vault
2. **Implement Configuration Service**: Centralized config with validation and hot-reload
3. **Add Configuration Tests**: Unit tests for environment validation
4. **Create Deployment Pipeline**: Automated validation during CI/CD

## 📊 Risk Assessment

### High Risk Items
1. **Missing environment validation** - Could cause production outages
2. **PM2 dotenv preloading** - Inconsistent variable loading after restarts
3. **No .env permission enforcement** - Security vulnerability

### Medium Risk Items
1. **Duplicate variable names** - Confusion and maintenance burden
2. **Missing .env.example** - Poor developer experience
3. **No secrets rotation procedure** - Operational inefficiency

### Low Risk Items
1. **No configuration tests** - Quality assurance gap
2. **Debug endpoints in production** - Information disclosure

## ✅ Validation Checklist

After implementing recommendations:

- [ ] All required environment variables validated at startup
- [ ] PM2 configuration includes dotenv preloading
- [ ] .env.example includes all variables with descriptions
- [ ] .env file has 600 permissions
- [ ] Duplicate variable names consolidated
- [ ] Secrets rotation procedure documented
- [ ] Health checks verify all critical services
- [ ] No sensitive information in logs
- [ ] Configuration tests added to test suite
- [ ] README updated with setup instructions

## 🎯 Success Metrics

1. **Zero silent failures** due to missing environment variables
2. **100% PM2 restart reliability** with correct environment loading
3. **< 5 minute onboarding** for new developers
4. **Zero security incidents** from exposed secrets
5. **< 1 minute secret rotation** downtime

## Conclusion

The sheenapps-claude-worker codebase demonstrates **excellent engineering** in health monitoring, queue management, and service architecture. However, the **fundamental gaps** in environment validation and PM2 configuration pose significant risks.

The plan's recommendations are **valid and necessary**. Implementing the immediate actions will significantly improve reliability and security. The codebase's sophisticated infrastructure makes it well-positioned to adopt these improvements quickly.

**Priority Order:**
1. Environment validation (prevents production outages)
2. PM2 configuration upgrade (ensures consistency)
3. Developer experience improvements (accelerates development)
4. Security hardening (protects sensitive data)