# Advisor Dashboard Implementation Plan

**Author**: Claude Code Assistant  
**Created**: August 28, 2025  
**Status**: Expert-Reviewed & Enhanced  
**Dependencies**: Multilingual Advisor Profiles (Migration 048), Free Consultations (Migration 050)

---

## Executive Summary

Design and implement a comprehensive advisor dashboard for approved advisors to manage their consultation business, track earnings, configure availability, and optimize their profile for maximum bookings.

**Current State**: Advisors have basic profile management and earnings APIs but lack a unified dashboard experience.

**Goal**: Create a full-featured advisor business management dashboard following 2025 industry best practices.

---

## 1. Current State Analysis

### ✅ **Existing APIs (Available)**
- `GET /api/v1/advisors/profile` - Get own profile data
- `PUT /api/v1/advisors/profile` - Update profile information  
- `PUT /api/v1/advisors/bio` - Update multilingual bio content
- `GET /api/v1/advisors/earnings` - Monthly earnings summary

### ❌ **Missing Dashboard Features**
- **Consultation Management**: No way to view past/upcoming consultations
- **Calendar Integration**: No availability management beyond simple toggle
- **Performance Analytics**: No metrics on consultation success, ratings, etc.
- **Client Communication**: No consultation history or client interaction logs
- **Free Consultation Config**: No UI to set up free consultation offerings
- **Review Management**: No interface to view and respond to client reviews
- **Booking Preferences**: No way to set time slots, blackout dates, etc.

---

## 2. Industry Best Practices (2025 Research)

### **Leading Platform Features**
Based on analysis of top consultation platforms (Upwork Business Plus, Catalant, Toptal, GrowthMentor):

1. **AI-Powered Insights**: Real-time analytics and performance recommendations
2. **Mindful Workflow**: Uma-style AI assistants for consultation optimization  
3. **Curated Excellence**: Focus on top 1% talent with premium positioning
4. **Smart Matching**: ML-based client-advisor matching algorithms
5. **Comprehensive Reporting**: ROI demonstration and impact metrics
6. **Streamlined Communication**: Integrated messaging and consultation prep tools

### **Essential Dashboard Components**
1. **Performance Overview**: Earnings, ratings, consultation count at-a-glance
2. **Consultation Pipeline**: Upcoming bookings, consultation history, client notes
3. **Calendar Management**: Availability settings, blackout dates, time zone handling
4. **Analytics Deep-Dive**: Conversion rates, specialization performance, growth trends
5. **Profile Optimization**: Multilingual bio management, specialty configuration
6. **Communication Hub**: Client messages, review responses, consultation prep

---

## 3. Technical Architecture

### **Database Schema Extensions**

#### **3.1 Advisor Availability Management**
```sql
-- Enhanced availability control beyond simple boolean
CREATE TABLE advisor_availability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  
  -- Weekly schedule (JSON format for flexibility)
  weekly_schedule JSONB NOT NULL DEFAULT '{}', 
  -- Format: {"monday": [{"start": "09:00", "end": "17:00"}], "tuesday": [...]}
  
  -- Blackout dates and special availability
  blackout_dates JSONB DEFAULT '[]', -- Array of date strings
  special_availability JSONB DEFAULT '[]', -- Override dates with custom hours
  
  -- Booking preferences  
  min_notice_hours INTEGER DEFAULT 24, -- Minimum booking notice
  max_advance_days INTEGER DEFAULT 30, -- Maximum days in advance
  buffer_minutes INTEGER DEFAULT 15,   -- Buffer between consultations
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX uq_availability_advisor ON advisor_availability_settings(advisor_id);

-- RLS Policies (following existing advisor patterns)
ALTER TABLE advisor_availability_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY avail_select ON advisor_availability_settings
  FOR SELECT USING (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));

CREATE POLICY avail_upsert ON advisor_availability_settings
  FOR INSERT WITH CHECK (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));

CREATE POLICY avail_update ON advisor_availability_settings
  FOR UPDATE USING (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()))
               WITH CHECK (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));
```

#### **3.2 Consultation History Enhancement**
```sql
-- Add advisor-specific consultation metadata to existing advisor_consultations table
ALTER TABLE advisor_consultations 
ADD COLUMN advisor_notes TEXT,           -- Private notes for advisor
ADD COLUMN preparation_materials JSONB, -- Links, docs shared with client
ADD COLUMN consultation_outcome JSONB;  -- Advisor's success metrics

-- Add size constraints for JSONB fields
ALTER TABLE advisor_consultations
  ADD CONSTRAINT chk_prep_size CHECK (preparation_materials IS NULL OR pg_column_size(preparation_materials) <= 16384),
  ADD CONSTRAINT chk_outcome_size CHECK (consultation_outcome IS NULL OR pg_column_size(consultation_outcome) <= 16384);

-- Essential performance indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_advisor_consult_scheduled_upcoming
  ON advisor_consultations (advisor_id, start_time)
  WHERE status IN ('scheduled','in_progress');

CREATE INDEX IF NOT EXISTS idx_advisor_consult_completed
  ON advisor_consultations (advisor_id, start_time DESC)
  WHERE status = 'completed';
```

