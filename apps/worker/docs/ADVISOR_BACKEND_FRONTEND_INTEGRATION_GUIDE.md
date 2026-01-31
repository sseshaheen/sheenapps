# Phase 2 Advisor Application System - Frontend Integration Guide

## Overview

The Phase 2 advisor application system provides a complete backend for multi-step application forms with auto-save drafts and admin review workflow. All endpoints require HMAC signature validation and return standardized JSON responses.

## 🚀 Available API Endpoints

### Base URL
All endpoints are available at: `${API_BASE_URL}/api/advisor/*`

### Authentication Required
All endpoints require:
- **Header**: `x-sheen-claims` - JWT authentication claims
- **Header**: `x-sheen-locale` (optional) - User locale (`en`, `ar`, `fr`, `es`, `de`)
- **Header**: `x-correlation-id` (optional) - Request tracking ID
- **HMAC Signature**: All requests must be properly signed

---

## 📝 Draft Management APIs

### 1. Get Draft Application
```typescript
GET /api/advisor/draft

Response: {
  success: boolean;
  data?: {
    id: string;
    user_id: string;
    status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'returned_for_changes';
    professional_data: ProfessionalData;
    created_at: string;
    updated_at: string;
  };
  error?: string;
  correlationId: string;
}
```

### 2. Create/Update Draft (Auto-Save)
```typescript
POST /api/advisor/draft
Content-Type: application/json

Body: {
  professionalData: {
    // Basic Information
    bio?: string;                    // Max 2000 chars
    skills?: string[];              // Max 20 items
    specialties?: string[];         // Max 10 items  
    languages?: string[];           // Max 10 items
    
    // Experience & Portfolio
    yearsExperience?: number;       // 0-50 range
    portfolioUrl?: string;          // Valid URL
    linkedinUrl?: string;           // Valid URL
    githubUrl?: string;             // Valid URL
    
    // Availability & Preferences
    timezone?: string;
    weeklyAvailabilityHours?: number;     // 1-168 range
    preferredSessionDuration?: number[];
    communicationStyle?: string;          // Max 500 chars
    preferredLanguages?: string[];
    
    // Completion Status
    isComplete?: boolean;
    completedSections?: string[];   // Track form progress
  }
}

Response: {
  success: boolean;
  data?: DraftData;
  message?: string;
  correlationId: string;
}
```

### 3. Submit Application
```typescript
POST /api/advisor/draft/submit

Response: {
  success: boolean;
  data?: DraftData;
  message?: string;
  error?: string;  // If validation fails
  correlationId: string;
}
```

---

## 👤 Profile Management APIs

### 4. Get Advisor Profile  
```typescript
GET /api/advisor/profile

Response: {
  success: boolean;
  data?: {
    id: string;
    display_name: string;
    bio?: string;
    avatar_url?: string;
    skills: string[];
    specialties: string[];
    languages: string[];
    rating: number;
    review_count: number;
    approval_status: 'pending' | 'approved' | 'rejected';
    is_accepting_bookings: boolean;
    onboarding_steps: {
      profile_completed: boolean;
      skills_added: boolean;
      availability_set: boolean;
      stripe_connected: boolean;
      cal_connected: boolean;
      admin_approved: boolean;
    };
    created_at: string;
    updated_at: string;
  };
  correlationId: string;
}
```

### 5. Update Advisor Profile
```typescript
PATCH /api/advisor/profile/:advisorId
Content-Type: application/json

Body: {
  display_name?: string;          // 1-100 chars
  bio?: string;                   // Max 2000 chars  
  avatar_url?: string;            // Valid URL
  skills?: string[];              // Max 20 items
  specialties?: string[];         // Max 10 items
  languages?: string[];           // Max 10 items
  cal_com_event_type_url?: string;
  is_accepting_bookings?: boolean;
  country_code?: string;          // 2 char country code
}

Response: {
  success: boolean;
  data?: UpdatedProfileData;
  message?: string;
  correlationId: string;
}
```

---

## 📋 Event Timeline API

### 6. Get Event Timeline
```typescript
GET /api/advisor/timeline?limit=50

Response: {
  success: boolean;
  data?: Array<{
    id: string;
    event_type: 'draft_created' | 'draft_updated' | 'profile_updated' | 
                'application_submitted' | 'review_started' | 'review_completed' |
                'status_changed' | 'admin_note_added';
    event_data: Record<string, any>;  // Event-specific data
    event_code?: string;              // For i18n localization
    created_at: string;
  }>;
  correlationId: string;
}
```

---

## 🔐 Admin APIs (Admin Role Required)

### 7. Get Applications for Review
```typescript
GET /api/admin/advisor/applications?status=submitted

Response: {
  success: boolean;
  data?: Array<DraftApplication>;
  correlationId: string;
}
```

### 8. Start Review Process  
```typescript
POST /api/admin/advisor/review/start
Content-Type: application/json

Body: {
  userId: string;  // UUID of user being reviewed
}
```

