# 🔐 HMAC Signature Rollout Plan - Dual Signature Support

## Overview

This document outlines the implementation of dual HMAC signature support for safe migration from v1 to v2 signatures, with comprehensive anti-replay protection and monitoring.

## 🎯 **Problem Statement**

The frontend team needs to migrate HMAC signature verification from v1 to v2 format while ensuring:
- Zero downtime during migration
- Anti-replay protection with nonce validation
- Comprehensive monitoring and alerting
- Safe rollout with fallback mechanisms

## 🚀 **Solution Architecture**

### **Dual Signature Period (Week 1 Minimum)**

During the rollout period, the system accepts **both** signature formats:
- **v1 Signature**: Legacy format via `x-sheen-signature` header
- **v2 Signature**: New canonical format via `x-sheen-sig-v2` header
- **Mismatch Detection**: Logs and alerts when v1/v2 results differ

### **Anti-Replay Protection**

- **Timestamp Validation**: ±120 second tolerance window
- **Nonce Validation**: Prevents duplicate requests
- **Multi-Pod Support**: Redis-based nonce storage for distributed systems
- **Graceful Degradation**: In-memory fallback when Redis unavailable

## 📋 **Implementation Components**

### **1. Core Service**
- **File**: `src/services/hmacSignatureService.ts`
- **Features**: Dual signature validation, nonce management, rollout control

### **2. Middleware Integration**  
- **File**: `src/middleware/hmacValidation.ts`
- **Features**: Fastify middleware, route-specific validation, error handling

### **3. Monitoring Endpoints**
- **File**: `src/routes/hmacMonitoring.ts`
- **Features**: Rollout status, validation stats, security alerts

## 🔧 **Configuration**

### **Environment Variables**

```bash
# HMAC Secrets
HMAC_SECRET=your-v1-secret-key                    # v1 signature secret
HMAC_SECRET_V2=your-v2-secret-key                 # v2 signature secret (can be same as v1)

# Rollout Configuration  
ENABLE_DUAL_SIGNATURE=true                        # Enable dual signature support
HMAC_ROLLOUT_PERIOD_MS=604800000                  # Rollout period (7 days default)
HMAC_ROLLOUT_END_TIME=1735689600000               # Specific end timestamp (optional)

# Redis Configuration (recommended for multi-pod)
REDIS_URL=redis://localhost:6379                  # Required for multi-pod nonce storage

# Development Options
NODE_ENV=development                               # Allows test signatures in dev
```

## 📊 **Signature Formats**

### **v1 Signature (Legacy)**

**Algorithm**: HMAC-SHA256 of `timestamp + payload`

```typescript
// v1 Generation
const message = `${timestamp}${payload}`;
const signature = crypto.createHmac('sha256', hmacSecret).update(message).digest('hex');

// Headers
{
  'x-sheen-signature': signature,
  'x-sheen-timestamp': timestamp
}
```

### **v2 Signature (New Canonical)**

**Algorithm**: HMAC-SHA256 of canonicalized request

```typescript
// v2 Generation with Canonicalization
const canonicalPayload = [
  method.toUpperCase(),          // GET, POST, etc.
  canonicalPath,                 // /path?param1=a&param2=b (sorted)
  timestamp,                     // Unix timestamp  
  nonce || '',                   // Anti-replay nonce (optional)
  payload                        // Request body or query string
].join('\n');

const signature = crypto.createHmac('sha256', hmacSecretV2).update(canonicalPayload).digest('hex');

// Headers
{
  'x-sheen-sig-v2': signature,
  'x-sheen-timestamp': timestamp,
  'x-sheen-nonce': nonce        // Recommended for v2
}
```

## 🔄 **Migration Timeline**

### **Week 1: Dual Signature Period** 
- ✅ Accept both v1 and v2 signatures
- ✅ Log validation results for both versions
- ✅ Alert on signature mismatches
- ✅ Monitor rollout progress

