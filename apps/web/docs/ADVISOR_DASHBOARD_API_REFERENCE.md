# Advisor Dashboard API Reference

**Version**: 1.0  
**Created**: August 29, 2025  
**Status**: Production Ready  
**Base URL**: `/api/v1/advisors/me`

---

## Authentication & Headers

### Required Headers
```http
x-sheen-claims: <base64-encoded-jwt-claims>
x-sheen-signature: <hmac-sha256-signature>
```

### Optional Headers
```http
x-sheen-locale: en|ar|fr|es|de    # For multilingual advisor names and language localization
x-correlation-id: <uuid>          # Request tracking
```

### Language Localization
The `x-sheen-locale` header affects both advisor names and available language display:
```http
# English UI: returns "English", "Arabic", "French"
x-sheen-locale: en

# Arabic UI: returns "الإنجليزية", "العربية", "الفرنسية"  
x-sheen-locale: ar

# French UI: returns "Anglais", "Arabe", "Français"
x-sheen-locale: fr
```

---

## 0. Advisor Profile

### `GET /api/v1/advisors/profile`

**Purpose**: Get own complete advisor profile (raw database record)

**Response**:
```json
{
  "success": true,
  "profile": {
    "id": "f1d7257e-b12c-43ae-a71f-3417388ef967",
    "user_id": "dd2520e2-564c-42f6-aa54-197f24026bd2",
    "display_name": "Omar Khalil",
    "bio": "Expert in cloud architecture and DevOps",
    "avatar_url": "https://example.com/avatar.jpg",
    "skills": ["AWS", "Docker", "Kubernetes"],
    "specialties": ["cloud_migration", "devops"],
    "languages": ["en", "ar"],
    "rating": 4.7,
    "review_count": 23,
    "approval_status": "approved",
    "stripe_connect_account_id": "acct_...",
    "cal_com_event_type_url": "https://cal.com/omar/consultation",
    "is_accepting_bookings": true,
    "country_code": "US",
    "approved_at": "2025-08-15T10:30:00Z",
    "created_at": "2025-08-01T09:15:00Z",
    "updated_at": "2025-08-29T14:22:00Z",
    "onboarding_steps": {
      "profile_completed": true,
      "calendar_connected": true,
      "stripe_connected": true
    }
  }
}
```

**Use Cases**:
- Profile management forms (pre-populate fields)
- Onboarding progress tracking
- Account settings page
- Admin profile verification

**Note**: This endpoint returns the raw database record. For dashboard metrics and analytics, use `/api/v1/advisors/me/overview` instead.

---

## 1. Dashboard Overview

### `GET /api/v1/advisors/me/overview`

**Purpose**: Main dashboard with key metrics and quick stats

**Response**:
```json
{
  "success": true,
  "data": {
    "profile": {
      "name": "Omar Khalil",                    // Localized based on x-sheen-locale
      "approval_status": "approved", 
      "is_accepting_bookings": true,
      "available_languages": [                  // Localized language names
        {"code": "ar", "name": "العربية"},
        {"code": "en", "name": "الإنجليزية"},  
        {"code": "fr", "name": "الفرنسية"}
      ],
      "average_rating": 4.7
    },
    "current_month": {
      "total_consultations": 12,
      "free_consultations": 4,
      "earnings_cents": 8500,                   // $85.00
      "upcoming_consultations": 3
    },
    "quick_stats": {
      "total_lifetime_consultations": 45,
      "lifetime_earnings_cents": 28750,         // $287.50
      "profile_views_this_month": 0             // Placeholder - future feature
    }
  }
}
```

**Error Responses**:
- `404`: Advisor profile not found or not approved

---

## 2. Consultation Management

### `GET /api/v1/advisors/me/consultations`

**Purpose**: Consultation history and upcoming bookings with pagination

**Query Parameters**:
```typescript
status?: 'upcoming' | 'completed' | 'all'     // Default: 'all'
limit?: number                                 // Default: 10, Max: 50
cursor?: string                                // Base64 cursor for pagination
```

