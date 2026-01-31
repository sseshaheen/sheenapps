# Multi-Provider Payment API Reference

**Date**: September 2, 2025  
**Version**: 1.0.0  
**Status**: Production Ready  

This document describes all the new API endpoints created for the multi-provider payment system.

## 🌍 **Multi-Provider Billing Endpoints**

### **Purchase Package (Enhanced)**

**Endpoint**: `POST /v1/billing/packages/purchase`  
**Description**: Create a checkout session for package purchase with automatic provider selection

**Headers**:
```
Content-Type: application/json
x-sheen-signature: <hmac_v1_signature>
x-sheen-timestamp: <unix_timestamp>
x-sheen-nonce: <random_hex>
x-sheen-locale: en|ar (optional)
```

**Request Body**:
```json
{
  "package_key": "mini|booster|mega|max",
  "currency": "USD|EUR|GBP|EGP|SAR",
  "region": "us|ca|gb|eu|eg|sa",
  "locale": "en|ar"
}
```

**Response** (Voucher - Cash payments like Fawry):
```json
{
  "checkout_url": null,
  "currency": "EGP",
  "unit_amount_cents": 2500,
  "display_price": 25.00,
  "package_minutes": 60,
  "session_id": "fawry_session_123",
  "order_id": "pkg_mini_user123_1693612800000",
  "payment_provider": "fawry",
  "checkout_type": "voucher",
  "voucher_reference": "FWY123456789",
  "voucher_expires_at": "2025-09-02T16:30:00Z",
  "voucher_instructions": "Pay at any Fawry location or through the Fawry app",
  "voucher_barcode_url": "https://api.fawry.com/qr/FWY123456789"
}
```

**Response** (Redirect - Card payments like PayTabs):
```json
{
  "checkout_url": "https://secure.paytabs.com/payment/page/123456",
  "currency": "SAR",
  "unit_amount_cents": 1875,
  "display_price": 18.75,
  "package_minutes": 60,
  "session_id": "pt_session_789",
  "order_id": "pkg_mini_user123_1693612800000",
  "payment_provider": "paytabs",
  "checkout_type": "redirect",
  "redirect_expires_at": "2025-09-02T16:30:00Z"
}
```

**Error Responses**:
```json
{
  "error": "NOT_SUPPORTED",
  "message": "No payment provider available for region: jp, currency: JPY, productType: package",
  "actionRequired": "This combination is not currently supported. Please contact support."
}
```

```json
{
  "error": "MISSING_PHONE", 
  "message": "Phone number required for this payment method",
  "provider": "stcpay",
  "actionRequired": "Please add a Saudi phone number to use STC Pay"
}
```

---

## 🔔 **Multi-Provider Webhook Endpoints**

### **Provider-Specific Webhooks**

**Endpoints**:
- `POST /webhooks/stripe` - Stripe webhook handler
- `POST /webhooks/fawry` - Fawry webhook handler  
- `POST /webhooks/paymob` - Paymob webhook handler
- `POST /webhooks/stcpay` - STC Pay webhook handler
- `POST /webhooks/paytabs` - PayTabs webhook handler

**Headers** (Provider-specific):
```
# Stripe
stripe-signature: t=1693612800,v1=abc123...

# Fawry  
x-fawry-signature: sha512_hash

# Paymob
x-paymob-signature: hmac_signature

# STC Pay
x-stcpay-signature: hmac_sha256

# PayTabs
x-paytabs-signature: hmac_signature
```

**Request Body**: Raw webhook payload (provider-specific format)

**Response** (Success):
```json
{
  "success": true,
  "message": "Processed 1/1 events successfully",
  "eventId": "fawry_event_123",
  "requestId": "wh_fawry_1693612800_abc123",
  "processingTimeMs": 125
}
```

**Response** (Error):
```json
{
  "success": false,
  "error": "PROCESSING_FAILED",
  "message": "Invalid webhook signature for fawry",
  "requestId": "wh_fawry_1693612800_abc123",
  "processingTimeMs": 45,
  "retryable": false
}
```

### **Generic Webhook Handler**

**Endpoint**: `POST /webhooks/:provider`  
**Description**: Generic webhook handler for testing/debugging

**Parameters**:
- `provider`: `stripe|fawry|paymob|stcpay|paytabs`

**Response**: Same format as provider-specific endpoints

### **Webhook Health Check**

**Endpoint**: `GET /webhooks/health`  
**Description**: Health check for webhook infrastructure

**Response**:
```json
{
  "status": "healthy",
  "webhook_infrastructure": {
    "overall_success_rate": 0.98,
    "total_events_processed": 1247,
    "provider_stats": [
      {
        "payment_provider": "stripe",
        "total_events": "450",
        "processed_events": "448",
        "success_rate": "0.996"
      }
    ]
  },
  "timestamp": "2025-09-02T15:30:00Z",
  "checks": {
    "webhook_processing": "pass"
  }
}
```