**Frontend Action Required:**
- Implement v2 signature generation alongside v1
- Test v2 signatures in staging environment
- Monitor validation success rates

### **Week 2+: v2 Only**
- ❌ Reject v1 signatures (deprecated)
- ✅ Accept only v2 signatures
- ✅ Continue monitoring and alerting

**Frontend Action Required:**
- Remove v1 signature generation from clients
- Ensure all services use v2 format

## 🛠️ **API Integration**

### **Route-Level Validation**

```typescript
import { requireHmacSignature, optionalHmacSignature } from '../middleware/hmacValidation';

// Required HMAC validation
fastify.post('/api/secure-endpoint', {
  preHandler: requireHmacSignature({
    skipPaths: ['/health'],        // Skip validation for health checks
    allowTestSignatures: false    // Disable test signatures in production
  })
}, async (request, reply) => {
  // Access validation result
  const { valid, version, warnings } = request.hmacValidation;
  
  // Your route logic here
});

// Optional validation (logs but doesn't block)
fastify.post('/api/optional-secure', {
  preHandler: optionalHmacSignature()
}, async (request, reply) => {
  // Route logic - validation failures are logged but don't block request
});

// Webhook validation (strict)
fastify.post('/webhooks/stripe', {
  preHandler: webhookHmacValidation({
    allowTestSignatures: false,    // Never allow test signatures for webhooks
    blockOnFailure: true          // Always block invalid webhook signatures
  })
}, async (request, reply) => {
  // Process webhook
});
```

### **Manual Validation**

```typescript
import { HmacSignatureService } from '../services/hmacSignatureService';

const hmacService = HmacSignatureService.getInstance();

// Validate specific signature
const result = await hmacService.validateSignature(
  payload,
  {
    'x-sheen-signature': 'v1-signature-here',
    'x-sheen-sig-v2': 'v2-signature-here', 
    'x-sheen-timestamp': '1640995200',
    'x-sheen-nonce': 'unique-nonce-123'
  },
  'POST',
  '/api/endpoint'
);

console.log('Validation Result:', {
  valid: result.valid,
  version: result.version,
  warnings: result.warnings
});
```

## 📈 **Monitoring Endpoints**

### **Rollout Status**
```http
GET /hmac/rollout-status
```
**Response:**
```json
{
  "rollout": {
    "phase": "rollout",
    "dual_signature_enabled": true,
    "end_time": "2024-01-01T00:00:00Z",
    "time_remaining_hours": 168
  },
  "signature_support": {
    "accepts_v1": true,
    "accepts_v2": true,
    "recommended_version": "v2"
  }
}
```

### **Validation Statistics**
```http
GET /hmac/validation-stats?hours=24
```
**Response:**
```json
{
  "summary": {
    "total_validations": 1250,
    "successful_validations": 1198,
    "failed_validations": 52,
    "success_rate_percent": 96
  },
  "signature_versions": {
    "v1_usage_percent": 45,
    "v2_usage_percent": 35,
    "both_versions_percent": 20
  },
  "health_indicators": {
    "validation_working": true,
    "high_success_rate": true,
    "low_latency": true,
    "no_recent_failures": false
  }
}
```

### **Security Alerts**
```http
GET /hmac/security-alerts?hours=24
```
**Response:**
```json
{
  "alert_summary": {
    "total_security_alerts": 3,
    "severity": "low",
    "replay_attacks": 1,
    "signature_mismatches": 2,
    "timestamp_violations": 0
  },
  "recommendations": [
    "Security metrics within normal range",
    "Continue monitoring"
  ]
}
```

## 🧪 **Testing and Debugging**

### **Signature Testing**
```http
POST /hmac/test-signature
Content-Type: application/json

{
  "payload": "test data",
  "method": "POST", 
  "path": "/api/test",
  "nonce": "test-nonce-123",
  "version": "both"
}
```