**Response**:
```json
{
  "success": true,
  "data": {
    "consultations": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "client_name": "Sarah",                 // First name only for privacy
        "duration_minutes": 30,
        "start_time": "2025-08-30T14:00:00Z",
        "is_free_consultation": false,
        "status": "scheduled",
        "cal_booking_url": "https://cal.com/omar/consultation",
        "advisor_notes": "Client needs AWS migration help"
      }
    ],
    "pagination": {
      "has_more": true,
      "next_cursor": "eyJzY2hlZHVsZWRBdCI6IjIwMjUtMDgtMzBUMTQ6MDA6MDBaIiwiaWQiOiJhYmMxMjMifQ==",
      "total": 45                               // Only provided for filtered views
    }
  }
}
```

**Status Filtering**:
- `upcoming`: Only scheduled/in-progress consultations with future start times
- `completed`: Only completed consultations
- `all`: All consultations regardless of status

---

## 3. Analytics & Performance

### `GET /api/v1/advisors/me/analytics`

**Purpose**: Performance metrics, trends, and insights

**Query Parameters**:
```typescript
period?: '30d' | '90d' | '1y'                  // Default: '30d'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2025-07-30",
      "end": "2025-08-29"
    },
    "consultations": {
      "total": 16,
      "by_duration": { 
        "15": 5,                                // Number of 15-min consultations
        "30": 8,                                // Number of 30-min consultations  
        "60": 3                                 // Number of 60-min consultations
      },
      "by_type": { 
        "free": 6, 
        "paid": 10 
      },
      "conversion_rate": 60.0                   // % of free consultations that led to paid
    },
    "earnings": {
      "total_cents": 12500,                     // $125.00 total for period
      "by_month": [
        { "month": "2025-07", "earnings_cents": 7200 },
        { "month": "2025-08", "earnings_cents": 5300 }
      ]
    },
    "performance": {
      "reviews": { 
        "average": 4.7, 
        "count": 16 
      },
      "profile_views": 245                      // Placeholder - future feature
    },
    "trends": {
      "consultation_growth": "+23%",            // vs previous period
      "earnings_growth": "+15%"                 // vs previous period
    }
  }
}
```

**Growth Calculations**:
- Compares current period vs same-length previous period
- Returns percentage strings (e.g., "+23%", "0%", "+∞%")

---

## 4. Calendar & Availability

### `GET /api/v1/advisors/me/availability`

**Purpose**: Retrieve calendar settings and booking preferences

**Response**:
```json
{
  "success": true,
  "data": {
    "timezone": "America/New_York",
    "weekly_schedule": {
      "monday": [{"start": "09:00", "end": "17:00"}],
      "tuesday": [
        {"start": "09:00", "end": "12:00"}, 
        {"start": "14:00", "end": "18:00"}
      ],
      "wednesday": [],                          // No availability this day
      "friday": [{"start": "10:00", "end": "16:00"}]
    },
    "blackout_dates": ["2025-09-15", "2025-12-25"],
    "booking_preferences": {
      "min_notice_hours": 24,
      "max_advance_days": 30,
      "buffer_minutes": 15
    },
    "cal_com_sync": {
      "last_synced_at": "2025-08-29T10:30:00Z",
      "last_sync_status": "success"
    }
  }
}
```

### `PUT /api/v1/advisors/me/availability`

**Purpose**: Update calendar settings and booking preferences

**Request Body**:
```json
{
  "timezone": "America/New_York",              // Required: IANA timezone
  "weekly_schedule": {
    "monday": [{"start": "09:00", "end": "17:00"}]
  },
  "blackout_dates": ["2025-09-15"],            // Optional: YYYY-MM-DD format
  "booking_preferences": {
    "min_notice_hours": 24,                    // 1-168 hours
    "max_advance_days": 30,                    // 1-365 days  
    "buffer_minutes": 15                       // 0-120 minutes
  }
}
```

