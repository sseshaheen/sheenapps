# Admin Panel API Reference

**Status**: Production Ready - Complete API Documentation
**Last Updated**: 2025-12-07
**API Version**: v2.11.0-career-portal
**Base URL**: `/v1/admin/`

## Overview

This document serves as the comprehensive API reference for the SheenApps Admin Panel. All endpoints are production-ready and fully implemented with security-first architecture, comprehensive audit logging, two-person approval workflows, and complete correlation tracking.

## 🚀 Latest Changes (v2.10.0 - September 7, 2025)

### Promotion Validation Endpoint

#### New Scenario Testing Capability
A new endpoint has been added for testing promotion configurations before deployment:

**`POST /v1/admin/promotions/validate`**
- Test promotion configurations with up to 10 different scenarios
- Multi-currency discount calculations with automatic conversion
- Minimum order validation across different currencies
- Provider compatibility checking
- Real-time eligibility determination

**Example Response:**
```json
{
  "success": true,
  "valid": true,
  "warnings": [],
  "scenario_results": [{
    "eligible": true,
    "discount_amount": 2000,
    "final_amount": 8000,
    "selected_provider": "stripe"
  }, {
    "eligible": false,
    "discount_amount": 0,
    "final_amount": 2000,
    "selected_provider": "fawry",
    "reason": "Order amount 2000 EGP below minimum 5500 EGP"
  }],
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Security Alerts System Enhancements

#### Improved Security Monitoring Tab
The security alerts endpoint has been significantly enhanced for better security monitoring:

**System Event Filtering:**
- Filtered out migration and database system events that were cluttering the security tab
- Removed: `migration_*`, `phase_*`, `schema_*`, `policy_*`, `privilege_*`, `rls_*` events
- Now shows only actionable security incidents that require admin attention

**Enhanced Alert Descriptions:**
```json
{
  "alerts": [{
    "id": "123",
    "type": "login_failure",
    "severity": "high",
    "title": "Repeated Login Failures",
    "description": "5 failed login attempts detected for user@example.com",
    "timestamp": "2025-09-07T19:00:00Z",
    "metadata": {
      "ip_address": "192.168.1.100",
      "user_email": "user@example.com",
      "attempt_count": 5
    },
    "resolved": false
  }]
}
```

**Alert Type Mapping:**
- `login_failure` → **"Repeated Login Failures"** with attempt counts
- `rate_limit_exceeded` → **"Rate Limit Exceeded"** with request counts and endpoints
- `security_breach_detected` → **"Security Breach Detected"** with specific reasons
- `new_location_access` → **"New Location Access"** with location details
- `suspicious_activity` → **"Suspicious Activity"** with confidence scores

**Better Context & Metadata:**
- User email and IP address when available
- Specific details like attempt counts, locations, confidence scores
- Clear descriptions that explain what happened and why it matters

### Previous Changes (v2.9.0 - September 7, 2025)

#### Trust & Safety Risk Assessment Enhancements

#### Complete Risk Factor Breakdown
The `GET /v1/admin/trust-safety/risk-scores` endpoint now returns comprehensive risk analysis:

**New Response Structure:**
```json
{
  "risk_scores": [{
    "user_id": "user_123",
    "user_email": "user@example.com",
    "risk_score": 26,
    "risk_level": "medium",
    "risk_factors": {
      "chargebacks": 1,        // ← NEW: Actual counts
      "failed_payments": 3,     // ← NEW: From database
      "disputes": 0,            // ← NEW: Real-time data
      "security_events": 2,     // ← NEW: Tracked events
      "violations": 0,          // ← NEW: Policy violations
      "suspicious_activity": 1  // ← NEW: Anomaly detection
    },
    "recommendations": [        // ← NEW: Actionable guidance
      "Monitor payment activity",
      "Review recent security events"
    ],
    "last_activity": "2024-01-15T10:30:00Z",
    "account_age_days": 45
  }],
  "metrics": {                  // ← NEW: Dashboard metrics
    "total_users": 1250,
    "high_risk_users": 12,
    "violations_today": 3,
    "security_events_today": 7,
    "suspended_users": 8,
    "blocked_users": 2,
    "chargebacks": {
      "total": 15,
      "trend": "stable"
    },
    "fraud_detection": {
      "attempts_blocked": 23,
      "success_rate": 95.2
    }
  }
}
```

**Risk Score Calculation:**
- Chargebacks: 15 points each
- Failed payments: 3 points each
- Disputes: 10 points each
- Security events: 5 points each
- Violations: 12 points each
- Suspicious activity: 3 points each

**Risk Levels:**
- 0-10: `low` (green)
- 11-30: `medium` (yellow)
- 31-60: `high` (orange)
- 61-100: `critical` (red)

## Previous Changes (v2.8.0 - September 4, 2025)

### New Features Added

#### 1. Dedicated Refresh Token Endpoint
- **NEW**: `POST /v1/admin/auth/refresh` - Refresh expiring admin JWT tokens
- Supports 2-minute grace period for expired tokens
- Maintains session continuity with same permissions
- Tracks refresh count in database

#### 2. SLA Metrics in Support Tickets
The `GET /v1/admin/support/tickets` endpoint now includes comprehensive SLA metrics:
```json
{
  "sla_metrics": {
    "avg_response_time": "2.5 hours",
    "avg_resolution_time": "8.3 hours",
    "sla_compliance_rate": "94.5%",
    "breached_tickets": 2
  }
}
```

#### 3. Development Seed Data
- Added `npm run seed:admin` script for populating test data
- Creates test users, support tickets, pricing catalogs, and advisors
- Includes various ticket statuses for SLA testing

### Previous Updates (v2.7.0)

#### Pagination Standardization
All admin endpoints now provide consistent pagination with complete metadata:

**Before:**
```json
{
  "pagination": {
    "limit": 50,
    "offset": 0,
    "returned": 25
  }
}
```

**After:**
```json
{
  "pagination": {
    "limit": 50,
    "offset": 0,
    "returned": 25,
    "total": 1247
  }
}
```

**Updated Endpoints:**
- ✅ `GET /v1/admin/users` - Added `total` field
- ✅ `GET /v1/admin/advisor-applications` - Added `total` field
- ✅ `GET /v1/admin/support/tickets` - Added `total` field
- ✅ `GET /v1/admin/trust-safety/security-events` - Added `total` field
- ✅ `GET /v1/admin/trust-safety/risk-scores` - Added `total` field
- ✅ `GET /v1/admin/pricing/catalogs` - Added `total` field

This enables proper pagination controls in frontend interfaces without client-side workarounds.

**Key Features:**
- Bearer token authentication with automatic refresh
- Granular permission-based access control
- Two-person approval for high-value operations (>$500)
- Complete audit trail with correlation ID tracking
- Multi-currency revenue analytics and billing insights
- Promotion campaign management with analytics
- Pricing catalog version control

## Authentication & Security

All admin endpoints require authentication and appropriate permissions. The API supports both modern Bearer token authentication and legacy header-based authentication during the transition period.

### Authentication Methods

**Primary: Bearer Token (Recommended)**
```http
Authorization: Bearer <admin_jwt>
```

**Legacy: Base64 Claims (Deprecated)**
```http
x-sheen-claims: <base64_encoded_jwt_claims>
```

### Required Headers

**Standard Headers:**
```http
Authorization: Bearer <admin_jwt>
x-correlation-id: <uuid>
Content-Type: application/json
```

**Sensitive Operations:**
```http
Authorization: Bearer <admin_jwt>
x-admin-reason: [T02] Harassment reported by multiple users
x-correlation-id: <uuid>
idempotency-key: <uuid>
Content-Type: application/json
```

### Permission System

Admin operations require specific permissions. Super admins have access to all endpoints.

**Core Permissions:**
- `admin.read` - Read-only admin operations
- `admin.elevated` - High-security operations
- `admin.approve` - Two-person approval system
- `users.read`, `users.write` - User management
- `advisors.read`, `advisors.approve` - Advisor management
- `finance.read`, `finance.refund` - Financial operations
- `support.read`, `support.write` - Support operations
- `promotion:read`, `promotion:write` - Promotion management

### JWT Claims Structure

```typescript
interface AdminClaims {
  sub: string;                    // User ID (standard JWT claim)
  userId: string;                 // User ID (backward compatibility)
  email: string;                  // User email
  role: 'admin' | 'super_admin';  // Admin role level
  is_admin: boolean;              // Must be true
  admin_permissions: string[];    // Array of permissions
  session_id: string;             // Session tracking ID
  exp: number;                    // Expiration timestamp (12 minutes)
  iat: number;                    // Issued at timestamp
}
```

## API Endpoints Overview

### Base URL
All admin endpoints are prefixed with `/v1/admin/`

### Endpoint Categories

| Category | Endpoints | Description |
|----------|-----------|-------------|
| **Authentication** | 2 endpoints | JWT token management and session control |
| **Dashboard** | 1 endpoint | Control center with KPIs and health status |
| **User Management** | 3 endpoints | User search, status updates, and actions |
| **Advisor Management** | 2 endpoints | Application processing and approval workflow |
| **Support System** | 4 endpoints | Ticket management with SLA tracking |
| **Financial Operations** | 3 endpoints | Refunds, overview, and two-person approvals |
| **Revenue Metrics** | 6 endpoints | MRR, ARR, LTV, ARPU analytics |
| **Admin User Management** | 3 endpoints | Create and manage admin users |
| **Billing Analytics** | 8 endpoints | Multi-currency analytics and health scoring |
| **Promotion Management** | 9 endpoints | Campaign lifecycle, analytics, and validation |
| **Pricing Management** | 4 endpoints | Catalog versioning and activation |
| **Audit & Compliance** | 6 endpoints | Audit logs and two-person approval workflow |
| **Trust & Safety** | 3 endpoints | Risk assessment and violation enforcement |
| **Build Logs** | 3 endpoints | Per-build Claude agent logs for debugging |

**Total: 54+ Production-Ready Endpoints**

## Quick Reference Index

### Authentication
- `POST /v1/admin/auth/exchange` - Exchange Supabase token for Admin JWT
- `POST /v1/admin/auth/login` - Direct login with email/password

### Dashboard & Overview
- `GET /v1/admin/dashboard` - Control center KPIs and health status

### User Management
- `GET /v1/admin/users` - List and search users
- `PUT /v1/admin/users/{id}/status` - Update user status (suspend/ban/activate)

### Advisor Management
- `GET /v1/admin/advisors/applications` - List advisor applications
- `PUT /v1/admin/advisors/{id}/approval` - Approve/reject advisor applications

### Support System
- `GET /v1/admin/support/tickets` - List support tickets with SLA tracking
- `GET /v1/admin/support/tickets/{id}` - Get ticket details with messages
- `POST /v1/admin/support/tickets/{id}/messages` - Add message to ticket
- `PUT /v1/admin/support/tickets/{id}/status` - Update ticket status

### Financial Operations
- `GET /v1/admin/finance/overview` - Financial overview and metrics
- `POST /v1/admin/finance/refunds` - Process refunds (with two-person approval)

### Revenue Metrics & Analytics
- `GET /v1/admin/metrics/dashboard` - Revenue dashboard summary
- `GET /v1/admin/metrics/mrr` - MRR breakdown and trends
- `GET /v1/admin/metrics/ltv` - Customer lifetime value metrics
- `GET /v1/admin/metrics/arpu` - Average revenue per user
- `GET /v1/admin/metrics/growth` - Growth metrics (MoM, QoQ, YoY)
- `POST /v1/admin/metrics/refresh` - Refresh materialized views

### Admin User Management
- `POST /v1/admin/management/users/create` - Create new admin user (super_admin only)
- `GET /v1/admin/management/users` - List all admin users
- `DELETE /v1/admin/management/users/{id}` - Revoke admin privileges

### Billing Analytics
- `GET /v1/admin/billing/overview` - Comprehensive billing dashboard
- `GET /v1/admin/billing/customers/{id}/financial-profile` - Customer 360 profile
- `GET /v1/admin/billing/analytics/revenue` - Multi-currency revenue analytics
- `GET /v1/admin/billing/customers/at-risk` - At-risk customer identification
- `GET /v1/admin/billing/providers/performance` - Payment provider metrics
- `GET /v1/admin/billing/health/distribution` - Health score distribution
- `GET /v1/admin/billing/analytics/packages` - Package revenue analytics
- `POST /v1/admin/billing/maintenance/refresh-views` - Refresh billing views

### Promotion Management
- `GET /v1/admin/promotions` - List promotions with analytics
- `POST /v1/admin/promotions` - Create promotion with codes
- `GET /v1/admin/promotions/{id}` - Get promotion details
- `PATCH /v1/admin/promotions/{id}` - Update promotion settings
- `POST /v1/admin/promotions/{id}/codes` - Add codes to promotion
- `GET /v1/admin/promotions/analytics` - Promotion analytics and reporting
- `POST /v1/admin/promotions/validate` - Validate promotion configurations with test scenarios ✨ NEW
- `POST /v1/admin/promotions/cleanup` - Clean up expired artifacts

### Pricing Management
- `GET /v1/admin/pricing/catalogs` - List pricing catalog versions
- `GET /v1/admin/pricing/catalogs/{id}` - Get catalog details with items
- `POST /v1/admin/pricing/catalogs` - Create new catalog version
- `PUT /v1/admin/pricing/catalogs/{id}/activate` - Activate catalog version
- `GET /v1/admin/pricing/analytics` - Pricing analytics and usage insights

### Audit & Compliance
- `GET /v1/admin/audit/logs` - Retrieve audit logs with filtering
- `GET /v1/admin/audit/logs/{id}` - Get detailed audit log entry
- `GET /v1/admin/audit/logs/stats/summary` - Get audit log statistics
- `GET /v1/admin/audit/alerts` - Retrieve security alerts for monitoring ✨ NEW
- `GET /v1/admin/approvals/pending` - List pending two-person approvals
- `POST /v1/admin/approvals/{id}/approve` - Approve pending request
- `POST /v1/admin/approvals/{id}/reject` - Reject pending request

### Trust & Safety
- `GET /v1/admin/trust-safety/risk-score/{id}` - Get user risk assessment
- `GET /v1/admin/trust-safety/risk-scores` - Get multiple user risk assessments with pagination
- `POST /v1/admin/trust-safety/violation-action` - Execute violation action
- `POST /v1/admin/trust-safety/emergency-action` - Emergency break-glass action

### Build Logs
- `GET /v1/admin/builds/{buildId}/logs` - Stream Claude agent logs with range support
- `GET /v1/admin/builds/{buildId}/info` - Get build metadata and log status
- `GET /v1/admin/builds` - List recent builds with filtering

## Authentication Endpoints

### Token Exchange
**`POST /v1/admin/auth/exchange`**

Exchange Supabase access token for Admin JWT.

**Request:**
```json
{
  "supabase_access_token": "string"
}
```

**Response:**
```json
{
  "success": true,
  "admin_jwt": "string",
  "session_id": "string",
  "expires_at": "2025-09-03T10:30:00.000Z",
  "expires_in": 720,
  "permissions": ["admin.read", "users.write"],
  "user": {
    "id": "uuid",
    "email": "admin@company.com",
    "role": "admin"
  },
  "correlation_id": "uuid"
}
```

### Direct Login
**`POST /v1/admin/auth/login`**

Direct authentication with email/password.

**Request:**
```json
{
  "email": "admin@company.com",
  "password": "securepassword"
}
```

**Response:** Same as token exchange endpoint

## Dashboard Endpoints

### Control Center Dashboard
**`GET /v1/admin/dashboard`**

Returns key performance indicators and system health status.

**Permissions Required:** `admin.read`

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-09-03T10:30:00.000Z",
  "kpis": {
    "open_tickets": 15,
    "due_2h": 3,
    "pending_advisors": 8,
    "revenue_today": 2450.00,
    "build_errors_24h": 2,
    "critical_alerts": 1
  },
  "health_status": {
    "tickets": "warning",
    "advisors": "good",
    "alerts": "critical"
  }
}
```

