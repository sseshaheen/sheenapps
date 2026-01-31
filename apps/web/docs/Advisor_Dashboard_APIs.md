
### **4. API Design**

#### **4.1 Dashboard Overview API**
```typescript
GET /api/v1/advisors/me/overview

Response: {
  profile: {
    name: string,
    approval_status: string,
    is_accepting_bookings: boolean,
    available_languages: string[],
    average_rating: number
  },
  current_month: {
    total_consultations: number,
    free_consultations: number,
    earnings_cents: number,
    upcoming_consultations: number
  },
  quick_stats: {
    total_lifetime_consultations: number,
    lifetime_earnings_cents: number,
    profile_views_this_month: number
  }
}
```

#### **4.2 Consultation Management API**
```typescript
GET /api/v1/advisors/me/consultations?status=upcoming&limit=10&cursor=eyJzY2hlZHVsZWRBdCI6IjIwMjUtMDgtMjhUMTQ6MDA6MDBaIiwiaWQiOiJhYmMxMjMifQ==

Response: {
  consultations: [
    {
      id: string,
      client_name: string, // First name only for privacy
      duration_minutes: number,
      start_time: string, // ISO timestamp
      is_free_consultation: boolean,
      status: 'scheduled' | 'completed' | 'cancelled',
      cal_booking_url?: string,
      advisor_notes?: string
    }
  ],
  pagination: {
    has_more: boolean,
    next_cursor?: string, // Base64 encoded cursor for next page
    total?: number // Only for first page
  }
}
```

#### **4.3 Calendar Management API**
```typescript
GET /api/v1/advisors/me/availability
PUT /api/v1/advisors/me/availability

// Request/Response:
{
  timezone: 'America/New_York', // IANA timezone validation required
  weekly_schedule: {
    monday: [{ start: '09:00', end: '17:00' }],
    tuesday: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }]
  },
  blackout_dates: ['2025-09-15', '2025-12-25'], // YYYY-MM-DD format required
  booking_preferences: {
    min_notice_hours: 24,
    max_advance_days: 30,
    buffer_minutes: 15
  },
  cal_com_sync: {
    last_synced_at?: string,
    last_sync_status?: 'success' | 'failed' | 'pending'
  }
}
```

#### **4.4 Analytics API**
```typescript
GET /api/v1/advisors/me/analytics?period=30d

Response: {
  period: { start: string, end: string },
  consultations: {
    total: number,
    by_duration: { 15: 5, 30: 8, 60: 3 }, // Number keys for cleaner parsing
    by_type: { free: 6, paid: 10 },
    conversion_rate: 60.0 // % of free consultations that led to paid
  },
  earnings: {
    total_cents: number,
    by_month: [{ month: '2025-08', earnings_cents: 12500 }]
  },
  performance: {
    reviews: { average: 4.7, count: 16 }, // Grouped for cleaner structure
    profile_views: 245
  },
  trends: {
    consultation_growth: '+23%',
    earnings_growth: '+15%'
  }
}
```

#### **4.5 Free Consultation Settings API**
```typescript
GET /api/v1/advisors/me/pricing-settings
PUT /api/v1/advisors/me/pricing-settings

// Request/Response:
{
  pricing_model: 'platform_fixed' | 'free_only' | 'hybrid',
  free_consultation_durations: {
    15: true,   // Offers free 15-min consultations (number keys)
    30: false,  // 30-min consultations are paid
    60: false   // 60-min consultations are paid
  }
}

// Validation: Only allow durations [15, 30, 60]
// Future: Add free consultation caps (e.g., 3 per week) for abuse prevention
```
