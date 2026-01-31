# Grafana Environment Protection Guide

**Purpose**: Prevent development/testing data from polluting production Grafana Cloud observability.

## 🛡️ Protection Mechanisms (Multi-Layer Defense)

### Layer 1: Environment Detection (Primary)
```typescript
// Inherits from existing analytics environment detection
const analyticsEnvironment = getAnalyticsEnvironment()
const shouldEnable = analyticsEnvironment.shouldEnableAnalytics

// Same logic that protects GA4, PostHog, Clarity from dev data
```

### Layer 2: Environment Variables
```bash
# Development (default - blocks telemetry)
NEXT_PUBLIC_ENV=development
NODE_ENV=development

# Production (enables telemetry)  
NEXT_PUBLIC_ENV=production
NODE_ENV=production
```

### Layer 3: Domain Filtering
```typescript
// Automatic localhost/dev domain blocking
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
const isDevDomain = hostname.includes('dev') || hostname.includes('staging')

if ((isLocalhost || isDevDomain) && !forceEnable) {
  return null // Block event
}
```

### Layer 4: Manual Overrides
```bash
# Emergency disable (overrides everything)
NEXT_PUBLIC_DISABLE_GRAFANA=true

# Testing enable (bypasses protection - USE CAREFULLY)
NEXT_PUBLIC_FORCE_GRAFANA=true
```

## 🚨 Risk Assessment

### ✅ LOW RISK (Well Protected)
- **Normal Development**: Multiple layers block all telemetry
- **Localhost Testing**: Domain filtering + environment detection
- **CI/CD Builds**: Environment detection prevents build-time events
- **Staging with Proper Config**: Separate Grafana instance recommended

### ⚠️ MEDIUM RISK (Requires Attention)
- **Force-Enabled Testing**: `NEXT_PUBLIC_FORCE_GRAFANA=true` bypasses protection
- **Shared Grafana Workspace**: Dev/staging/prod in same Grafana instance
- **Environment Variable Leakage**: Production env vars in development

### 🚨 HIGH RISK (Critical Issues)
- **Production Config in Dev**: Production OTLP tokens + Faro URLs in localhost
- **Misconfigured Deployments**: Wrong environment labels in production deployments

## 📊 Data Contamination Scenarios

### Scenario 1: Developer Testing
```bash
# Developer accidentally sets:
NEXT_PUBLIC_FORCE_GRAFANA=true

# Result: Localhost events sent to production Grafana
# Impact: Low volume, clearly labeled as "development" environment
# Detection: Events with environment="development" label
```

### Scenario 2: CI/CD Pipeline
```bash
# Build process with production tokens but test environment
# Result: Build events in production Grafana
# Impact: Medium volume, automated events
# Detection: Events from CI hostnames, automated patterns
```

### Scenario 3: Staging Misconfiguration
```bash
# Staging deployment uses production Grafana workspace
# Result: Staging user sessions in production data
# Impact: High volume, realistic user patterns
# Detection: Events from staging domains, different user patterns
```

## 🔍 Monitoring & Detection

### Grafana Query: Detect Development Data
```
{environment="development"} |= "localhost" or "dev" or "staging"
```

### Expected Behavior in Development
```
🛡️ Grafana Faro: Blocked dev/localhost event { hostname: "localhost:3000" }
🛡️ Grafana OTLP: Blocked development telemetry { NODE_ENV: "development" }
```

### Alerting Setup (Recommended)
```
# Alert: Development data in production
sum(rate(grafana_events{environment="development"}[5m])) > 0
```

## ✅ Best Practices

### Development Team
1. **Never use production env vars in development**
2. **Always check environment labels in Grafana dashboards**
3. **Use separate Grafana workspaces for staging**
4. **Test with `NEXT_PUBLIC_FORCE_GRAFANA=true` sparingly**

### DevOps Team  
1. **Environment-specific Grafana workspaces** (dev/staging/prod)
2. **Regular audit of environment labels** in telemetry data
3. **Monitoring for unexpected development events**
4. **Clear separation of tokens** (dev/staging/prod)

### Emergency Response
```bash
# Immediate disable if contamination detected
NEXT_PUBLIC_DISABLE_GRAFANA=true

# Verify blocking with:
grep "Blocked dev" application.log
```

## 🎯 Recommended Architecture

### Multi-Environment Setup
```
Production Grafana Workspace:
├── Production App (sheenapps.com)
└── Production Tokens

Staging Grafana Workspace:  
├── Staging App (staging.sheenapps.com)
└── Staging Tokens

Development:
├── No Grafana (blocked by default)
└── Override only for debugging
```

### Environment Labeling
```typescript
// All events automatically labeled with:
{
  environment: "production" | "staging" | "development",
  hostname: window.location.hostname,
  version: process.env.NEXT_PUBLIC_APP_VERSION
}
```

## 📋 Verification Checklist

### Before Production Deploy
- [ ] `NEXT_PUBLIC_ENV=production` in production
- [ ] `NEXT_PUBLIC_ENV=development` in development  
- [ ] No `NEXT_PUBLIC_FORCE_GRAFANA=true` in production
- [ ] Separate Grafana workspaces for each environment
- [ ] Environment detection working in existing analytics

### Regular Audits
- [ ] Check for events with `environment="development"`
- [ ] Verify hostname patterns match expected domains
- [ ] Review volume patterns for anomalies
- [ ] Confirm environment labeling is accurate

## 🚀 Current Implementation Status

✅ **WELL PROTECTED**: Multi-layer defense system implemented
✅ **ENVIRONMENT AWARE**: Inherits proven analytics environment detection  
✅ **DOMAIN FILTERING**: Automatic localhost/dev domain blocking
✅ **MANUAL OVERRIDES**: Emergency disable and testing enable controls
✅ **CLEAR LABELING**: All events tagged with environment information

**Risk Level**: 🟢 **LOW** - Comprehensive protection mechanisms in place.