**Health Status Values:** `"good"` | `"warning"` | `"critical"`

## User Management Endpoints

### List Users
**`GET /v1/admin/users`**

Search and list users with filtering options.

**Permissions Required:** `users.read`

**Query Parameters:**
- `search` (string, optional) - Search by email or name
- `status` (string, optional) - Filter by status: `active` | `suspended` | `banned`
- `exclude_admin_users` (boolean, optional) - When `true`, excludes users with admin roles/permissions from results
- `exclude_advisor_users` (boolean, optional) - When `true`, excludes users with advisor roles or profiles from results
- `limit` (number, optional) - Results per page (default: 50, max: 100)
- `offset` (number, optional) - Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "uuid",
      "email": "john@example.com",
      "full_name": "John Doe",
      "status": "active",
      "banned_until": null,
      "subscription_status": "active",
      "created_at": "2025-01-15T10:30:00.000Z",
      "last_sign_in_at": "2025-08-30T15:20:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "returned": 25,
    "total": 1247
  },
  "filters": {
    "search": "john",
    "status": "active"
  }
}
```

### Update User Status
**`PUT /v1/admin/users/{userId}/status`**

Update user account status (suspend, ban, or activate).

**Permissions Required:** `users.write`
**Headers Required:** `x-admin-reason`

**Request Body:**
```json
{
  "action": "suspend",
  "duration": "P30D",
  "reason": "Violation of terms of service"
}
```

**Action Values:** `suspend` | `ban` | `activate`
**Duration Format:** ISO 8601 duration (e.g., `P30D` for 30 days)

### Advisor Management

```typescript
// List advisor applications
GET /v1/admin/advisors/applications?status=pending&limit=50

Response: {
  success: true,
  applications: [
    {
      id: "uuid",
      display_name: "Dr. Sarah Johnson",
      email: "sarah@example.com",
      bio: "AI researcher with 10 years experience...",
      skills: ["AI", "Machine Learning", "Python"],
      specialties: ["Technical Leadership", "Data Science"],
      languages: ["en", "fr"],
      country_code: "US",
      hours_pending: 24.5,
      approval_status: "pending",
      created_at: "2025-08-30T10:00:00.000Z"
    }
  ]
}

// Approve/reject advisor (requires x-admin-reason header)
PUT /v1/admin/advisors/{advisorId}/approval
Body: {
  action: "approve", // "approve" | "reject"
  reason: "Profile meets quality standards",
  notes?: "Strong technical background, approved"
}
```

### Support Tickets

```typescript
// List support tickets
GET /v1/admin/support/tickets?status=open&priority=high

Response: {
  success: true,
  tickets: [
    {
      id: "uuid",
      ticket_number: "ST-20250831-0001",
      subject: "Payment processing issue",
      category: "billing",
      priority: "high",
      status: "open",
      sla_breached: false,
      hours_until_due: 6.5,
      user_email: "user@example.com",
      assigned_to_email: "support@company.com",
      message_count: 3,
      created_at: "2025-08-31T08:00:00.000Z"
    }
  ]
}

// Get ticket details with messages
GET /v1/admin/support/tickets/{ticketId}?include_internal=true

// Add message to ticket
POST /v1/admin/support/tickets/{ticketId}/messages
Body: {
  body: "Thank you for contacting support...",
  is_internal: false, // true for internal notes
  attachments?: []
}