---

## 👨‍💼 **Admin Multi-Provider Endpoints**

**Authentication**: All admin endpoints require `x-admin-key` header

### **Provider Dashboard**

**Endpoint**: `GET /admin/providers/dashboard`  
**Description**: Comprehensive provider monitoring dashboard

**Headers**:
```
x-admin-key: <admin_api_key>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "provider_health": [
      {
        "provider": "stripe",
        "isHealthy": true,
        "successRate": 0.97,
        "lastHealthCheck": "2025-09-02T15:30:00Z",
        "failureCount": 1
      }
    ],
    "webhook_stats": [
      {
        "payment_provider": "fawry",
        "total_events": "125",
        "processed_events": "123",
        "failed_events": "2",
        "success_rate": "0.984"
      }
    ],
    "mapping_coverage": [
      {
        "item_key": "mini",
        "item_type": "package",
        "provider_count": 5,
        "available_providers": ["stripe", "fawry", "paymob", "stcpay", "paytabs"],
        "available_currencies": ["USD", "EGP", "SAR"]
      }
    ],
    "regional_availability": [
      {
        "region": "eg",
        "subscription_providers": ["paymob", "stripe"],
        "package_providers": ["fawry", "paymob"],
        "recommended_currencies": ["EGP", "USD"],
        "is_supported": true
      }
    ],
    "slo_compliance": [
      {
        "provider": "stripe",
        "payment_success_rate": 0.97,
        "webhook_success_rate": 0.99,
        "is_healthy": true,
        "slo_compliance": {
          "payment_slo_met": true,
          "webhook_slo_met": true,
          "overall_compliant": true
        }
      }
    ]
  },
  "timestamp": "2025-09-02T15:30:00Z"
}
```

### **Provider-Specific Metrics**

**Endpoint**: `GET /admin/providers/:provider/metrics`  
**Description**: Detailed metrics for a specific provider

**Parameters**:
- `provider`: `stripe|fawry|paymob|stcpay|paytabs`

**Response**:
```json
{
  "success": true,
  "provider": "fawry",
  "data": {
    "health": {
      "provider": "fawry",
      "isHealthy": true,
      "successRate": 0.94,
      "lastHealthCheck": "2025-09-02T15:30:00Z",
      "failureCount": 2
    },
    "webhooks": {
      "total_events": 85,
      "processed_events": 83,
      "failed_events": 2
    },
    "mappings": [
      {
        "currency": "EGP",
        "total_mappings": 4,
        "subscription_mappings": 0,
        "package_mappings": 4,
        "mapped_items": ["mini", "booster", "mega", "max"]
      }
    ],
    "transactions": {
      "total_transactions": 156,
      "successful_transactions": 145,
      "failed_transactions": 11,
      "total_volume_cents": 487500,
      "avg_transaction_cents": 3125,
      "currencies_processed": ["EGP"]
    }
  },
  "timestamp": "2025-09-02T15:30:00Z"
}
```

### **Circuit Breaker Controls**

**Endpoint**: `POST /admin/providers/:provider/circuit-breaker/:action`  
**Description**: Manual circuit breaker controls

**Parameters**:
- `provider`: `stripe|fawry|paymob|stcpay|paytabs`
- `action`: `trip|recover`

**Response** (Recovery):
```json
{
  "success": true,
  "message": "Circuit breaker recovered for fawry",
  "provider": "fawry",
  "action": "recovered",
  "timestamp": "2025-09-02T15:30:00Z"
}
```

**Response** (Trip):
```json
{
  "success": true,
  "message": "Circuit breaker tripped for fawry", 
  "provider": "fawry",
  "action": "tripped",
  "timestamp": "2025-09-02T15:30:00Z"
}
```

### **Mapping Validation**

**Endpoint**: `GET /admin/providers/validate-mappings`  
**Description**: Validate price mapping completeness and capability matches

**Response**:
```json
{
  "success": true,
  "data": {
    "missing_mappings": [
      {
        "item_key": "ultra",
        "item_type": "subscription", 
        "base_currency": "USD",
        "available_providers": []
      }
    ],
    "capability_mismatches": [
      {
        "item_key": "starter",
        "item_type": "subscription",
        "payment_provider": "fawry",
        "supports_recurring": false,
        "currency": "EGP"
      }
    ],
    "validation_passed": false
  },
  "timestamp": "2025-09-02T15:30:00Z"
}
```

### **Webhook Event Replay**

**Endpoint**: `POST /admin/webhooks/:provider/:eventId/replay`  
**Description**: Manually replay a webhook event

**Parameters**:
- `provider`: `stripe|fawry|paymob|stcpay|paytabs`
- `eventId`: Provider event ID to replay

