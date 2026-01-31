# Advisor Network - Next.js Integration Guide

**Date**: 2025-08-25  
**Status**: Backend Complete, Ready for Frontend Integration  
**Backend Endpoints**: 13 REST APIs implemented and tested

---

## 🎯 **Quick Overview**

The Advisor Network allows **approved advisors** to offer **paid consultations** to clients at **platform-fixed rates** ($9/15min, $19/30min, $35/60min). Advisors earn **70%**, platform keeps **30%**.

**Flow**: Apply → Admin Approves → Client Books → Cal.com Meeting → Review → Monthly Payout

---

## 🚀 **API Endpoints**

### **Public APIs (No Auth)**
```typescript
GET  /api/v1/consultations/pricing         // Platform pricing: $9/$19/$35
GET  /api/v1/advisors/search               // Find advisors (filter by specialty/language)
GET  /api/v1/advisors/{id}                 // Get advisor profile
```

### **Authenticated APIs (HMAC Required)**
```typescript
// Advisor Management
POST /api/v1/advisors/apply                // Submit application
GET  /api/v1/advisors/profile              // Get own profile
PUT  /api/v1/advisors/profile              // Update profile  
PUT  /api/v1/advisors/booking-status       // Toggle availability
GET  /api/v1/advisors/earnings             // Monthly earnings

// Consultation Management  
POST /api/v1/consultations/book            // Book + pay for consultation
GET  /api/v1/consultations/{id}            // Get consultation details
PUT  /api/v1/consultations/{id}/cancel     // Cancel (refund if >24h)
POST /api/v1/consultations/{id}/review     // Submit rating/review

// Admin Only
GET  /api/v1/admin/advisor-applications    // List pending applications
PUT  /api/v1/admin/advisors/{id}/approve   // Approve/reject advisor
```

---

## 🔐 **Authentication**

**All authenticated endpoints require HMAC signature validation** (same as existing endpoints):

```typescript
headers: {
  'x-sheen-claims': base64EncodedUserClaims,
  'x-sheen-signature': hmacSignature,
  'x-correlation-id': uuid(), // Optional but recommended
  'x-sheen-locale': 'en-us'   // Optional for i18n
}
```

---

## 💰 **Payment Integration**

### **Platform-Fixed Pricing** (Non-negotiable)
- **15 minutes**: $9.00 → Advisor gets $6.30, Platform gets $2.70
- **30 minutes**: $19.00 → Advisor gets $13.30, Platform gets $5.70  
- **60 minutes**: $35.00 → Advisor gets $24.50, Platform gets $10.50

### **Booking Flow**
```typescript
// 1. Book consultation
POST /api/v1/consultations/book
{
  "advisor_id": "uuid",
  "duration_minutes": 30,        // 15, 30, or 60 only
  "project_id": "uuid",          // Optional
  "cal_booking_id": "from-cal",  // From Cal.com widget
  "locale": "en-us",
  "client_timezone": "America/New_York"
}

// Response includes Stripe payment_intent_id and client_secret
// Use existing Stripe Elements integration
```

### **Refund Policy** (Automatically Enforced)
- **Cancel >24 hours before**: Full refund to client, advisor loses earnings
- **Cancel ≤24 hours before**: No refund, advisor keeps earnings  
- **No-show**: No refund, advisor keeps earnings

---

## 🔒 **Privacy & Security**

### **Data Access Rules**
- **Clients**: See full advisor profiles + own consultations
- **Advisors**: See limited client info (first name only, NO email/phone)
- **Admin**: See all data for management purposes

### **Privacy-Safe Advisor View**
```typescript
// What advisors see about clients:
{
  "client": {
    "first_name": "John"  // ONLY first name, no PII
  }
}
```

---

## 📊 **Key Data Models**

### **Advisor Profile**
```typescript
interface Advisor {
  id: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  skills: string[];                    // ['React', 'Node.js']
  specialties: string[];               // ['frontend', 'fullstack', 'ecommerce'] 
  languages: string[];                 // ['English', 'Arabic']
  rating: number;                      // 0-5, calculated from reviews
  review_count: number;
  approval_status: 'pending' | 'approved' | 'rejected';
  is_accepting_bookings: boolean;
  country_code: string;                // For Stripe Connect (required)
  cal_com_event_type_url?: string;
}
```

### **Consultation**
```typescript
interface Consultation {
  id: string;
  duration_minutes: 15 | 30 | 60;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  scheduled_at: string;                // ISO timestamp
  video_url?: string;                  // From Cal.com
  price_cents: number;                 // 900, 1900, or 3500
  // Client sees: advisor info
  // Advisor sees: client_first_name only
}
```

---

## 🎨 **UI Components Needed**

### **For Clients**
1. **Advisor Discovery** - Search/filter advisors by specialty, rating, language
2. **Advisor Profile** - Display skills, reviews, availability, book button
3. **Booking Widget** - Duration selection + Cal.com integration + Stripe payment
4. **Consultation History** - List past/upcoming consultations
5. **Review Form** - 5-star rating + text review after completed consultations

### **For Advisors** 
1. **Application Form** - Bio, skills, specialties, Cal.com URL, country
2. **Advisor Dashboard** - Upcoming consultations, earnings, booking toggle
3. **Consultation List** - Shows client first name only (privacy-safe)
4. **Earnings Report** - Monthly breakdown with payout status

### **For Admins**
1. **Application Review** - Approve/reject pending advisor applications  
2. **Advisor Management** - List all advisors, suspend/reactivate
3. **Consultation Overview** - Handle disputes, mark no-shows, process refunds

---

## 🔄 **Cal.com Integration**

### **Setup Required**
1. **Cal.com Account**: Each advisor needs their own Cal.com event type
2. **Webhook Configuration**: Point to `/api/v1/webhooks/calcom`
3. **Metadata Passing**: Consultation booking must include `consultation_id` in Cal.com metadata

### **Event Flow**
1. Client books consultation → Creates pending consultation record
2. Cal.com widget handles scheduling → Sends booking metadata  
3. Webhook confirms booking → Payment captured automatically
4. Video call URL provided from Cal.com

---

## ⚠️ **Important Notes**

1. **Pricing is NOT negotiable** - Always use platform rates ($9/$19/$35)
2. **Privacy is critical** - Advisors never see client email/phone
3. **Refund timing matters** - >24h = full refund, ≤24h = no refund  
4. **Admin approval required** - Only approved advisors can accept bookings
5. **Monthly payouts** - Advisors get paid monthly via Stripe Connect

---

## 🚀 **Ready to Build**

The backend is **production-ready** with comprehensive error handling, logging, and security. All endpoints follow existing HMAC patterns and return consistent JSON responses.

**Next Steps**: Frontend implementation following this integration guide.