// Update ticket status
PUT /v1/admin/support/tickets/{ticketId}/status
Body: {
  status: "resolved", // "open" | "in_progress" | "resolved" | "closed"
  reason?: "Issue resolved via payment method update"
}
```

### Financial Operations

```typescript
// Get financial overview
GET /v1/admin/finance/overview

Response: {
  success: true,
  overview: {
    revenue_today: 2450.00,
    revenue_month: 75000.00,
    pending_payouts: {
      count: 12,
      total_amount: 8500.00
    },
    refund_requests: 3
  }
}

// Process refund with audit trail (requires x-admin-reason header)
POST /v1/admin/finance/refunds
Headers: {
  'Authorization': 'Bearer ${adminJWT}',
  'x-admin-reason': '[F02] Customer dissatisfaction - product not as described',
  'x-correlation-id': '${uuid}',
  'idempotency-key': '${uuid}'
}
Body: {
  invoice_id: "inv_1234567890",
  amount?: 50.00,
  reason: "Product not as described - customer request",
  notify_user: true
}

// Response (≤$500 - Immediate Processing)
Response: {
  success: true,
  refund: {
    id: "re_stripe_123",
    amount: 50.00,
    status: "processed",
    processed_at: "2025-08-31T10:30:00Z"
  },
  audit: {
    correlation_id: "corr_abc123",
    admin_user_id: "admin_456",
    logged_at: "2025-08-31T10:30:01Z"
  }
}

// Response (>$500 - Two-Person Approval Required)
Response: {
  status: "pending_approval",
  approval_request: {
    id: "tp_def456",
    threshold: 500,
    expires_at: "2025-09-02T10:30:00Z",
    requires_approval_from: "different_admin"
  },
  correlation_id: "corr_ghi789"
}
```

### Revenue Metrics & Analytics

```typescript
// Get comprehensive revenue metrics dashboard
GET /v1/admin/metrics/dashboard

Response: {
  success: true,
  data: {
    revenue: {
      mrr: number,
      arr: number,
      growth: {
        percentage: number,
        absolute: number
      }
    },
    customers: {
      total: number,
      arpu: number,
      ltv: number
    },
    breakdown: {
      byPlan: Record<string, number>,
      byGateway: Record<string, number>,
      byCountry: Record<string, number>
    },
    movements: {
      newBusiness: number,
      expansion: number,
      contraction: number,
      churn: number
    }
  },
  timestamp: string
}

// Get detailed MRR metrics
GET /v1/admin/metrics/mrr
// Get LTV metrics
GET /v1/admin/metrics/ltv
// Get ARPU metrics
GET /v1/admin/metrics/arpu
// Get growth metrics (MoM, QoQ, YoY)
GET /v1/admin/metrics/growth

// Refresh materialized views (elevated permissions required)
POST /v1/admin/metrics/refresh
Headers: {
  'x-admin-reason': '[Admin] Manual metrics refresh requested'
}
```

### Admin User Management

```typescript
// Create new admin user (super_admin only)
POST /v1/admin/management/users/create
Body: {
  email: string,
  password: string,
  role?: 'admin' | 'super_admin',
  permissions?: string[],
  display_name?: string
}

Response: {
  success: true,
  user: {
    id: string,
    email: string,
    role: string,
    permissions: string[],
    temporary_password: string,    // Only returned on creation
    created_by: string,
    created_at: string
  },
  instructions: 'User should change password on first login'
}

// List all admin users
GET /v1/admin/management/users

Response: {
  success: true,
  admins: AdminUser[],
  total: number
}

// Revoke admin privileges (super_admin only)
DELETE /v1/admin/management/users/:userId
```

### Admin Billing & Financial Analytics

```typescript
// Admin billing overview
GET /v1/admin/billing/overview

Response: {
  success: true,
  data: {
    // Multi-currency revenue analytics
    // Customer health scores
    // Provider performance metrics
    // At-risk customer identification
  }
}

// Customer 360 financial profile
GET /v1/admin/billing/customers/:userId/financial-profile

// Multi-currency revenue analytics
GET /v1/admin/billing/analytics/revenue?currency=USD&provider=stripe

// Currency-specific MRR breakdown
GET /v1/admin/billing/analytics/revenue/currency-breakdown

// At-risk customers based on health scores
GET /v1/admin/billing/customers/at-risk?limit=50&risk_level=high

// Provider performance dashboard
GET /v1/admin/billing/providers/performance?days=30

// Health score distribution
GET /v1/admin/billing/health/distribution

// Package revenue analytics (separate from MRR)
GET /v1/admin/billing/analytics/packages?days=30

// Refresh materialized views for billing
POST /v1/admin/billing/maintenance/refresh-views
```

### Promotion Management System

```typescript
// List all promotions with filtering
GET /v1/admin/promotions?status=active&search=holiday&page=1&limit=20

Response: {
  success: true,
  promotions: PromotionWithStats[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    total_pages: number,
    has_next: boolean,
    has_prev: boolean
  }
}

// Create new promotion with initial codes
POST /v1/admin/promotions
Headers: {
  'x-admin-reason': '[P01] Holiday promotion campaign launch'
}
Body: {
  name: string,
  description?: string,
  discount_type: 'percentage' | 'fixed_amount',
  discount_value: number,
  max_total_uses?: number,
  max_uses_per_user?: number,
  valid_from?: string,
  valid_until?: string,
  notes?: string,
  codes: string[]    // Initial codes to create
}

// Get promotion details with analytics
GET /v1/admin/promotions/:id

Response: {
  success: true,
  promotion: PromotionDetails,
  codes: PromotionCode[],
  recent_redemptions: RedemptionRecord[]
}

// Update promotion settings
PATCH /v1/admin/promotions/:id
Headers: {
  'x-admin-reason': '[P02] Extending promotion due to high demand'
}

// Add new codes to existing promotion
POST /v1/admin/promotions/:id/codes
Headers: {
  'x-admin-reason': '[P03] Additional codes for marketing campaign'
}

// Get promotion analytics and reporting
GET /v1/admin/promotions/analytics?days=30

Response: {
  success: true,
  period_days: number,
  overall_stats: {
    total_promotions: number,
    total_codes: number,
    total_redemptions: number,
    unique_users: number,
    total_discount_given: number,
    avg_discount_per_use: number
  },
  top_promotions: PromotionAnalytics[],
  daily_trends: DailyUsageStats[]
}

// Validate promotion configuration with test scenarios
POST /v1/admin/promotions/validate
Headers: {
  'Authorization': 'Bearer <admin_jwt>',
  'X-Correlation-Id': 'uuid',
  'X-Admin-Reason': 'Scenario testing'
}
Body: {
  promotion_config: {
    name: string,
    discount_type: 'percentage' | 'fixed_amount',
    discount_value: number,
    currency?: 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR' | 'CAD', // Required for fixed_amount
    minimum_order_amount?: number,
    minimum_order_currency?: 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR' | 'CAD',
    supported_providers?: Array<'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs'>,
    regional_configs?: any[]
  },
  test_scenarios: Array<{
    region: 'us' | 'eu' | 'gb' | 'ca' | 'eg' | 'sa',
    currency: 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR' | 'CAD',
    order_amount: number, // Amount in smallest currency unit (cents)
    provider: 'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs'
  }> // Max 10 scenarios
}

Response: {
  success: boolean,
  valid: boolean,
  warnings: string[],
  scenario_results: Array<{
    eligible: boolean,
    discount_amount: number,
    final_amount: number,
    selected_provider: string,
    reason?: string // If not eligible
  }>,
  correlation_id: string
}

// Clean up expired promotion artifacts
POST /v1/admin/promotions/cleanup
```

### Pricing Catalog Management

```typescript
// List all pricing catalog versions
GET /v1/admin/pricing/catalogs?limit=20&offset=0

Response: {
  success: true,
  catalogs: CatalogVersion[],
  pagination: {
    limit: number,
    offset: number,
    returned: number,
    total: number
  }
}

// Get detailed catalog with all pricing items
GET /v1/admin/pricing/catalogs/:id

Response: {
  success: true,
  catalog: CatalogVersion,
  items: PricingItem[]
}

// Create new pricing catalog version
POST /v1/admin/pricing/catalogs
Headers: {
  'x-admin-reason': '[PR01] Q4 pricing adjustment for market alignment'
}
Body: {
  version_tag: string,
  rollover_days?: number,
  reason: string
}

// Activate a catalog version
PUT /v1/admin/pricing/catalogs/:id/activate
Headers: {
  'x-admin-reason': '[PR02] Activating new pricing effective immediately'
}
Body: {
  reason: string
}

// Get pricing analytics and usage insights
GET /v1/admin/pricing/analytics?period=month

Response: {
  success: true,
  period: 'month',
  analytics: {
    purchases_by_plan: PurchaseStats[],
    revenue_by_plan: RevenueStats[],
    usage_stats: {
      active_users: number,
      total_seconds_consumed: number,
      avg_seconds_per_operation: number,
      total_operations: number
    }
  }
}
```

### Admin Audit Logs

```typescript
// Retrieve audit logs with filtering and pagination
GET /v1/admin/audit/logs?action=admin.user.created&limit=50&offset=0

Response: {
  success: true,
  logs: [
    {
      id: "uuid",
      admin_user_id: "uuid",
      admin_email: "admin@company.com",
      action: "admin.user.created",
      resource_type: "admin_user",
      resource_id: "uuid",
      reason: "[A01] New admin user creation",
      extra: {
        email: "newadmin@company.com",
        role: "admin",
        permissions: ["admin:*"]
      },
      created_at: "2025-09-03T10:30:00.000Z",
      correlation_id: "uuid"
    }
  ],
  pagination: {
    limit: 50,
    offset: 0,
    total: 150,
    returned: 50,
    has_more: true
  }
}