**Response**:
```json
{
  "success": true,
  "message": "Event replayed successfully",
  "eventId": "fawry_event_123",
  "provider": "fawry",
  "timestamp": "2025-09-02T15:30:00Z"
}
```

### **Webhook Statistics**

**Endpoint**: `GET /admin/webhooks/stats?provider=<provider>`  
**Description**: Get webhook processing statistics

**Query Parameters**:
- `provider` (optional): Filter by specific provider

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "payment_provider": "stripe",
      "total_events": "450",
      "processed_events": "448", 
      "failed_events": "2",
      "replayed_events": "1",
      "success_rate": "0.996"
    }
  ],
  "timestamp": "2025-09-02T15:30:00Z"
}
```


---

## 🚨 **Error Codes & Messages**

### **Payment Errors**

| Code | Message | Action Required |
|------|---------|----------------|
| `NOT_SUPPORTED` | No provider available for region/currency/product | Contact support or try different currency |
| `MISSING_PHONE` | Phone number required for this provider | Add phone number in E.164 format |
| `MISSING_LOCALE` | Arabic locale required for this provider | Switch locale to Arabic |
| `INVALID_REQUEST` | Invalid parameters provided | Check request format |
| `TIMEOUT` | Provider request timed out | Try again or use alternative provider |
| `DECLINED` | Payment declined by provider | Try different payment method |

### **Admin Errors**

| Code | Message | Action |
|------|---------|--------|
| `UNAUTHORIZED` | Admin API key required | Provide valid x-admin-key header |
| `INVALID_PROVIDER` | Invalid provider specified | Use valid provider key |
| `VALIDATION_ERROR` | Mapping validation failed | Check mapping configuration |
| `CIRCUIT_BREAKER_ERROR` | Circuit breaker action failed | Check provider status |

---

## 📱 **Frontend Integration Examples**

### **React Component Usage**

```typescript
import { MultiProviderCheckout } from './components/MultiProviderCheckout';

// Basic usage
<MultiProviderCheckout
  packageKey="mini"
  currency="EGP"
  region="eg"
  locale="ar"
  onSuccess={(result) => {
    if (result.checkout_type === 'voucher') {
      // Show voucher UI with QR code
      showVoucherModal(result);
    } else {
      // Handle redirect (already redirected)
      console.log('Redirected to:', result.checkout_url);
    }
  }}
  onError={(error) => {
    showErrorMessage(error.message);
  }}
/>

// Resume token flow (402 → pay → auto-resume)
<MultiProviderCheckout
  packageKey="booster"
  resumeToken="resume_abc123"
  onSuccess={(result) => {
    // Auto-continue with original request
    continueWithOriginalRequest();
  }}
/>
```

### **JavaScript/Fetch Usage**

```javascript
// Purchase package
async function purchasePackage(packageKey, currency, region, locale) {
  const body = JSON.stringify({
    package_key: packageKey,
    currency,
    region, 
    locale
  });
  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  const response = await fetch('/v1/billing/packages/purchase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
      'x-sheen-timestamp': timestamp,
      'x-sheen-nonce': crypto.randomBytes(16).toString('hex'),
      'x-sheen-locale': locale
    },
    body
  });
  
  const result = await response.json();
  
  if (result.checkout_type === 'voucher') {
    showVoucherUI(result);
  } else if (result.checkout_type === 'redirect') {
    window.location.href = result.checkout_url;
  }
}

// Check provider health (admin)
async function getProviderHealth() {
  const response = await fetch('/admin/providers/dashboard', {
    headers: {
      'x-admin-key': adminApiKey
    }
  });
  
  const data = await response.json();
  return data.data.provider_health;
}
```

---

## 🔐 **Security & Rate Limiting**

### **Rate Limits**

| Endpoint Category | Limit | Window |
|------------------|--------|---------|
| Webhook endpoints | 100 req/min per provider | 1 minute |
| Admin endpoints | 60 req/min | 1 minute |  
| Purchase endpoints | 10 req/min per user | 1 minute |

### **Authentication**

- **User endpoints**: HMAC signature authentication (x-sheen-signature, x-sheen-timestamp, x-sheen-nonce)
- **Admin endpoints**: Admin API key in x-admin-key header  
- **Webhooks**: Provider-specific signature verification

### **CORS**

All endpoints support CORS for frontend integration with appropriate origins configured.

---

## 📊 **Monitoring & Observability**

### **Health Check Endpoints**

- `GET /webhooks/health` - Webhook infrastructure health
- `GET /admin/providers/dashboard` - Overall system health

### **Metrics Available**

- Provider success rates and SLO compliance
- Webhook processing latency and success rates  
- Transaction volumes and failure rates
- Circuit breaker status and recovery times
- Regional availability and mapping coverage

---

This API reference covers all the newly created multi-provider payment endpoints. The system is now fully documented and ready for integration! 🚀