### **Signature Validation** 
```http
POST /hmac/validate-signature
Content-Type: application/json

{
  "payload": "test data",
  "method": "POST",
  "path": "/api/test", 
  "headers": {
    "x-sheen-sig-v2": "generated-signature",
    "x-sheen-timestamp": "1640995200",
    "x-sheen-nonce": "test-nonce-123"
  }
}
```

## ⚠️ **Security Considerations**

### **Anti-Replay Protection**

1. **Nonce Storage**: 
   - **Multi-Pod**: MUST use Redis for shared nonce cache
   - **Single-Pod**: In-memory cache acceptable
   - **TTL**: 10 minutes (prevents long-term storage)

2. **Timestamp Validation**:
   - **Tolerance**: ±120 seconds (2 minutes)
   - **Clock Sync**: Ensure server clocks are synchronized
   - **Replay Window**: Requests older than 10 minutes are rejected

3. **Signature Secrets**:
   - **Rotation**: Plan for secret rotation capability
   - **Storage**: Store secrets securely (environment variables, secret manager)
   - **Separation**: Consider different secrets for v1 and v2

### **Monitoring and Alerting**

1. **Critical Alerts**:
   - Signature version mismatches (v1 ≠ v2 results)
   - High number of replay attacks
   - Sudden drop in validation success rate
   - Missing required headers

2. **Security Metrics**:
   - Validation success rate > 95%
   - Average validation latency < 50ms
   - No more than 5 replay attacks per hour
   - Signature mismatch rate < 1%

## 🚀 **Deployment Checklist**

### **Backend Deployment:**
- [x] HMAC signature service implemented
- [x] Middleware integration complete
- [x] Monitoring endpoints available
- [ ] Environment variables configured
- [ ] Redis connection established (multi-pod)
- [ ] Rollout timeline configured

### **Frontend Integration:**
- [ ] v2 signature generation implemented
- [ ] Test v2 signatures in staging
- [ ] Monitor validation success rates
- [ ] Plan v1 signature deprecation
- [ ] Update client libraries/SDKs

### **Monitoring Setup:**
- [ ] Dashboard for validation metrics
- [ ] Alerts for signature mismatches
- [ ] Security monitoring configured
- [ ] Rollout progress tracking

## 📞 **Support and Troubleshooting**

### **Common Issues:**

1. **Signature Mismatch**: 
   - Check canonicalization (query parameter sorting)
   - Verify timestamp format (Unix timestamp)
   - Ensure payload matches exactly

2. **Timestamp Out of Range**:
   - Check server clock synchronization
   - Verify timestamp is Unix seconds (not milliseconds)
   - Ensure ±120 second tolerance

3. **Nonce Replay Detected**:
   - Generate unique nonces for each request
   - Check nonce cache TTL (10 minutes)
   - Verify Redis connectivity for multi-pod

4. **High Validation Latency**:
   - Monitor Redis performance
   - Check signature generation efficiency
   - Review nonce cache cleanup

### **Debug Endpoints:**

- **Test Signatures**: `POST /hmac/test-signature`
- **Validate Headers**: `POST /hmac/validate-signature` 
- **Recent Validations**: `GET /hmac/recent-validations`
- **Security Alerts**: `GET /hmac/security-alerts`

### **Contact:**
- **Backend Team**: For signature validation issues
- **DevOps Team**: For Redis and infrastructure
- **Security Team**: For security concerns and alerts

## 🎯 **Success Metrics**

### **Week 1 (Dual Signature Period):**
- ✅ 95%+ validation success rate
- ✅ Both v1 and v2 signatures working
- ✅ < 1% signature version mismatches
- ✅ Zero security incidents

### **Week 2+ (v2 Only):**
- ✅ 100% v2 signature adoption
- ✅ v1 signatures properly deprecated
- ✅ Maintained 95%+ success rate
- ✅ Anti-replay protection active

The dual signature rollout ensures zero downtime migration while providing comprehensive security monitoring and safe fallback mechanisms.