// Get detailed audit log entry
GET /v1/admin/audit/logs/{id}

Response: {
  success: true,
  log: {
    id: "uuid",
    admin_user_id: "uuid",
    admin_email: "admin@company.com",
    admin_metadata: { display_name: "Admin User" },
    action: "promotion_created",
    resource_type: "promotion",
    resource_id: "uuid",
    reason: "[P01] Marketing campaign",
    extra: { /* action-specific details */ },
    created_at: "2025-09-03T10:30:00.000Z",
    correlation_id: "uuid"
  }
}

// Get audit log statistics (last 30 days)
GET /v1/admin/audit/logs/stats/summary

Response: {
  success: true,
  summary: {
    period: "30_days",
    stats: {
      total_actions: 1250,
      unique_admins: 5,
      unique_actions: 23,
      unique_resource_types: 8,
      earliest_log: "2025-08-04T00:00:00.000Z",
      latest_log: "2025-09-03T15:45:00.000Z"
    },
    top_actions: [
      { action: "user.status.updated", count: 245 },
      { action: "refund.processed", count: 189 }
    ],
    top_admins: [
      { admin_user_id: "uuid", admin_email: "john@company.com", action_count: 523 }
    ]
  }
}

// Get security alerts for admin monitoring (✨ NEW)
GET /v1/admin/audit/alerts?severity=high&resolved=false&limit=50

Response: {
  success: true,
  alerts: [
    {
      id: "123",
      type: "login_failure",
      severity: "high",
      title: "Repeated Login Failures",
      description: "5 failed login attempts detected for user@example.com",
      timestamp: "2025-09-07T19:00:00Z",
      metadata: {
        ip_address: "192.168.1.100",
        user_email: "user@example.com",
        attempt_count: 5
      },
      resolved: false
    },
    {
      id: "124",
      type: "rate_limit",
      severity: "medium",
      title: "Rate Limit Exceeded",
      description: "Rate limit exceeded (150 requests) on /api/data by user2@example.com",
      timestamp: "2025-09-07T18:45:00Z",
      metadata: {
        ip_address: "172.16.0.25",
        user_email: "user2@example.com",
        requests_count: 150,
        endpoint: "/api/data"
      },
      resolved: false
    },
    {
      id: "125",
      type: "new_location",
      severity: "medium",
      title: "New Location Access",
      description: "Access from Tokyo, Japan (previously: New York, USA) by user3@example.com",
      timestamp: "2025-09-07T18:30:00Z",
      metadata: {
        ip_address: "203.0.113.45",
        user_email: "user3@example.com",
        location: "Tokyo, Japan",
        previous_location: "New York, USA"
      },
      resolved: false
    }
  ],
  pagination: {
    limit: 50,
    offset: 0,
    total: 8,
    returned: 3,
    has_more: false
  }
}
```

### Two-Person Approval System

```typescript
// List pending two-person approvals
GET /v1/admin/approvals/pending?limit=50&offset=0

Response: {
  success: true,
  pending_approvals: [
    {
      id: "tp_abc123",
      action: "refund.issue",
      resource_type: "invoice",
      resource_id: "inv_xyz789",
      payload: {
        amount: 750.00,
        reason: "Customer chargeback risk",
        notify_user: true
      },
      threshold: 500,
      requested_by: "admin_456",
      requested_by_email: "admin@company.com",
      correlation_id: "corr_def456",
      created_at: "2025-08-31T10:15:00Z",
      expires_at: "2025-09-02T10:15:00Z",
      age_hours: 2.5
    }
  ],
  total_count: 3,
  correlation_id: "corr_ghi789"
}

// Approve two-person request (different admin required)
POST /v1/admin/approvals/{requestId}/approve
Headers: {
  'Authorization': 'Bearer ${adminJWT}',
  'x-admin-reason': 'Verified legitimate customer complaint with documentation',
  'x-correlation-id': '${uuid}'
}
Body: {
  reason: "Customer provided valid documentation supporting refund request."
}

Response: {
  success: true,
  approval: {
    id: "tp_abc123",
    approved_by: "admin_789",
    approved_at: "2025-08-31T12:30:00Z",
    reason: "Customer provided valid documentation..."
  },
  execution_result: {
    refund_id: "re_stripe_xyz",
    amount: 750.00,
    processed_at: "2025-08-31T12:30:01Z"
  },
  correlation_id: "corr_jkl012"
}

// Reject two-person request
POST /v1/admin/approvals/{requestId}/reject
Headers: {
  'Authorization': 'Bearer ${adminJWT}',
  'x-admin-reason': 'Insufficient documentation - lacks supporting evidence',
  'x-correlation-id': '${uuid}'
}
Body: {
  reason: "Request lacks sufficient supporting documentation for policy compliance."
}

Response: {
  success: true,
  rejection: {
    id: "tp_abc123",
    rejected_by: "admin_789",
    rejected_at: "2025-08-31T12:35:00Z",
    reason: "Request lacks sufficient supporting documentation..."
  },
  correlation_id: "corr_mno345"
}
```

### Trust & Safety

```typescript
// Get user risk score
GET /v1/admin/trust-safety/risk-score/{userId}

Response: {
  success: true,
  user_id: "uuid",
  risk_score: 25,
  risk_level: "low", // "minimal" | "low" | "medium" | "high"
  risk_factors: {
    chargebacks: 0,
    failed_payments: 1,
    disputes: 0,
    security_events: 2,
    violations: 0
  },
  recommendations: [
    "Standard monitoring sufficient"
  ]
}

// Get multiple user risk scores with pagination
GET /v1/admin/trust-safety/risk-scores?user_ids=uuid1,uuid2&limit=50&offset=0

Response: {
  success: true,
  risk_scores: [
    {
      user_id: "uuid",
      user_email: "user@example.com",
      risk_score: 85,
      risk_level: "high",
      factors: {
        payment_risk: 30,
        behavior_risk: 25,
        report_history: 30
      },
      recent_violations: 3,
      account_age_days: 45,
      is_suspended: false,
      is_banned: false
    }
  ],
  pagination: {
    limit: 50,
    offset: 0,
    total: 2,
    returned: 2,
    has_more: false
  }
}

// Execute violation action (requires x-admin-reason header)
POST /v1/admin/trust-safety/violation-action
Body: {
  user_id: "uuid",
  violation_code: "T02", // T01-T05 codes
  evidence: "Screenshots of harassment in chat",
  action: "temp_mute_24h",
  reason: "Harassment of another user"
}

// Emergency break-glass action (requires elevated permissions)
POST /v1/admin/trust-safety/emergency-action
Body: {
  user_id: "uuid",
  action: "emergency_suspend", // "emergency_suspend" | "emergency_ban"
  justification: "Immediate threat to platform safety based on reports",
  duration?: "P1D"
}
```

## 🔄 Two-Person Approval Workflow

### Frontend UX Requirements

**For High-Value Operations (>$500):**

```typescript
// Component: TwoPersonApprovalBanner.tsx
interface PendingApproval {
  id: string;
  action: string;
  amount?: number;
  expires_at: string;
  age_hours: number;
}

