# SheenApps Friends Referral Program - Complete API Reference

**Date**: September 8, 2025  
**Status**: Production Ready  
**Version**: v1.0  
**Base URLs**: `/v1/referrals/*` (Partner APIs) | `/v1/admin/referrals/*` (Admin APIs)  
**Authentication**: HMAC signature required for all endpoints  

## 📋 Table of Contents

- [Authentication](#authentication)
- [Partner APIs](#partner-apis)
- [Admin APIs](#admin-apis)
- [Data Types](#data-types)
- [Error Handling](#error-handling)
- [Rate Limits](#rate-limits)

## 🔐 Authentication

All API endpoints require HMAC signature authentication using existing SheenApps authentication patterns. The API automatically derives user identity from the signed request context - **never send `userId` in request bodies or query parameters for partner APIs**.

### Required Headers
```
x-sheen-signature: [HMAC v1 signature]
x-sheen-sig-v2: [HMAC v2 signature] 
x-sheen-timestamp: [Unix timestamp in seconds]
x-sheen-nonce: [Random string for replay protection]
Content-Type: application/json
```

## 🤝 Partner APIs

These endpoints are used by referral partners (users who refer others) to manage their accounts and track performance.

### 1. Create Partner Account
```http
POST /v1/referrals/partners
```

**Description**: Creates a new referral partner account for the authenticated user.

**Request:**
```json
{
  "company_name": "My Marketing Company",
  "website_url": "https://example.com",
  "marketing_channels": ["blog", "youtube", "twitter"],
  "payout_method": "stripe",
  "terms_accepted": true
}
```

**Request Schema:**
```typescript
interface CreatePartnerRequest {
  company_name?: string;          // Optional company name
  website_url?: string;           // Optional website URL (must be valid URL)
  marketing_channels?: string[];  // Array of: blog, youtube, twitter, linkedin, newsletter, other
  payout_method?: string;         // One of: stripe, paypal, wire, wise
  terms_accepted: boolean;        // Required: must be true
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "partner": {
    "id": "partner_abc123",
    "user_id": "user_xyz789",
    "partner_code": "FRIEND123",
    "tier": "bronze",
    "status": "active",
    "company_name": "My Marketing Company",
    "website_url": "https://example.com",
    "marketing_channels": ["blog", "youtube"],
    "payout_method": "stripe",
    "commission_rate": 15,
    "successful_referrals": 0,
    "total_earnings_cents": 0,
    "created_at": "2025-09-08T12:00:00Z"
  },
  "referral_link": "https://app.sheenapps.com/?ref=FRIEND123"
}
```

**Error Responses:**
- `400 Bad Request` - Terms not accepted or validation errors
- `409 Conflict` - User already has a partner account
- `500 Internal Server Error` - Database error

---

### 2. Get Partner Dashboard
```http
GET /v1/referrals/dashboard?userId={uuid}
```

**Description**: Retrieves comprehensive dashboard data for the authenticated partner.

**Query Parameters:**
- `userId` (required): User UUID

**Response (200 OK):**
```json
{
  "partner": {
    "id": "partner_abc123",
    "partner_code": "FRIEND123",
    "tier": "bronze",
    "commission_rate": 15,
    "successful_referrals": 5,
    "total_earnings_cents": 12500,
    "status": "active"
  },
  "stats": {
    "total_clicks": 150,
    "total_signups": 8,
    "conversion_rate": 5.33,
    "pending_commissions_cents": 5000,
    "approved_commissions_cents": 7500,
    "estimated_monthly_payout_cents": 3200
  },
  "recent_referrals": [
    {
      "id": "ref_def456",
      "status": "confirmed",
      "created_at": "2025-09-05T10:30:00Z",
      "attribution_method": "cookie"
    }
  ],
  "recent_commissions": [
    {
      "id": "comm_ghi789",
      "commission_amount_cents": 2500,
      "status": "approved",
      "is_activation_bonus": false,
      "created_at": "2025-09-06T14:20:00Z"
    }
  ]
}
```

**Error Responses:**
- `404 Not Found` - Partner account not found
- `500 Internal Server Error` - Database error

---

### 3. Track Referral Click (No Authentication Required)
```http
POST /v1/referrals/track-click
```

**Description**: Tracks when someone clicks on a referral link. No authentication required.

**Request:**
```json
{
  "partner_code": "FRIEND123",
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
```

**Request Schema:**
```typescript
interface TrackClickRequest {
  partner_code: string;    // Partner's referral code
  ip_address: string;      // Client IP address
  user_agent?: string;     // Optional user agent string
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "tracked": true
}
```

**Error Responses:**
- `404 Not Found` - Invalid partner code
- `500 Internal Server Error` - Database error

---

### 4. Track Referral Signup
```http
POST /v1/referrals/signup
```

**Description**: Tracks when a referred user successfully signs up.

**Request:**
```json
{
  "partner_code": "FRIEND123",
  "attribution_method": "cookie",
  "utm_source": "twitter",
  "utm_medium": "social",
  "utm_campaign": "summer2025",
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0..."
}
```

**Request Schema:**
```typescript
interface TrackReferralRequest {
  partner_code: string;                           // Partner's referral code
  attribution_method: 'cookie' | 'email_match' | 'referral_code';
  utm_source?: string;                           // UTM tracking parameters
  utm_medium?: string;
  utm_campaign?: string;
  ip_address: string;                            // Client IP address
  user_agent?: string;                           // User agent string
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "referral_id": "ref_def456",
  "fraud_check": "clean"
}
```

**Error Responses:**
- `400 Bad Request` - Self-referral not allowed, invalid partner code
- `403 Forbidden` - Referral blocked due to suspicious activity
- `500 Internal Server Error` - Database error

---

## 👑 Admin APIs

These endpoints are used by administrators to manage the referral program, approve commissions, process payouts, and monitor fraud.

### 1. Admin Overview Dashboard
```http
GET /v1/admin/referrals/overview?days=30
```

**Description**: Provides comprehensive overview statistics for the referral program.

**Query Parameters:**
- `days` (optional, default: 30): Number of days for recent activity stats

**Response (200 OK):**
```json
{
  "total_partners": 245,
  "active_partners": 198,
  "total_referrals": 1850,
  "successful_referrals": 1420,
  "total_paid_cents": 125000000,
  "pending_payout_cents": 45000000,
  "pending_approval_cents": 28000000,
  "recent_referrals": 156,
  "recent_commissions_cents": 12500000,
  "top_performers": [
    {
      "partner_code": "FRIEND123",
      "company_name": "Tech Blog Co",
      "referrals_count": 45,
      "commissions_cents": 112500
    }
  ],
  "fraud_alerts_count": 3,
  "conversion_rate": 76.76
}
```

---

### 2. Get All Partners
```http
GET /v1/admin/referrals/partners?status=active&tier=gold&limit=50&offset=0&search=tech&sort=earnings_desc
```

**Description**: Retrieves all referral partners with filtering and pagination.

**Query Parameters:**
- `status` (optional): Filter by status (active, paused, suspended)
- `tier` (optional): Filter by tier (bronze, silver, gold)
- `limit` (optional, default: 50): Number of results per page
- `offset` (optional, default: 0): Pagination offset
- `search` (optional): Search by partner code, company name, or email
- `sort` (optional): Sort order (created_asc, created_desc, earnings_asc, earnings_desc, referrals_asc, referrals_desc)

**Response (200 OK):**
```json
{
  "partners": [
    {
      "id": "partner_abc123",
      "user_id": "user_xyz789",
      "partner_code": "FRIEND123",
      "user_email": "partner@example.com",
      "company_name": "Tech Marketing Co",
      "website_url": "https://techmarketing.com",
      "tier": "gold",
      "status": "active",
      "commission_rate": 25,
      "successful_referrals": 87,
      "total_earnings_cents": 217500,
      "pending_commissions_cents": 12500,
      "last_referral_at": "2025-09-07T15:30:00Z",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 245,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

---

### 3. Update Partner Status
```http
PUT /v1/admin/referrals/partners/{partnerId}/status
```

**Description**: Updates a partner's status with optional reason.

**Path Parameters:**
- `partnerId`: Partner UUID

**Request:**
```json
{
  "status": "suspended",
  "reason": "Terms of service violation - spam referrals"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "partner": {
    "id": "partner_abc123",
    "status": "suspended",
    "updated_at": "2025-09-08T12:00:00Z"
  }
}
```

---

### 4. Get Pending Commissions
```http
GET /v1/admin/referrals/commissions/pending?partner_id=partner_abc123&days=30&limit=100&offset=0
```

**Description**: Retrieves commissions pending admin approval.

**Query Parameters:**
- `partner_id` (optional): Filter by specific partner
- `days` (optional, default: 30): Number of days to look back
- `limit` (optional, default: 100): Results per page
- `offset` (optional, default: 0): Pagination offset

**Response (200 OK):**
```json
{
  "commissions": [
    {
      "id": "comm_def456",
      "partner_id": "partner_abc123",
      "partner_code": "FRIEND123",
      "referral_id": "ref_ghi789",
      "payment_id": "pay_jkl012",
      "commission_amount_cents": 2500,
      "commission_rate": 15,
      "payment_amount_cents": 16667,
      "status": "pending",
      "is_activation_bonus": false,
      "created_at": "2025-09-08T10:00:00Z",
      "user_email": "customer@example.com"
    }
  ],
  "summary": {
    "total_pending_cents": 125000,
    "total_commissions": 50,
    "unique_partners": 25
  },
  "pagination": {
    "total": 125,
    "limit": 100,
    "offset": 0,
    "has_more": true
  }
}
```

---

### 5. Approve Commissions
```http
POST /v1/admin/referrals/commissions/approve
```

**Description**: Approves multiple commissions for payout processing.

**Request:**
```json
{
  "commission_ids": [
    "comm_def456",
    "comm_ghi789",
    "comm_jkl012"
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "approved_count": 3,
  "total_amount_cents": 75000,
  "failed_approvals": []
}
```

---

### 6. Create Payout Batch
```http
POST /v1/admin/referrals/payouts/batch
```

**Description**: Creates a payout batch from approved commissions.

**Request:**
```json
{
  "partner_ids": ["partner_abc123", "partner_def456"],
  "payout_method": "stripe",
  "minimum_amount_cents": 5000,
  "description": "Monthly payout - September 2025"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "batch": {
    "id": "batch_abc123",
    "total_amount_cents": 250000,
    "partner_count": 45,
    "commission_count": 156,
    "payout_method": "stripe",
    "status": "created",
    "created_at": "2025-09-08T12:00:00Z"
  }
}
```

---

### 7. Get Payout Batches
```http
GET /v1/admin/referrals/payouts/batches?status=processing&payout_method=stripe&limit=50&offset=0
```

**Description**: Retrieves payout batches with filtering and pagination.

**Query Parameters:**
- `status` (optional): Filter by status (created, processing, completed, failed)
- `payout_method` (optional): Filter by payout method
- `limit` (optional, default: 50): Results per page
- `offset` (optional, default: 0): Pagination offset

**Response (200 OK):**
```json
{
  "batches": [
    {
      "id": "batch_abc123",
      "total_amount_cents": 250000,
      "partner_count": 45,
      "commission_count": 156,
      "payout_method": "stripe",
      "status": "completed",
      "created_at": "2025-09-01T12:00:00Z",
      "processed_at": "2025-09-01T14:30:00Z",
      "description": "Monthly payout - September 2025"
    }
  ],
  "pagination": {
    "total": 12,
    "limit": 50,
    "offset": 0,
    "has_more": false
  }
}
```

---

### 8. Get Fraud Alerts
```http
GET /v1/admin/referrals/fraud/alerts?days=7
```

**Description**: Retrieves fraud detection alerts for admin review.

**Query Parameters:**
- `days` (optional, default: 7): Number of days to look back

**Response (200 OK):**
```json
{
  "alerts": [
    {
      "id": "alert_abc123",
      "type": "suspicious_ip_pattern",
      "severity": "high",
      "partner_code": "FRIEND123",
      "description": "Multiple signups from same IP within short timeframe",
      "affected_referrals": 5,
      "ip_address": "192.168.1.1",
      "created_at": "2025-09-08T08:00:00Z",
      "status": "open"
    }
  ],
  "summary": {
    "total_alerts": 3,
    "high_severity": 1,
    "medium_severity": 2,
    "open_alerts": 3
  }
}
```

---

## 📊 Data Types

### ReferralPartner
```typescript
interface ReferralPartner {
  id: string;                    // UUID
  user_id: string;               // UUID - references auth.users(id)
  partner_code: string;          // Unique 6-20 char code (e.g., "FRIEND123")
  company_name?: string;         // Optional company name
  website_url?: string;          // Optional website URL
  marketing_channels?: string[]; // Marketing channels used
  payout_method?: string;        // Preferred payout method
  tier: 'bronze' | 'silver' | 'gold';
  status: 'active' | 'paused' | 'suspended';
  commission_rate: number;       // Percentage (15, 20, or 25)
  successful_referrals: number;  // Count of successful referrals
  total_earnings_cents: number;  // Total lifetime earnings
  created_at: string;           // ISO timestamp
  updated_at: string;           // ISO timestamp
}
```

### Referral
```typescript
interface Referral {
  id: string;                   // UUID
  partner_id: string;          // UUID
  referred_user_id: string;    // UUID
  partner_code: string;        // Partner's referral code
  status: 'pending' | 'confirmed' | 'failed';
  attribution_method: 'cookie' | 'email_match' | 'referral_code';
  fraud_check: 'clean' | 'flagged' | 'approved' | 'blocked';
  utm_source?: string;         // UTM tracking
  utm_medium?: string;
  utm_campaign?: string;
  ip_address: string;          // Client IP
  user_agent?: string;         // User agent
  created_at: string;          // ISO timestamp
}
```

### Commission
```typescript
interface Commission {
  id: string;                  // UUID
  partner_id: string;          // UUID
  referral_id: string;         // UUID
  payment_id: string;          // Payment system ID
  commission_amount_cents: number;
  commission_rate: number;     // Rate used for calculation
  payment_amount_cents: number; // Original payment amount
  status: 'pending' | 'approved' | 'paid' | 'reversed';
  is_activation_bonus: boolean;
  payout_batch_id?: string;    // UUID if included in payout
  created_at: string;          // ISO timestamp
  approved_at?: string;        // ISO timestamp
  paid_at?: string;           // ISO timestamp
}
```

### PayoutBatch
```typescript
interface PayoutBatch {
  id: string;                  // UUID
  total_amount_cents: number;
  partner_count: number;
  commission_count: number;
  payout_method: string;       // stripe, paypal, wire, wise
  status: 'created' | 'processing' | 'completed' | 'failed';
  description?: string;
  created_at: string;          // ISO timestamp
  processed_at?: string;       // ISO timestamp
  error_message?: string;
}
```

## ⚠️ Error Handling

### Standard Error Response Format
```json
{
  "error": "Partner not found",
  "code": "PARTNER_NOT_FOUND",
  "details": {
    "partner_id": "partner_abc123"
  },
  "timestamp": "2025-09-08T12:00:00Z"
}
```

### Common Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Request data validation failed |
| 400 | `TERMS_NOT_ACCEPTED` | User must accept terms to create partner account |
| 400 | `SELF_REFERRAL` | Users cannot refer themselves |
| 401 | `UNAUTHORIZED` | Authentication required or invalid |
| 403 | `FORBIDDEN` | Access denied (suspended account, etc.) |
| 404 | `PARTNER_NOT_FOUND` | Partner account not found |
| 404 | `REFERRAL_NOT_FOUND` | Referral record not found |
| 409 | `PARTNER_EXISTS` | User already has a partner account |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

## 🚦 Rate Limits

| Endpoint Type | Rate Limit | Window |
|---------------|------------|---------|
| Partner APIs | 100 requests | 1 hour |
| Admin APIs | 1000 requests | 1 hour |
| Track Click | 1000 requests | 5 minutes |
| Track Signup | 50 requests | 5 minutes |

## 🔐 Security Considerations

### HMAC Authentication
- All requests must include valid HMAC signatures
- Timestamps must be within 5 minutes of server time
- Nonces prevent replay attacks
- User identity derived from signature validation

### Fraud Prevention
- IP-based duplicate detection
- User agent analysis
- Velocity checks for signups
- Self-referral prevention
- Admin review for suspicious patterns

### Data Privacy
- PII is filtered from partner APIs
- Admin APIs require additional authorization
- All data access is logged for audit trails
- Commission data includes only necessary information

## 📈 Usage Examples

### Partner Integration Flow
```typescript
// 1. Create partner account
const partner = await createPartner({
  company_name: "My Blog",
  marketing_channels: ["blog", "newsletter"],
  terms_accepted: true
});

// 2. Get referral link
const referralLink = `https://app.sheenapps.com/?ref=${partner.partner_code}`;

// 3. Track performance
const dashboard = await getPartnerDashboard(userId);
console.log(`Conversion rate: ${dashboard.stats.conversion_rate}%`);

// 4. Monitor earnings
const earnings = dashboard.stats.approved_commissions_cents / 100;
console.log(`Ready for payout: $${earnings}`);
```

### Admin Management Flow
```typescript
// 1. Review pending commissions
const pending = await getPendingCommissions({ days: 30 });

// 2. Approve legitimate commissions
await approveCommissions({
  commission_ids: pending.commissions
    .filter(c => c.fraud_check === 'clean')
    .map(c => c.id)
});

// 3. Create payout batch
const batch = await createPayoutBatch({
  payout_method: 'stripe',
  minimum_amount_cents: 5000
});

// 4. Monitor fraud alerts
const alerts = await getFraudAlerts({ days: 7 });
if (alerts.summary.high_severity > 0) {
  console.warn(`${alerts.summary.high_severity} high-severity fraud alerts!`);
}
```

## 🚀 Getting Started

### For Partners (Frontend Integration)
1. Implement partner signup flow with terms acceptance
2. Add referral link sharing functionality
3. Build dashboard with stats and recent activity
4. Handle click tracking on landing pages
5. Track signup conversions after user registration

### For Admins (Admin Panel Integration)
1. Create overview dashboard with key metrics
2. Build partner management interface with filtering
3. Implement commission approval workflow
4. Add payout batch creation and management
5. Set up fraud monitoring and alerting

## 📞 Support

For technical questions or integration support:
- Check API responses for detailed error messages
- All endpoints include comprehensive validation
- Backend handles edge cases gracefully
- Failed tracking operations won't break user flows

**Happy integration!** 🎉