#### **3.3 Analytics Tracking**
```sql
-- Advisor performance metrics aggregation
CREATE TABLE advisor_analytics_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Core metrics
  total_consultations INTEGER DEFAULT 0,
  free_consultations INTEGER DEFAULT 0,
  paid_consultations INTEGER DEFAULT 0,
  
  -- Performance metrics
  average_rating DECIMAL(3,2),
  total_earnings_cents INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2), -- Free to paid conversion
  
  -- Specialization breakdown
  specialization_performance JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(advisor_id, period_start, period_end)
);

-- RLS policies for analytics summary
ALTER TABLE advisor_analytics_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_select ON advisor_analytics_summary
  FOR SELECT USING (advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid()));

CREATE POLICY analytics_admin ON advisor_analytics_summary
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data ->> 'role' = 'admin'));

-- Standard triggers and worker grants
CREATE TRIGGER trg_availability_updated
  BEFORE UPDATE ON advisor_availability_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_analytics_updated
  BEFORE UPDATE ON advisor_analytics_summary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Worker database role grants
GRANT SELECT, INSERT, UPDATE ON advisor_availability_settings TO worker_db_role;
GRANT SELECT, INSERT, UPDATE ON advisor_analytics_summary TO worker_db_role;
```

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

---

## 5. Implementation Phases

### **Phase 1: Core Dashboard APIs (Week 1)**
- Dashboard overview endpoint
- Consultation history and management
- Basic availability toggle enhancement

### **Phase 2: Analytics & Performance (Week 2)**  
- Performance metrics aggregation
- Analytics API with trends
- Review management interface

### **Phase 3: Advanced Features (Week 3)**
- Calendar availability management
- Free consultation configuration
- Client communication enhancements

### **Phase 4: Intelligence & Optimization (Week 4)**
- AI-powered insights and recommendations
- Specialization performance analysis
- Profile optimization suggestions

---

## 6. Database Migrations Required

1. **Migration 056**: Advisor availability settings table with RLS
2. **Migration 057**: Consultation metadata enhancements (advisor_notes, etc.)
3. **Migration 058**: Analytics summary tables with precomputed metrics
4. **Migration 059**: Performance optimization indexes and triggers

**Key Improvements from Expert Review**:
- ✅ FK consistency: Use `advisor_id` references to `advisors(id)` 
- ✅ Cal.com as source of truth: Availability table stores preferences only
- ✅ Precomputed analytics: Monthly summaries prevent expensive live queries
- ✅ RLS patterns: Follow existing advisor table security model
- ✅ API path alignment: Use `/api/v1/advisors/me/*` pattern
- ✅ Cursor pagination: Stable sorting prevents duplicate/skip issues
- ✅ Essential validation: IANA timezones, date formats, duration whitelist
- ✅ Performance indexes: Target actual dashboard query patterns
- ✅ Standard triggers: Updated_at and worker database grants

---

## 7. Security & Privacy Considerations

### **Privacy Protection**
- Client data exposure limited to first names only
- Advisor notes remain private via RLS (no encryption for MVP)
- Earnings data only accessible to advisor owner

### **Authentication**
- All dashboard APIs require HMAC + Claims authentication
- Advisor-specific access control (can only access own dashboard)
- Admin override capabilities for support scenarios

### **Rate Limiting**
- Dashboard APIs: 100 requests/minute per advisor
- Analytics APIs: 20 requests/minute (more expensive queries)
- Profile updates: 10 requests/minute

---

## 8. Frontend Integration Points

### **Dashboard Structure**
```
/advisor/dashboard
├── /overview        # Main dashboard with key metrics
├── /consultations   # Booking calendar and consultation history
├── /analytics       # Performance metrics and trends
├── /profile         # Bio management and multilingual settings
├── /availability    # Calendar and booking preferences
├── /earnings        # Financial overview and payout history
├── /reviews         # Client feedback and ratings
└── /settings        # Free consultation config and preferences
```

### **Key UI Components**
- Earnings chart with monthly breakdown
- Upcoming consultations calendar widget  
- Rating and review summary cards
- Free vs paid consultation toggle controls
- Multilingual bio editor with language tabs
- Availability calendar with drag-to-block functionality

---

## 9. Success Metrics

### **Advisor Engagement**
- Daily active advisors using dashboard
- Profile completion rates (bio, availability, settings)
- Time spent optimizing profiles

### **Business Impact**
- Increase in consultation bookings through better availability management
- Conversion improvement from free to paid consultations
- Advisor satisfaction and retention rates

### **Technical Performance**
- Dashboard load time <500ms
- Real-time analytics updates
- Mobile-responsive design score >95

---

## 10. Implementation Priority Matrix