export function TwoPersonApprovalBanner({ approval }: { approval: PendingApproval }) {
  const timeUntilExpiry = useMemo(() => {
    const expiryTime = new Date(approval.expires_at).getTime();
    const now = Date.now();
    const hoursLeft = Math.max(0, (expiryTime - now) / (1000 * 60 * 60));
    return Math.floor(hoursLeft);
  }, [approval.expires_at]);

  return (
    <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-orange-800">
            ⚠️ High-Value Operation Pending Approval
          </h3>
          <p className="text-sm text-orange-600 mt-1">
            {approval.action} for ${approval.amount} • Requested {approval.age_hours}h ago
            • Expires in {timeUntilExpiry}h
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleApproval(approval.id, 'approve')}
            className="btn-success-sm"
          >
            ✓ Approve
          </button>
          <button
            onClick={() => handleApproval(approval.id, 'reject')}
            className="btn-danger-sm"
          >
            ✗ Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook: usePendingApprovals.ts
export function usePendingApprovals() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        const response = await adminFetch('/v1/admin/approvals/pending');
        const data = await response.json();
        setApprovals(data.pending_approvals || []);
      } catch (error) {
        console.error('Failed to fetch pending approvals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovals();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchApprovals, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleApproval = async (id: string, action: 'approve' | 'reject', reason: string) => {
    try {
      await adminFetch(`/v1/admin/approvals/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
        reason: `[F02] ${reason}` // Structured reason code
      });

      // Remove from pending list
      setApprovals(prev => prev.filter(a => a.id !== id));

      toast.success(`Request ${action}d successfully`);
    } catch (error) {
      handleAdminError(error);
    }
  };

  return { approvals, loading, handleApproval };
}
```

## 🎨 UI Components Recommendations

### Layout Structure

```typescript
// Suggested admin layout structure
/admin/
├── dashboard/           # Control center
├── users/              # User management
│   ├── search/
│   └── [userId]/
├── advisors/           # Advisor management
│   ├── applications/
│   └── [advisorId]/
├── support/            # Support tickets
│   ├── tickets/
│   └── [ticketId]/
├── finance/            # Financial oversight
│   ├── overview/
│   └── refunds/
├── trust-safety/       # Trust & safety
│   ├── violations/
│   ├── risk-assessment/
│   └── emergency/
└── audit/             # Audit logs
```

### Dashboard Cards Component

```typescript
interface DashboardCard {
  title: string;
  value: number | string;
  status: 'good' | 'warning' | 'critical';
  trend?: 'up' | 'down' | 'stable';
  link?: string;
}

const DashboardCards: React.FC = () => {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const cards: DashboardCard[] = [
    {
      title: "Open Tickets",
      value: kpis?.open_tickets || 0,
      status: kpis?.health_status.tickets || 'good',
      link: "/admin/support/tickets?status=open"
    },
    {
      title: "Due in 2h",
      value: kpis?.due_2h || 0,
      status: (kpis?.due_2h || 0) > 0 ? 'critical' : 'good',
      link: "/admin/support/tickets?sla_status=due_soon"
    },
    // ... more cards
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map(card => (
        <DashboardCard key={card.title} {...card} />
      ))}
    </div>
  );
};
```

### Admin Reason Modal

```typescript
interface AdminReasonModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  requiresReason?: boolean;
}

const AdminReasonModal: React.FC<AdminReasonModalProps> = ({
  isOpen, title, description, onConfirm, onCancel, requiresReason = true
}) => {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (requiresReason && reason.trim().length < 10) {
      alert('Please provide a detailed reason (minimum 10 characters)');
      return;
    }
    onConfirm(reason);
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel}>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        <p className="text-gray-600 mb-4">{description}</p>

        {requiresReason && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please provide a detailed reason for this action..."
            className="w-full h-24 border rounded p-3 mb-4"
            required
          />
        )}

        <div className="flex justify-end space-x-3">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary"
            disabled={requiresReason && reason.trim().length < 10}
          >
            Confirm Action
          </button>
        </div>
      </div>
    </Modal>
  );
};
```

## 🔧 API Client Utility

```typescript
// Updated Admin API client with new authentication
class AdminApiClient {
  private baseUrl = '/v1/admin';

  private async getHeaders(requireReason?: string): Promise<Record<string, string>> {
    const token = await AdminAuthManager.getValidToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-correlation-id': crypto.randomUUID()
    };

    if (requireReason) {
      headers['x-admin-reason'] = requireReason;
    }

    return headers;
  }

  async get<T>(endpoint: string): Promise<T> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new ApiError(await response.json());
    }

    return response.json();
  }

  async post<T>(endpoint: string, data: any, reason?: string): Promise<T> {
    const headers = await this.getHeaders(reason);

    // Add idempotency key for POST operations
    headers['idempotency-key'] = crypto.randomUUID();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new ApiError(await response.json());
    }

    return response.json();
  }

  async put<T>(endpoint: string, data: any, reason?: string): Promise<T> {
    const headers = await this.getHeaders(reason);

    // Add idempotency key for PUT operations
    headers['idempotency-key'] = crypto.randomUUID();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new ApiError(await response.json());
    }

    return response.json();
  }

  // Dashboard
  async getDashboard() {
    return this.get<DashboardResponse>('/dashboard');
  }

  // User Management
  async getUsers(params?: UserSearchParams) {
    const query = new URLSearchParams(params as any).toString();
    return this.get<UsersResponse>(`/users?${query}`);
  }

  async updateUserStatus(userId: string, action: UserAction, reason: string) {
    return this.put<UserStatusResponse>(
      `/users/${userId}/status`,
      { action, reason },
      reason
    );
  }

  // Advisor Management
  async getAdvisorApplications(status = 'pending') {
    return this.get<AdvisorApplicationsResponse>(`/advisors/applications?status=${status}`);
  }

  async approveAdvisor(advisorId: string, action: 'approve' | 'reject', reason: string) {
    return this.put<AdvisorApprovalResponse>(
      `/advisors/${advisorId}/approval`,
      { action, reason },
      reason
    );
  }

  // Support Tickets
  async getTickets(params?: TicketSearchParams) {
    const query = new URLSearchParams(params as any).toString();
    return this.get<TicketsResponse>(`/support/tickets?${query}`);
  }

  async getTicketDetails(ticketId: string) {
    return this.get<TicketDetailsResponse>(`/support/tickets/${ticketId}`);
  }

  async addTicketMessage(ticketId: string, message: TicketMessage) {
    return this.post<MessageResponse>(`/support/tickets/${ticketId}/messages`, message);
  }

  // NEW: Two-person approval methods
  async getPendingApprovals(limit = 50, offset = 0) {
    return this.get<PendingApprovalsResponse>(`/approvals/pending?limit=${limit}&offset=${offset}`);
  }

  async approveRequest(requestId: string, reason: string) {
    return this.post<ApprovalResponse>(
      `/approvals/${requestId}/approve`,
      { reason },
      `[F02] ${reason}`
    );
  }

  async rejectRequest(requestId: string, reason: string) {
    return this.post<RejectionResponse>(
      `/approvals/${requestId}/reject`,
      { reason },
      `[F02] ${reason}`
    );
  }
}

export const adminApi = new AdminApiClient();
```

## ⚠️ Error Handling

The backend returns standardized error responses:

```typescript
interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: any;
  timestamp: string;
}

// Common error codes
const ERROR_CODES = {
  INSUFFICIENT_PRIVILEGES: 'User lacks required admin permissions',
  PERMISSION_DENIED: 'Specific permission missing',
  MISSING_ADMIN_REASON: 'Sensitive operation requires reason',
  INVALID_SIGNATURE: 'HMAC signature validation failed',
  AUTH_ERROR: 'Authentication failed'
} as const;
```

## 🚨 Security Considerations

### Frontend Security Checklist

- [ ] **Never store admin credentials in localStorage** - use secure, httpOnly cookies
- [ ] **Validate admin permissions client-side** - for UI state, not security
- [ ] **Always require reason for sensitive actions** - use modals to collect
- [ ] **Implement session timeout** - auto-logout after inactivity
- [ ] **Log all admin actions** - for audit compliance
- [ ] **Use HTTPS only** - never send admin tokens over HTTP
- [ ] **Implement CSRF protection** - use standard Next.js patterns
- [ ] **Sanitize all user input** - prevent XSS in admin interface

### Sensitive Operations Requiring Reason

These operations require the `x-admin-reason` header:
- User suspension/ban/activation
- Advisor approval/rejection
- Refund processing
- Policy violation enforcement
- Emergency break-glass actions

### Two-Person Rule Operations

High-value operations require approval from a second admin and return `202 Accepted` status:

**Operations requiring approval:**
- Refunds over $500
- User account deletions
- System configuration changes
- Mass user actions

**API Response Pattern:**
```json
{
  "status": "pending_approval",
  "request_id": "req_abc123",
  "correlation_id": "corr_xyz789",
  "requires_approval_from": "super_admin",
  "expires_at": "2025-08-31T15:30:00Z"
}
```

**Frontend UX Requirements:**
- Show pending approval banner with timer
- Allow authorized approvers to Confirm/Reject
- Link to audit log entry
- Disable duplicate submissions

## 🔧 Enhanced Frontend Integration

### Real-Time Approval Notifications

```typescript
// Hook: useRealTimeApprovals.ts
export function useRealTimeApprovals() {
  const [notifications, setNotifications] = useState<ApprovalNotification[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    // Poll for new approvals requiring attention
    const pollApprovals = async () => {
      try {
        const response = await adminFetch('/v1/admin/approvals/pending');
        const data = await response.json();

        // Filter for approvals this admin can process (different admin rule)
        const actionable = data.pending_approvals.filter(
          (approval: any) => approval.requested_by !== user.id
        );

        setNotifications(actionable.map((approval: any) => ({
          id: approval.id,
          message: `${approval.action} for $${approval.payload.amount} pending approval`,
          urgency: approval.age_hours > 6 ? 'high' : 'normal',
          expiresAt: approval.expires_at
        })));
      } catch (error) {
        console.error('Failed to fetch approval notifications:', error);
      }
    };

    pollApprovals();
    const interval = setInterval(pollApprovals, 30000); // 30-second polling

    return () => clearInterval(interval);
  }, [user.id]);

  return { notifications };
}

// Component: ApprovalNotificationBell.tsx
export function ApprovalNotificationBell() {
  const { notifications } = useRealTimeApprovals();
  const highPriority = notifications.filter(n => n.urgency === 'high');

  return (
    <div className="relative">
      <button className="p-2 rounded-full hover:bg-gray-100">
        🔔
        {notifications.length > 0 && (
          <span className={`absolute -top-1 -right-1 text-xs rounded-full px-2 py-1 ${
            highPriority.length > 0
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-orange-500 text-white'
          }`}>
            {notifications.length}
          </span>
        )}
      </button>

      {/* Dropdown with notification list */}
    </div>
  );
}
```

### Enhanced Error Handling with Correlation IDs

```typescript
// utils/errorHandling.ts
export interface AdminError extends Error {
  correlationId?: string;
  code?: string;
  status?: number;
  details?: any;
}

export function handleAdminError(error: AdminError) {
  // Log detailed error for debugging
  console.error('Admin operation failed:', {
    message: error.message,
    correlationId: error.correlationId,
    code: error.code,
    status: error.status,
    details: error.details,
    timestamp: new Date().toISOString(),
    stack: error.stack
  });

  // Show user-friendly notification with troubleshooting info
  toast.error(
    <div className="space-y-2">
      <div className="font-medium text-red-900">
        {getErrorMessage(error)}
      </div>
      {error.correlationId && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          <div className="flex items-center justify-between">
            <span>Troubleshooting ID: {error.correlationId}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(error.correlationId!);
                toast.success('ID copied to clipboard');
              }}
              className="text-red-800 underline hover:no-underline"
            >
              Copy
            </button>
          </div>
          <div className="text-xs mt-1 text-red-500">
            Include this ID when reporting the issue
          </div>
        </div>
      )}
    </div>,
    { duration: 8000 } // Longer duration for error messages
  );
}

function getErrorMessage(error: AdminError): string {
  switch (error.code) {
    case 'INSUFFICIENT_PRIVILEGES':
      return 'You do not have permission to perform this action.';
    case 'TWO_PERSON_REQUIRED':
      return 'This operation requires approval from a different admin.';
    case 'IDEMPOTENCY_CONFLICT':
      return 'This operation was already processed.';
    default:
      return error.message || 'An unexpected error occurred.';
  }
}
```

## 💻 Frontend Code Examples

### AdminApiClient with Correlation IDs & Idempotency

```typescript
// utils/AdminApiClient.ts (Updated for Bearer token authentication)
class AdminApiClient {
  private baseUrl = '/v1/admin';

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any,
    reason?: string
  ) {
    const correlationId = crypto.randomUUID();
    const token = await AdminAuthManager.getValidToken();

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'x-correlation-id': correlationId,
      'Content-Type': 'application/json'
    };

    // Add reason for sensitive operations
    if (reason) {
      headers['x-admin-reason'] = reason;
    }

    // Add idempotency for state-changing operations
    if (method === 'POST' || method === 'PUT') {
      headers['idempotency-key'] = correlationId;
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (res.status === 401) {
      // Token expired, trigger re-authentication
      AdminAuthManager.clearToken();
      throw new Error('AUTHENTICATION_REQUIRED');
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Create enhanced error with correlation tracking
      const error = Object.assign(new Error(data?.error || 'Request failed'), {
        code: data?.code,
        data,
        status: res.status,
        correlationId
      }) as AdminError;

      handleAdminError(error);
      throw error;
    }

    return Object.assign(data, { correlationId }) as T & { correlationId: string };
  }

  // Method examples
  updateUserStatus(userId: string, action: 'suspend' | 'ban' | 'activate', reason: string) {
    return this.request('PUT', `/users/${userId}/status`, { action }, reason);
  }

  processRefund(invoiceId: string, amount: number, reason: string) {
    return this.request('POST', '/finance/refunds', {
      invoice_id: invoiceId,
      amount,
      reason,
      notify_user: true
    }, reason);
  }
}
```

### Structured Reason Modal Component

```typescript
// components/AdminReasonModal.tsx
const REASON_CODES = {
  trust: [
    { code: 'T01', label: 'Spam or promotional content' },
    { code: 'T02', label: 'Harassment or abusive behavior' },
    { code: 'T03', label: 'Fraud or chargeback risk' },
    { code: 'T04', label: 'Policy evasion or circumvention' },
    { code: 'T05', label: 'Illegal content or activity' }
  ],
  finance: [
    { code: 'F01', label: 'Duplicate charge or billing error' },
    { code: 'F02', label: 'Customer dissatisfaction' },
    { code: 'F03', label: 'Fraud reversal or chargeback' }
  ]
};

export function AdminReasonModal({
  isOpen,
  title,
  description,
  onConfirm,
  onCancel,
  category = 'trust'
}: {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: (reasonHeader: string, payload: { code: string; details: string }) => void;
  onCancel: () => void;
  category?: 'trust' | 'finance';
}) {
  const [code, setCode] = useState(REASON_CODES[category][0].code);
  const [details, setDetails] = useState('');
  const disabled = details.trim().length < 10;

  const submit = () => {
    const reasonHeader = `[${code}] ${details.trim()}`;
    onConfirm(reasonHeader, { code, details: details.trim() });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      aria-labelledby="reason-title"
      aria-describedby="reason-desc"
    >
      <div className="p-6 space-y-4">
        <h2 id="reason-title" className="text-lg font-semibold">{title}</h2>
        <p id="reason-desc" className="text-sm text-muted-foreground">{description}</p>

        <div className="space-y-2">
          <label className="text-sm font-medium">Reason Code</label>
          <select
            className="w-full border rounded p-2"
            value={code}
            onChange={e => setCode(e.target.value)}
          >
            {REASON_CODES[category].map(r => (
              <option key={r.code} value={r.code}>
                {r.code} — {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Details (minimum 10 characters)</label>
          <textarea
            className="w-full h-28 border rounded p-2"
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Provide specific details about this action..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button onClick={submit} className="btn-primary" disabled={disabled}>
            Confirm Action
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

### Permission-Based UI Hook

```typescript
// hooks/useAdminPermissions.ts
export function useAdminPermissions() {
  const claims = useAdminClaims(); // Your JWT claims hook

  const has = (permission: string) =>
    claims?.admin_permissions?.includes(permission) ||
    claims?.role === 'super_admin';

  return {
    // User management
    canReadUsers: has('users.read'),
    canWriteUsers: has('users.write'),

    // Financial operations
    canRefund: has('finance.refund'),
    canViewFinance: has('finance.read'),

    // Advisor management
    canApproveAdvisor: has('advisors.approve'),

    // Trust & safety
    canEnforceViolations: has('violations.enforce'),

    // Support system
    canManageSupport: has('support.write'),

    // Generic permission check
    has
  };
}

// Usage example:
function UserActionButton({ userId }: { userId: string }) {
  const { canWriteUsers } = useAdminPermissions();

  if (!canWriteUsers) return null; // Hide if no permission

  return <button onClick={() => handleUserAction(userId)}>Suspend User</button>;
}
```

### Error Handling with Correlation IDs

```typescript
// utils/errorHandler.ts
export function handleAdminError(error: any) {
  const { message, correlationId, status, data } = error;

  // Show user-friendly error with troubleshooting info
  toast.error(
    <div>
      <div className="font-medium">{message}</div>
      <div className="text-sm text-muted-foreground mt-1">
        Error ID: {correlationId}
        <button
          className="ml-2 text-blue-500 underline"
          onClick={() => navigator.clipboard.writeText(correlationId)}
        >
          Copy
        </button>
      </div>
    </div>
  );

  // Log detailed error for debugging
  console.error('Admin operation failed:', {
    message,
    correlationId,
    status,
    data,
    timestamp: new Date().toISOString()
  });
}
```

### Accessibility Considerations

**Required for all admin components:**
- **Focus management**: Modal dialogs must trap focus and return focus on close
- **Keyboard navigation**: All interactive elements accessible via Tab/Enter/Space
- **Screen reader support**: Use `aria-labelledby`, `aria-describedby`, and `role` attributes
- **Color contrast**: Ensure 4.5:1 contrast ratio for all text
- **Error announcements**: Use `aria-live` regions for dynamic error messages

**Example:**
```typescript
// Accessible error announcement
function ErrorAnnouncement({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="sr-only"
    >
      {message}
    </div>
  );
}
```

## 📝 Implementation Status & Expert Integration

### ✅ FULLY IMPLEMENTED - Production-Ready Features:

**Core Admin System:**
- ✅ **Bearer Token Authentication**: Modern JWT-based auth with automatic refresh
- ✅ **Direct Login Flow**: Alternative auth without Supabase dependency
- ✅ **Dual Auth Support**: Bearer tokens + legacy x-sheen-claims (grace period)
- ✅ **Granular Permissions**: Role-based access with wildcard support
- ✅ **Session Management**: Database-tracked sessions with audit trails

**Admin Audit & Compliance System:**
- ✅ **Idempotency Protection**: HMAC-based request deduplication prevents double operations
- ✅ **Two-Person Rule**: Automatic >$500 threshold with different admin constraint
- ✅ **Complete Audit Trail**: End-to-end correlation tracking with immutable logs
- ✅ **Stripe Integration**: UUID pairing across API→DB→Stripe with webhook closure
- ✅ **Structured Reason Codes**: T01-T05 (Trust), F01-F03 (Financial), P01-P03 (Promotions)
- ✅ **Database Security**: RLS policies with SECURITY DEFINER RPCs

**Advanced Admin Features:**
- ✅ **Revenue Metrics Dashboard**: MRR, ARR, LTV, ARPU with real-time data
- ✅ **Admin User Management**: Create/revoke admin users with privilege escalation prevention
- ✅ **Multi-Currency Billing Analytics**: Provider performance and health scoring
- ✅ **Promotion Management**: Full lifecycle with analytics and cleanup
- ✅ **Pricing Catalog Management**: Version control with activation validation
- ✅ **Financial Operations**: Enhanced refunds with two-person approval workflow

**Enhanced Error Handling:**
- ✅ **Correlation ID Tracking**: Every request tracked for troubleshooting
- ✅ **Standardized Error Format**: Consistent responses with context
- ✅ **Copy-to-Clipboard**: User-friendly error ID sharing
- ✅ **Graceful Degradation**: Webhook failures don't break admin operations

### 🚀 READY FOR FRONTEND INTEGRATION:

**Core Admin Management:**
- 🎯 **Control Center Dashboard**: KPI monitoring with health status indicators
- 🎯 **Two-Person Approval Queue**: Real-time notifications and workflow UI
- 🎯 **Enhanced User Management**: Search, suspend, ban with audit reasons
- 🎯 **Advisor Application Processing**: Approval workflow with notes

**Financial & Analytics:**
- 🎯 **Revenue Metrics Dashboard**: Real-time MRR/ARR with drill-down capability
- 🎯 **Customer 360 Profiles**: Financial health scores and risk assessment
- 🎯 **Multi-Currency Analytics**: Provider comparison and performance metrics
- 🎯 **Enhanced Refund Interface**: Automatic threshold detection and approval routing

**Advanced Features:**
- 🎯 **Promotion Campaign Management**: Create, track, and analyze campaigns
- 🎯 **Pricing Catalog Control**: Version management with safe activation
- 🎯 **Support Ticket Management**: SLA tracking with escalation workflows
- 🎯 **Admin User Administration**: Privilege management with security controls

**Production-Ready API Endpoints:**
- 📋 **15 Admin Route Files**: All endpoints documented with full response schemas
- ✅ **Bearer Token Authentication**: Dual support for modern + legacy auth
- 🔄 **Two-Person Approval System**: Complete workflow from request to execution
- 📊 **Revenue & Billing Analytics**: 10+ endpoints for financial insights
- 🏷️ **Promotion Management**: 8+ endpoints for campaign lifecycle
- 💰 **Pricing Management**: Catalog versioning with activation controls

All backend systems are production-ready with comprehensive testing. Frontend integration can begin immediately with full confidence in the underlying audit and security infrastructure.

## 📋 Implementation Checklist

## ✅ **DATABASE MIGRATIONS COMPLETED**

**✅ Current Schema Status:**
- `migrations/067_admin_session_tracking.sql` - Session tracking with JWT integration
- `migrations/068_admin_audit_foundation.sql` - Complete audit system with RLS

**✅ Key Production Features:**
1. **Admin Authentication**: Supabase token exchange with MFA verification
2. **Audit System**: Three-table architecture with atomic RPCs
3. **Two-Person Workflow**: High-value operation approval system
4. **Stripe Integration**: Complete UUID correlation with webhook closure
5. **Security Controls**: RLS policies with admin-only access patterns

**✅ API Endpoints Production-Ready:**
- All admin endpoints use Bearer token authentication
- Complete correlation ID tracking implemented
- Idempotency protection for financial operations
- Structured reason codes with validation
- Error handling with troubleshooting context

### Phase 1: Authentication & Core Setup (Week 1)
- [ ] **Implement Token Exchange**: Create Supabase → Admin JWT flow
- [ ] **Build adminFetch() Utility**: Token management with auto-refresh
- [ ] **Create Admin Layout**: Navigation with permission-based visibility
- [ ] **Dashboard Foundation**: KPI cards with real-time data
- [ ] **Error Handling Setup**: Correlation ID display and copy functionality
- [ ] **Two-Person Notification Bell**: Real-time approval alerts

### Phase 2: Two-Person Approval System (Week 1-2)
- [ ] **Pending Approvals Queue**: List with urgency indicators and timers
- [ ] **Approval Decision Interface**: Approve/reject with structured reasons
- [ ] **Different Admin Enforcement**: UI validation preventing self-approval
- [ ] **Real-Time Updates**: 30-second polling for new approval requests
- [ ] **Correlation Tracking**: Link approvals to original requests
- [ ] **Success Notifications**: Toast messages with execution results

### Phase 3: Enhanced Financial Operations (Week 2)
- [ ] **Smart Refund Interface**: Automatic threshold detection (>$500)
- [ ] **Two-Person Refund Flow**: Visual workflow with approval routing
- [ ] **Idempotency Protection**: Prevent duplicate refund attempts
- [ ] **Correlation ID Tracking**: Link refunds to Stripe and webhook events
- [ ] **Financial Overview**: Dashboard with pending approval indicators
- [ ] **Audit Trail Viewer**: Complete refund history with admin actions

### Phase 4: User & Advisor Management (Week 2-3)
- [ ] **User Management**: Search, suspend, ban with audit reasons
- [ ] **Advisor Applications**: Queue with one-click approval workflow
- [ ] **Status Change Interface**: Structured reason modal with validation
- [ ] **Activity Audit Viewer**: Complete admin action history

### Phase 5: Support & Trust Safety (Week 3-4)
- [ ] **Support Ticket Interface**: SLA indicators with correlation tracking
- [ ] **Trust & Safety Dashboard**: Risk assessment with violation workflow
- [ ] **Emergency Controls**: Break-glass actions with elevated permissions
- [ ] **Comprehensive Audit Search**: Filter by correlation ID, admin, action type

## 🎯 MVP Priority (Week 1-2) - Updated Focus

**Critical Path 1: Two-Person Approval System**
- Pending approval notifications and queue interface
- Approve/reject workflow with different admin constraint
- Real-time updates and correlation tracking
- *Impact*: Enable high-value refunds (>$500) with proper oversight

**Critical Path 2: Enhanced Authentication**
- Supabase token exchange implementation
- adminFetch() utility with automatic token refresh
- Bearer token migration from legacy x-sheen-claims
- *Impact*: Secure, production-ready admin authentication

**Critical Path 3: Smart Refund Processing**
- Automatic threshold detection and routing
- Integration with two-person approval system
- Complete audit trail with correlation IDs
- *Impact*: Streamlined financial operations with compliance

**Foundation Components:**
- Correlation ID error handling with copy functionality
- Structured reason modal with T01-T05/F01-F03 codes
- Real-time approval notification bell

*Everything else (user management, support tickets, trust & safety) can remain read-only initially while focusing on the audit and compliance foundation.*

## 🔗 Related Documentation

**Core Implementation Guides:**
- [Admin Audit Implementation Summary](./ADMIN_AUDIT_IMPLEMENTATION_SUMMARY.md) - **READ FIRST**
- [API Reference for Next.js](./API_REFERENCE_FOR_NEXTJS.md) - Complete endpoint documentation
- [Postman Collection](./POSTMAN_SheenApps-Claude_Worker_API.postman_collection-2-Aug-2025.json) - Testing and examples

**Database Schema:**
- [Admin Session Tracking](../migrations/067_admin_session_tracking.sql) - JWT session management
- [Admin Audit Foundation](../migrations/068_admin_audit_foundation.sql) - Complete audit system

**Legacy References:**
- [Admin Panel Implementation Plan](./ADMIN_PANEL_IMPLEMENTATION_PLAN.md) - Original planning document
- [Database Schema Reference](../migrations/066_admin_panel_foundation_supabase.sql) - Superseded by 067-068

## 💼 Career Portal Management (September 2025)

### Overview
Complete admin management system for the career portal with full CRUD operations for job postings and application management.

### Career Admin Endpoints

#### 1. List All Jobs (Admin View)
`GET /api/admin/careers/jobs`

**Query Parameters:**
- `is_active`: Boolean - filter by active status
- `search`: String - text search
- `limit`: Number (default: 50)
- `offset`: Number (default: 0)

**Required Headers:**
- Admin authentication headers (HMAC signature)
- `x-admin-user-id`: Admin user UUID
- `x-correlation-id`: Request tracking ID

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": "uuid",
      "slug": "senior-backend-engineer",
      "multilingual_title": {"ar": "مهندس خلفي أول", "en": "Senior Backend Engineer"},
      "department": "Engineering",
      "employment_type": "full_time",
      "is_active": true,
      "is_featured": true,
      "view_count": 234,
      "application_count": 12,
      "created_at": "2025-12-01T10:00:00Z",
      "updated_at": "2025-12-01T10:00:00Z"
    }
  ],
  "total": 45,
  "limit": 50,
  "offset": 0
}
```

#### 2. Get Job Details (Admin)
`GET /api/admin/careers/jobs/:id`

**Response includes:**
- Full job details with all multilingual fields
- Total application count
- New application count
- Creation and update metadata

#### 3. Create New Job
`POST /api/admin/careers/jobs`

**Request Body:**
```json
{
  "multilingual_title": {"ar": "مهندس خلفي", "en": "Backend Engineer"},
  "multilingual_description": {"ar": "<p>وصف الوظيفة...</p>", "en": "<p>Job description...</p>"},
  "multilingual_requirements": {"ar": "<ul><li>متطلبات...</li></ul>"},
  "multilingual_benefits": {"ar": "<ul><li>مزايا...</li></ul>"},
  "multilingual_location": {"ar": "القاهرة، مصر", "en": "Cairo, Egypt"},
  "department": "Engineering",
  "employment_type": "full_time",
  "experience_level": "senior",
  "salary": {
    "min": 15000,
    "max": 25000,
    "currency": "EGP",
    "period": "monthly"
  },
  "posted_at": "2025-12-01T10:00:00Z",
  "application_deadline": "2025-12-31T23:59:59Z",
  "is_remote": true,
  "is_featured": false,
  "is_active": true
}
```

**Headers:**
- `x-admin-reason`: Reason for creation (for audit log)

**Response:**
```json
{
  "success": true,
  "job_id": "uuid",
  "slug": "backend-engineer"
}
```

#### 4. Update Job
`PUT /api/admin/careers/jobs/:id`

**Request Body:** Partial job object with fields to update

**Headers:**
- `x-admin-reason`: Reason for update (for audit log)

**Response:**
```json
{
  "success": true,
  "message": "Job updated successfully"
}
```

#### 5. Delete Job (Soft Delete)
`DELETE /api/admin/careers/jobs/:id`

Sets `is_active` to false rather than deleting the record.

**Headers:**
- `x-admin-reason`: Reason for deletion (for audit log)

#### 6. List Applications
`GET /api/admin/careers/applications`

**Query Parameters:**
- `job_id`: Filter by specific job
- `status`: Filter by status (`new`, `reviewing`, `shortlisted`, `rejected`, `hired`, `withdrawn`)
- `search`: Search by name or email
- `limit`: Number (default: 50)
- `offset`: Number (default: 0)

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": "app_uuid",
      "job_id": "job_uuid",
      "job_title": {"ar": "مهندس خلفي", "en": "Backend Engineer"},
      "full_name": "Ahmed Hassan",
      "email": "ahmed@example.com",
      "phone": "+201234567890",
      "status": "new",
      "created_at": "2025-12-05T14:30:00Z",
      "resume_url": "https://r2.sheenapps.com/career/resumes/2025/12/uuid-ahmed-hassan.pdf"
    }
  ],
  "total": 123,
  "limit": 50,
  "offset": 0
}
```

#### 7. Get Application Details
`GET /api/admin/careers/applications/:id`

Returns full application details including:
- Cover letter
- Resume URL (signed R2 URL)
- LinkedIn/Portfolio URLs
- Years of experience
- Review notes
- IP address and user agent
- Job details

#### 8. Update Application Status
`PUT /api/admin/careers/applications/:id/status`

**Request Body:**
```json
{
  "status": "shortlisted",
  "reviewer_notes": "Strong candidate, schedule interview"
}
```

**Status Options:**
- `new`: Initial state
- `reviewing`: Under review
- `shortlisted`: Selected for interview
- `rejected`: Not selected
- `hired`: Offer accepted
- `withdrawn`: Applicant withdrew

**Headers:**
- `x-admin-reason`: Reason for status change

#### 9. Get Career Statistics
`GET /api/admin/careers/stats`

**Response:**
```json
{
  "success": true,
  "stats": {
    "active_jobs": 12,
    "inactive_jobs": 3,
    "total_applications": 456,
    "new_applications": 23,
    "reviewing_applications": 15,
    "shortlisted_applications": 8,
    "applications_last_week": 67,
    "total_views": 12345
  },
  "topJobs": [
    {
      "id": "uuid",
      "slug": "senior-backend-engineer",
      "multilingual_title": {"ar": "مهندس خلفي أول", "en": "Senior Backend Engineer"},
      "view_count": 1234,
      "application_count": 45
    }
  ],
  "recentApplications": [
    {
      "id": "app_uuid",
      "full_name": "Ahmed Hassan",
      "email": "ahmed@example.com",
      "status": "new",
      "created_at": "2025-12-07T10:00:00Z",
      "job_title": {"ar": "مهندس خلفي", "en": "Backend Engineer"}
    }
  ]
}
```

### Key Features

#### Audit Logging
All career admin actions are logged in `admin_audit_logs`:
- Job creation/update/deletion
- Application status changes
- Includes reason headers for compliance
- Full before/after snapshots for updates

#### Security
- HMAC signature validation required
- Admin role verification
- Correlation ID tracking
- IP address logging

#### Data Integrity
- Soft delete for jobs (preserves history)
- Application status workflow
- Reviewer tracking with timestamps
- Arabic content validation (required)

#### HTML Sanitization
Job descriptions, requirements, and benefits are sanitized:
- Allowed tags: `p`, `ul`, `ol`, `li`, `a`, `b`, `strong`, `i`, `em`, `h1-h4`, `br`
- URL validation for links
- XSS prevention

### Integration Notes

1. **Slug Generation**: Automatic unique slug creation from Arabic title
2. **Search**: Uses PostgreSQL trigram search on generated text column
3. **File Access**: Resume URLs are signed R2 URLs with expiration
4. **Multilingual**: All text fields support ar/en with Arabic required
5. **Timestamps**: Automatic `created_at` and `updated_at` tracking

## 🔍 Build Logs Management (September 2025)

### Overview
Admin-only access to per-build Claude agent logs for debugging and troubleshooting. Provides streaming log access, build metadata, and comprehensive build listing with security redaction and audit trails.

### Build Logs Endpoints

#### 1. Stream Build Logs
`GET /v1/admin/builds/{buildId}/logs`

Stream Claude agent logs with optional range support for tailing functionality.

**Path Parameters:**
- `buildId`: String (ULID format) - Build identifier

**Query Parameters:**
- `bytes`: String (optional) - Range for partial content (e.g., "-1024" for last 1KB)

**Headers:**
- `Authorization`: Bearer {admin_jwt} - Admin JWT token
- `Range`: bytes=0-1023 | bytes=-1024 (optional) - HTTP Range header alternative

**Required Permissions:** `read_logs`

**Response:**
- **Content-Type:** `application/x-ndjson; charset=utf-8`
- **Status:** `200` (full file) or `206` (partial content)
- **Headers:** 
  - `Accept-Ranges: bytes`
  - `Content-Range: bytes {start}-{end}/{total}` (if partial)

**NDJSON Format:**
```json
{"kind":"meta","buildId":"01HZ8X9J...","userId":"123","projectId":"456","startedAt":"2025-09-13T02:48:00.000Z","version":"1.0.0"}
{"kind":"line","ts":1726196880123,"seq":1,"src":"stdout","buildId":"01HZ8X9J...","msg":"[Claude] Starting build..."}
{"kind":"line","ts":1726196880124,"seq":2,"src":"stderr","buildId":"01HZ8X9J...","msg":"[Claude] Debug info"}
{"kind":"meta","buildId":"01HZ8X9J...","endedAt":"2025-09-13T02:49:00.000Z"}
```

**Example Requests:**
```bash
# Full log
GET /v1/admin/builds/01HZ8X9J2K3L4M5N6P7Q8R9S0T/logs

# Last 5KB (tail)
GET /v1/admin/builds/01HZ8X9J2K3L4M5N6P7Q8R9S0T/logs?bytes=-5120

# Range request
GET /v1/admin/builds/01HZ8X9J2K3L4M5N6P7Q8R9S0T/logs
Range: bytes=-1024
```

#### 2. Get Build Metadata
`GET /v1/admin/builds/{buildId}/info`

Retrieve comprehensive build information including log status and metrics.

**Path Parameters:**
- `buildId`: String (ULID format) - Build identifier

**Headers:**
- `Authorization`: Bearer {admin_jwt} - Admin JWT token

**Required Permissions:** `read_logs`

**Response:**
```json
{
  "buildId": "01HZ8X9J2K3L4M5N6P7Q8R9S0T",
  "projectId": "01HZ8X9J2K3L4M5N6P7Q8R9S0U",
  "userId": "12345678-1234-1234-1234-123456789012",
  "userEmail": "user@example.com",
  "status": "completed",
  "createdAt": "2025-09-13T02:45:00.000Z",
  "updatedAt": "2025-09-13T02:50:00.000Z",
  "buildDurationMs": 300000,
  "totalLinesProcessed": 1247,
  "claudeRequests": 23,
  "memoryPeakMb": 512,
  "errorMessage": null,
  "logExists": true,
  "logSizeBytes": 45320,
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 3. List Recent Builds
`GET /v1/admin/builds`

List recent builds with filtering options and log availability status.

**Query Parameters:**
- `limit`: Number (default: 50, max: 100) - Number of builds to return
- `offset`: Number (default: 0) - Pagination offset
- `status`: String (optional) - Filter by build status (building, completed, failed)
- `userId`: String (optional) - Filter by user UUID
- `projectId`: String (optional) - Filter by project UUID

**Headers:**
- `Authorization`: Bearer {admin_jwt} - Admin JWT token

**Required Permissions:** `read_logs`

**Response:**
```json
{
  "builds": [
    {
      "build_id": "01HZ8X9J2K3L4M5N6P7Q8R9S0T",
      "project_id": "01HZ8X9J2K3L4M5N6P7Q8R9S0U",
      "user_id": "12345678-1234-1234-1234-123456789012",
      "user_email": "user@example.com",
      "status": "completed",
      "created_at": "2025-09-13T02:45:00.000Z",
      "updated_at": "2025-09-13T02:50:00.000Z",
      "build_duration_ms": 300000,
      "error_message": null,
      "logExists": true
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  },
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Example Queries:**
```bash
# Recent failed builds
GET /v1/admin/builds?status=failed&limit=20

# Builds for specific user
GET /v1/admin/builds?userId=12345678-1234-1234-1234-123456789012

# Builds with pagination
GET /v1/admin/builds?limit=25&offset=50
```

### Security Features

#### Content Redaction
All log content is automatically redacted for security:
- **Bearer tokens**: `Bearer [REDACTED]`
- **API keys**: `sk-[REDACTED]`, `api_key=[REDACTED]`
- **AWS credentials**: `AWS_SECRET_ACCESS_KEY=[REDACTED]`
- **PEM blocks**: Multi-line private key redaction
- **Authorization headers**: `authorization: [REDACTED]`
- **DoS protection**: Lines >256KB truncated with `[TRUNCATED]`

#### Access Control
- **Admin authentication**: Requires valid admin JWT with `read_logs` permission
- **Server-side validation**: Build ownership verified via `project_build_metrics` table
- **Audit logging**: All access logged with admin ID, correlation ID, and byte ranges
- **Path protection**: ULID validation prevents directory traversal attacks

#### Error Responses
```json
// 404 - Build not found or no access
{ "error": "Build log not found" }

// 403 - Insufficient permissions
{ "error": "Insufficient permissions" }

// 500 - Server error
{ "error": "Failed to retrieve build log" }
```

### Log Storage Architecture

**Directory Structure:**
```
./logs/builds/
├── 2025-09-13/
│   ├── 01HZ8X9J2K3L4M5N6P7Q8R9S0T.log
│   └── 01HZ8X9J2K3L4M5N6P7Q8R9S0U.log
└── 2025-09-14/
    └── ...
```

**File Format:**
- **Format**: JSONL (newline-delimited JSON)
- **Permissions**: 0640 (owner read/write, group read)
- **Size**: Typically 5-50KB per build
- **Encoding**: UTF-8 with invalid byte replacement

### Integration Notes

1. **Real-time Logs**: Active builds (`status: 'building'`) can be polled for new content
2. **Range Support**: Use `?bytes=-1024` for tail functionality or `Range` headers
3. **Streaming**: Process NDJSON line-by-line to avoid memory issues
4. **Pagination**: Implement UI pagination for build lists (recommended: 25 per page)
5. **Error Handling**: 404 responses for expired/deleted logs or access denied

## 🆘 Support & Questions

For backend integration questions:
- Check the API endpoint implementations in `/src/routes/admin.ts`
- Review middleware in `/src/middleware/adminAuthentication.ts`
- Test endpoints using the provided Postman collection (when available)

The backend is fully implemented and tested. Frontend integration can begin immediately.