### 9. Complete Review Process
```typescript
POST /api/admin/advisor/review/complete  
Content-Type: application/json

Body: {
  userId: string;
  approved: boolean;
  notes?: string;  // Optional admin notes
}
```

---

## 🛠 Frontend Implementation Guide

### Auto-Save Implementation
```typescript
// Debounced auto-save every 30 seconds
const debouncedSave = useMemo(
  () => debounce(async (data: ProfessionalData) => {
    await fetch('/api/advisor/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-claims': authClaims,
        'x-correlation-id': generateCorrelationId()
      },
      body: JSON.stringify({ professionalData: data })
    });
  }, 30000),
  []
);
```

### Form Validation
```typescript
const VALIDATION_RULES = {
  bio: { maxLength: 2000, required: true },
  skills: { minItems: 3, maxItems: 20, required: true },
  specialties: { minItems: 1, maxItems: 10, required: true },
  yearsExperience: { min: 1, max: 50, required: true }
};
```

### Error Handling
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  correlationId: string;
}

// All endpoints return this standardized format
const handleApiResponse = <T>(response: ApiResponse<T>) => {
  if (!response.success) {
    // Show error message to user
    showNotification(response.error || 'An error occurred', 'error');
    return null;
  }
  return response.data;
};
```

### Status Management
```typescript
type ApplicationStatus = 
  | 'draft'              // Editable by user
  | 'submitted'          // Waiting for admin review  
  | 'under_review'       // Admin is reviewing
  | 'approved'           // Approved - becomes advisor
  | 'rejected'           // Rejected - can reapply
  | 'returned_for_changes'; // Needs user modifications

type ApprovalStatus = 'pending' | 'approved' | 'rejected';
```

---

## 🌐 Internationalization (i18n)

### Event Codes for Localization
The timeline events include `event_code` fields for machine-readable localization:

```typescript
const EVENT_TRANSLATIONS = {
  'advisor.draft.updated': {
    en: 'Application draft updated',
    ar: 'تم تحديث مسودة الطلب',
    fr: 'Brouillon de candidature mis à jour'
  },
  'advisor.application.submitted': {
    en: 'Application submitted for review', 
    ar: 'تم تقديم الطلب للمراجعة',
    fr: 'Candidature soumise pour examen'
  },
  'advisor.review.approved': {
    en: 'Application approved',
    ar: 'تم قبول الطلب', 
    fr: 'Candidature approuvée'
  }
};
```

---

## ⚡ Performance Considerations

### 1. **Auto-Save Optimization**
- Debounce saves to prevent excessive API calls
- Use optimistic updates for better UX
- Implement retry logic for failed saves

### 2. **Form State Management**
- Track `completedSections` for progress indicators
- Use `isComplete` flag to determine submission readiness
- Cache form data locally to prevent data loss

### 3. **Timeline Loading**
- Implement pagination with `limit` parameter
- Consider infinite scroll for long timelines
- Cache timeline data to reduce API calls

---

## 🔒 Security Notes

### Authentication
- All endpoints require valid JWT claims in `x-sheen-claims` header
- Admin endpoints check for `admin` or `staff` roles
- HMAC signature validation is mandatory

### Data Validation
- Client-side validation for UX, server validates all inputs
- File upload URLs are validated for proper format
- Array limits enforced (skills: 20, specialties: 10, etc.)

### Privacy
- Users can only access their own applications and profiles
- Admin endpoints have proper role-based access control
- Sensitive data is not exposed in error messages

---

## 📦 TypeScript Types

```typescript
interface ProfessionalData {
  bio: string;
  skills: string[];
  specialties: string[];
  languages: string[];
  yearsExperience: number;
  portfolioUrl?: string;
  linkedinUrl?: string; 
  githubUrl?: string;
  timezone: string;
  weeklyAvailabilityHours: number;
  preferredSessionDuration: number[];
  communicationStyle?: string;
  preferredLanguages?: string[];
  isComplete: boolean;
  completedSections: string[];
}

interface OnboardingSteps {
  profile_completed: boolean;
  skills_added: boolean;
  availability_set: boolean;
  stripe_connected: boolean;
  cal_connected: boolean;
  admin_approved: boolean;
}
```

---

## 🚀 Implementation Status

**Backend Status**: ✅ **PRODUCTION READY** 
- All endpoints implemented and tested
- TypeScript compilation passes
- Routes registered in server
- Expert-validated database patterns
- Security hardening complete

**Files Implemented**:
- **Database**: `migrations/046_advisor_phase_2_applications.sql`
- **Types**: `src/services/advisor/types.ts` 
- **Service**: `src/services/advisor/AdvisorService.ts`
- **Routes**: `src/routes/advisorApplications.ts`
- **Server**: Routes registered in `src/server.ts`

The backend is **production-ready** and follows all existing security and performance patterns. All endpoints are properly validated, logged, and secured.