**Validation Rules**:
- **timezone**: Must match IANA format (e.g., `America/New_York`)
- **weekly_schedule**: Free-form JSONB for flexibility
- **blackout_dates**: Array of YYYY-MM-DD date strings
- **time_format**: 24-hour HH:MM format (e.g., "09:00", "17:30")

---

## 5. Pricing Settings

### `GET /api/v1/advisors/me/pricing-settings`

**Purpose**: Retrieve free consultation configuration

**Response**:
```json
{
  "success": true,
  "data": {
    "pricing_model": "hybrid",
    "free_consultation_durations": {
      "15": true,                               // Offers free 15-min consultations
      "30": false,                              // 30-min consultations are paid
      "60": false                               // 60-min consultations are paid
    }
  }
}
```

### `PUT /api/v1/advisors/me/pricing-settings`

**Purpose**: Update pricing model and free consultation settings

**Request Body**:
```json
{
  "pricing_model": "hybrid",                   // platform_fixed | free_only | hybrid
  "free_consultation_durations": {
    "15": true,
    "30": false,
    "60": false
  }
}
```

**Pricing Models**:
- `platform_fixed`: Standard platform pricing, no free consultations
- `free_only`: All consultations are free (no payment processing)
- `hybrid`: Mix of free and paid consultations based on duration settings

---

## Error Handling

### Standard Error Response
```json
{
  "success": false,
  "error": "Error description",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Common HTTP Status Codes
- `200`: Success
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (missing/invalid auth)
- `403`: Forbidden (not an approved advisor)
- `404`: Not Found (advisor profile not found)
- `500`: Internal Server Error

---

## Frontend Integration Guide

### 1. Dashboard Overview Page
```typescript
// Fetch dashboard data
const overview = await fetch('/api/v1/advisors/me/overview', {
  headers: {
    'x-sheen-claims': claimsToken,
    'x-sheen-signature': signature,
    'x-sheen-locale': currentLocale
  }
});

// Display key metrics
const data = await overview.json();
console.log(`Earnings this month: $${data.data.current_month.earnings_cents / 100}`);
```

### 2. Consultation History
```typescript
// Paginated consultation loading
async function loadConsultations(cursor?: string) {
  const url = new URLSearchParams({
    status: 'upcoming',
    limit: '10'
  });
  if (cursor) url.set('cursor', cursor);
  
  const response = await fetch(`/api/v1/advisors/me/consultations?${url}`);
  const data = await response.json();
  
  return {
    consultations: data.data.consultations,
    hasMore: data.data.pagination.has_more,
    nextCursor: data.data.pagination.next_cursor
  };
}
```

### 3. Analytics Dashboard
```typescript
// Load analytics for different periods
async function loadAnalytics(period: '30d' | '90d' | '1y') {
  const response = await fetch(`/api/v1/advisors/me/analytics?period=${period}`);
  const data = await response.json();
  
  return {
    consultations: data.data.consultations,
    earnings: data.data.earnings,
    trends: data.data.trends
  };
}
```

### 4. Calendar Management
```typescript
// Save availability settings
async function saveAvailability(settings: {
  timezone: string;
  weekly_schedule: any;
  booking_preferences: any;
}) {
  const response = await fetch('/api/v1/advisors/me/availability', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-claims': claimsToken,
      'x-sheen-signature': signature
    },
    body: JSON.stringify(settings)
  });
  
  return response.json();
}
```

---

## Database Dependencies

**Required Migrations** (deploy in order):
1. `056_advisor_availability_settings.sql`
2. `057_consultation_metadata_enhancements.sql` 
3. `058_analytics_summary_tables.sql`
4. `059_dashboard_performance_indexes.sql`

**Prerequisites**: Migrations 055 (multilingual display names) must be deployed first.

---

## Testing Endpoints

Use Omar Khalil's test advisor account for testing:
- All endpoints require valid advisor authentication
- Test with different `x-sheen-locale` values (en, ar, fr) 
- Verify cursor pagination works with multiple consultations
- Test availability settings with various timezone configurations

**Ready for immediate frontend integration!** 🚀