**High Priority (Must Have)**:
- Consultation history and upcoming bookings
- Basic availability management  
- Earnings overview with monthly breakdown
- Free consultation configuration

**Medium Priority (Should Have)**:
- Advanced calendar availability settings
- Performance analytics and trends
- Review management interface
- Profile optimization tools

**Low Priority (Nice to Have)**:
- AI-powered insights and recommendations
- Advanced specialization analytics
- Client communication enhancements
- Competitive benchmarking

---

## Implementation Progress

### ✅ **COMPLETED (August 29, 2025)**

#### **Phase 1: Core Infrastructure - COMPLETE**
- ✅ **Migration 056**: Advisor availability settings table with RLS policies
- ✅ **Migration 057**: Consultation metadata enhancements (advisor_notes, preparation_materials, consultation_outcome)
- ✅ **Migration 058**: Analytics summary tables with precomputed metrics
- ✅ **Migration 059**: Dashboard-specific performance indexes
- ✅ **API Endpoint**: `GET /api/v1/advisors/me/overview` - Dashboard overview with key metrics
- ✅ **API Endpoint**: `GET /api/v1/advisors/me/consultations` - Consultation history with cursor pagination

#### **Phase 2: Analytics & Performance - COMPLETE**
- ✅ **API Endpoint**: `GET /api/v1/advisors/me/analytics?period=30d|90d|1y` - Performance metrics and trends
- ✅ **API Endpoint**: `GET /api/v1/advisors/me/availability` - Calendar preferences retrieval
- ✅ **API Endpoint**: `PUT /api/v1/advisors/me/availability` - Calendar and booking preferences update

#### **Phase 3: Advanced Features - COMPLETE**
- ✅ **API Endpoint**: `GET /api/v1/advisors/me/pricing-settings` - Free consultation configuration
- ✅ **API Endpoint**: `PUT /api/v1/advisors/me/pricing-settings` - Update pricing model and free durations

### 📡 **Implemented API Endpoints**

#### **Dashboard Core**
```typescript
GET  /api/v1/advisors/me/overview              // Dashboard overview with metrics
GET  /api/v1/advisors/me/consultations         // ?status=upcoming|completed|all&limit=10&cursor=...
GET  /api/v1/advisors/me/analytics             // ?period=30d|90d|1y
```

#### **Settings Management**
```typescript
GET  /api/v1/advisors/me/availability          // Calendar preferences
PUT  /api/v1/advisors/me/availability          // Update calendar and booking preferences
GET  /api/v1/advisors/me/pricing-settings      // Free consultation configuration
PUT  /api/v1/advisors/me/pricing-settings      // Update pricing model
```

#### **Authentication & Headers**
- **Required**: `x-sheen-claims` header with HMAC signature
- **Optional**: `x-sheen-locale` header for multilingual display names
- **Security**: All endpoints follow existing RLS patterns

### 🔍 **Key Implementation Discoveries**

#### **Database Design Learnings**
- **Availability Storage Strategy**: Used JSONB for weekly_schedule flexibility while maintaining type safety through constraints
- **Analytics Performance**: Implemented both real-time queries and prepared analytics summary tables for different use cases
- **Index Optimization**: Created composite indexes specifically targeting dashboard query patterns (advisor_id + time-based sorting)
- **RLS Consistency**: All new tables follow the established `advisor_id IN (SELECT id FROM advisors WHERE user_id = auth.uid())` pattern

#### **API Architecture Insights**
- **Cursor Pagination**: Implemented stable pagination using `(start_time, id)` composite sorting to prevent duplicates
- **Privacy Protection**: Client names automatically truncated to first name only in advisor-facing endpoints
- **Localization Ready**: All endpoints support `x-sheen-locale` header for multilingual display names
- **Error Consistency**: Maintained existing correlation ID and error response patterns from advisor network APIs

#### **Performance Optimizations Applied**
- **Query Efficiency**: Separated complex analytics into multiple targeted queries rather than one large join
- **Index Strategy**: Created partial indexes with WHERE clauses for status-specific queries (upcoming vs completed consultations)
- **Data Structures**: Used number keys (15, 30, 60) instead of strings for duration mappings to optimize parsing
- **Memory Management**: Applied size constraints to JSONB fields (16KB limit) to prevent abuse

## Next Steps

1. **Frontend Integration**: All dashboard APIs are ready for frontend implementation
2. **Testing Strategy**: Comprehensive testing with real advisor workflows using existing test data
3. **Database Migration Deployment**: Deploy migrations 056-059 in sequence
4. **Analytics Population**: Run initial analytics aggregation for existing consultation data
5. **Documentation**: Update API reference documentation with new dashboard endpoints

**Current Status**: ✅ **BACKEND IMPLEMENTATION COMPLETE**
**Estimated Timeline**: **AHEAD OF SCHEDULE** - All core functionality implemented in 1 day
**Ready for**: Frontend integration and testing phase
**Dependencies**: ✅ All dependencies satisfied (multilingual profiles and free consultation migrations deployed)