# SheenApps Advisor Network Implementation Plan
**Concept**: Create a vetted network of software engineers/web developers who help clients build better websites through AI-assisted guidance and consultation.

**Strategy**: Focus on UX/UI implementation first, then define backend APIs needed from Worker team.

**Updated**: August 25, 2025 - Incorporated expert feedback for faster MVP delivery

---

## 🎯 **Core Value Proposition**

**For Clients**: Get expert human guidance to accelerate AI-powered website building  
**For Advisors**: Earn revenue by helping clients maximize SheenApps AI builder effectiveness  
**For SheenApps**: Increase client success rate, retention, and project completion through expert guidance

---

## 🗺️ **User Journey Overview**

### **Advisor Journey**
1. **Apply** → Submit application with portfolio, skills, experience
2. **Get Vetted** → SheenApps review process (automated + manual)  
3. **Onboard** → Set up profile, availability, pricing, receive training materials
4. **Get Matched** → System offers suitable projects OR clients hire directly
5. **Collaborate** → Join client projects via chat integration, provide guidance
6. **Consult** → Book 15-60 minute consultation calls with clients
7. **Earn** → Revenue share on client usage + optional tips + referral bonuses

### **Client Journey**  
1. **Start Project** → Begin building website with AI
2. **Get Offered Help** → System suggests suitable advisors OR browse advisor profiles
3. **Hire Advisor** → Accept recommendation or choose advisor manually
4. **Collaborate in Chat** → Advisor joins AI builder chat to co-orchestrate builds
5. **Book Consultations** → Schedule focused advice sessions (15-60 mins)
6. **Complete Project** → Rate advisor, leave feedback, pay tips

---

## 🎨 **UI/UX Design & Components Plan**

### **Phase 1: Core UI Components (No Backend Dependencies)**

#### **1.1 Advisor Profile Components**
**Purpose**: Showcase advisor expertise and build trust

**Components to Build**:
- `AdvisorCard` - Compact advisor preview (for lists/grids)
- `AdvisorProfile` - Full profile view with bio, skills, portfolio
- `AdvisorAvatar` - Consistent advisor representation across app
- `AdvisorBadges` - Skills, certifications, ratings display
- `AdvisorPortfolio` - Showcase projects built on SheenApps
- `AdvisorRating` - Star ratings with review counts
- `AdvisorAvailability` - Calendar widget showing open slots

**Design Considerations**:
```tsx
// Example AdvisorCard structure
interface AdvisorCardProps {
  advisor: {
    id: string
    name: string
    avatar_url: string
    bio: string
    skills: string[]
    rating: number
    review_count: number
    hourly_rate: number
    available_now: boolean
    portfolio_projects: number
    specialties: ('frontend' | 'backend' | 'fullstack' | 'design' | 'mobile')[]
  }
  onHire?: () => void
  onViewProfile?: () => void
}
```

#### **1.2 Advisor Discovery & Matching**
**Purpose**: Help clients find suitable advisors

**Components to Build**:
- `AdvisorGrid` - Browse all available advisors
- `AdvisorSearch` - Search by skills, name, specialties
- `AdvisorFilters` - Filter by availability, pricing, rating, tech stack
- `AdvisorRecommendations` - "Suggested for your project" section
- `AdvisorComparison` - Side-by-side advisor comparison
- `QuickMatchDialog` - "Find me an advisor in 30 seconds"

**UX Features**:
- Smart matching based on project type (e.g., e-commerce → advisors with Shopify experience)
- Real-time availability indicators
- Portfolio relevance scoring
- Budget-based filtering

#### **1.3 Chat Integration Components**
**Purpose**: Seamlessly add advisors to existing AI builder chat

**Components to Build**:
- `AddAdvisorToChatButton` - One-click invite to project chat
- `AdvisorChatWelcome` - Welcome message when advisor joins
- `ChatParticipants` - Show Client + Advisor + AI with distinct avatars
- `MessageChip` - Show message author type (Client/Advisor/AI)
- `AdvisorGuidedPill` - "Advisor-guided" indicator on AI responses
- `CostPreviewBanner` - Show "Advised minutes: +30%" when advisor active
- `AdvisorTypingIndicator` - Show when advisor is typing
- `CoOrchestratedResponse` - UI for advisor-guided AI responses

**Expert-Recommended Chat UX**:
```tsx
// Enhanced chat interface with 3-avatar system
interface ChatMessage {
  // ... existing fields
  author_type: 'client' | 'advisor' | 'ai'
  advisor_guided?: boolean
  cost_impact?: {
    type: 'session' | 'advised_minutes'
    rate: number
  }
  co_orchestrated_by?: string // advisor_id
  advisor_context?: {
    suggestion: string
    reasoning: string
  }
}

// Key UX Components
<ChatParticipants>
  <Avatar type="client" name={client.name} />
  <Avatar type="advisor" name={advisor.name} />  
  <Avatar type="ai" name="AI Assistant" />
</ChatParticipants>

<MessageChip 
  author={message.author_type} 
  advisorGuided={message.advisor_guided} 
/>

{advisor.isActive && (
  <CostPreviewBanner>
    Advised minutes: +{advisor.upliftRate}% while advisor active
  </CostPreviewBanner>
)}
```

**Visual Hierarchy**:
- **Three distinct avatars** for clear message attribution
- **Advisor-guided pills** on AI responses created with advisor input
- **Cost transparency** when advisor becomes active in project
- **Clear typing indicators** showing who is currently responding

#### **1.4 Consultation Booking Components**
**Purpose**: Schedule and manage advisor consultation calls

**Components to Build** (Updated with Cal.com Integration):
- `CalComEmbed` - Cal.com booking widget for advisor availability
- `CalComIntegration` - Setup component for advisor Cal.com accounts  
- `ConsultationCard` - Display booked/upcoming consultations
- `BookingConfirmation` - Confirmation dialog with meeting details
- `ConsultationHistory` - Past consultations with recordings/notes
- `VideoCallLink` - Open video calls in new tab (defer custom embed)
- `ConsultationNotes` - Shared note-taking during calls

**Expert-Recommended Booking Flow**:
```tsx
// Cal.com integration for professional scheduling
interface CalComBooking {
  advisor_id: string
  cal_com_event_type_id: string
  duration_minutes: 15 | 30 | 45 | 60
  timezone: string
  video_platform: 'zoom' | 'meet' | 'daily'
  auto_confirmation: boolean
}

// Components
<CalComEmbed 
  eventTypeUrl={advisor.calComUrl}
  duration={selectedDuration}
  onBookingComplete={handleBookingConfirmed}
/>

<VideoCallLink 
  meetingUrl={consultation.video_url}
  openInNewTab={true} // MVP: defer custom video embed
/>
```

**UX Benefits with Cal.com**:
- **Professional experience**: Proper calendar invites, reminders, timezone handling
- **Automatic video links**: Zoom/Meet integration built-in
- **No custom calendar UI**: Faster development, proven UX patterns
- **ICS file generation**: Automatic calendar sync for both parties
- **Rescheduling/cancellation**: Built-in flows reduce support overhead

**Scope Simplification**:
- ❌ Custom calendar widget → ✅ Cal.com professional booking
- ❌ Custom video embed → ✅ New tab video calls (Phase 1)
- ❌ Complex timezone logic → ✅ Cal.com handles automatically

### **Phase 2: Advisor Portal (Expert-Clarified MVP Scope)**

#### **2.1 Advisor Portal Dashboard**
**Purpose**: Central hub for advisors to manage their consultation business

**MVP Components to Build**:
- `AdvisorDashboard` - Main portal with onboarding checklist and earnings overview
- `OnboardingChecklist` - Step-by-step setup guide for new advisors
- `EarningsOverview` - Consultation fees, tips, payout schedule
- `AvailabilityDisplay` - Show next available slots from Cal.com + pause toggle
- `BookingsQueue` - Upcoming and recent consultations
- `ProfileBasics` - Essential profile fields (name, bio, skills, avatar)

**Expert-Specified MVP Features**:
```tsx
// Advisor Portal MVP Scope
interface AdvisorPortalMVP {
  // Role-based authentication
  role: 'advisor'
  
  // Onboarding checklist items
  onboarding: {
    stripe_connect_complete: boolean
    cal_com_connected: boolean
    profile_complete: boolean
  }
  
  // Availability management (via Cal.com)
  availability: {
    next_available_slots: CalComSlot[]
    is_accepting_bookings: boolean // portal toggle
    cal_com_manage_link: string
  }
  
  // Platform-fixed pricing (no per-advisor rates in MVP)
  pricing: {
    mode: 'platform' // vs 'custom' post-MVP
    consultation_rates: [900, 1900, 3500] // $9, $19, $35
    advisor_cut_percentage: 70 // platform keeps 30%
  }
}

// Key Portal Components
<OnboardingChecklist>
  <ChecklistItem>✅ Set up payouts (Stripe Connect)</ChecklistItem>
  <ChecklistItem>⏰ Connect scheduling (Cal.com)</ChecklistItem>  
  <ChecklistItem>👤 Complete profile basics</ChecklistItem>
</OnboardingChecklist>

<AvailabilityManager>
  <NextAvailableSlots slots={nextSlots} />
  <Toggle 
    label="Accept new bookings" 
    checked={isAcceptingBookings}
    onChange={handleBookingToggle} 
  />
  <ExternalLink href={calComManageUrl}>
    Manage availability in Cal.com →
  </ExternalLink>
</AvailabilityManager>
```

**Key Metrics to Display**:
- This month's consultation earnings
- Upcoming bookings count  
- Average rating from recent consultations
- Next payout date and amount
- Onboarding completion status

#### **2.2 Advisor Profile Setup (MVP Simplified)**
**Purpose**: Essential profile information for client discovery

**MVP Components to Build** (Simplified from Previous Plan):
- `ProfileBasics` - Name, bio, avatar upload
- `SkillsSelector` - Tech stack checkboxes (React, Next.js, etc.)
- `LanguagesSelector` - Communication languages
- `SpecialtiesSelector` - Frontend, fullstack, e-commerce, etc.

**Post-MVP Features** (Explicitly Deferred):
- ❌ Custom pricing overrides → ✅ Platform-fixed rates
- ❌ LinkedIn sync → ✅ Manual profile fields
- ❌ Portfolio upload → ✅ Basic bio text
- ❌ Advanced certifications → ✅ Simple skills list

**Database Fields to Support**:
```sql
-- Additional fields for advisor portal
alter table advisors add column cal_com_event_type_url text;
alter table advisors add column stripe_connect_account_id text;
alter table advisors add column is_accepting_bookings boolean default true;
alter table advisors add column pricing_mode text check (pricing_mode in ('platform','custom')) default 'platform';
```

#### **2.3 Client Communication Tools**
**Purpose**: Help advisors effectively guide clients

**Components to Build**:
- `ClientProjectOverview` - Quick project context for advisors
- `PromptSuggestionTool` - Help advisors draft better prompts
- `ProjectAnalytics` - Show build success rates, common issues
- `ClientNotes` - Private advisor notes about clients
- `HandoffReports` - Document project completion and recommendations

### **Phase 3: Revenue & Financial Components**

#### **3.1 Financial Tracking (Client-Side)**
**Purpose**: Transparent billing and advisor costs

**Components to Build**:
- `AdvisorCostEstimator` - Show estimated costs before hiring
- `BillingBreakdown` - Itemized advisor fees on invoices
- `TippingInterface` - Easy tipping flow post-project
- `UsageDashboard` - Track advisor consultation minutes used

#### **3.2 Financial Tracking (Advisor-Side)**
**Purpose**: Help advisors track earnings and taxes

**Components to Build** (Updated with Stripe Connect Express):
- `StripeConnectOnboarding` - Stripe Connect Express setup flow
- `EarningsBreakdown` - Consultation fees, tips, referral bonuses
- `PayoutSchedule` - Automatic weekly payouts via Stripe
- `TaxDocuments` - Download statements (Stripe handles 1099s automatically)
- `ReferralTracker` - Track clients brought via referral links
- `ConnectAccountStatus` - Show KYC status, payout capabilities

**Expert-Recommended Payment Flow**:
```tsx
// Stripe Connect Express integration
interface AdvisorPayments {
  stripe_connect_account_id: string
  onboarding_complete: boolean
  kyc_verified: boolean
  payout_enabled: boolean
  weekly_payout_schedule: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'
}

// Components
<StripeConnectOnboarding 
  onOnboardingComplete={handleConnectSetup}
  requiredInfo={['business_info', 'bank_account', 'tax_id']}
/>

<PayoutSchedule>
  <AutomaticPayouts enabled={true} schedule="weekly" />
  <NextPayout date="2025-09-02" amount="$347.50" />
  <PayoutHistory transactions={recentPayouts} />
</PayoutSchedule>
```

**Benefits of Stripe Connect Express**:
- **KYC handled automatically**: Stripe manages identity verification
- **Tax compliance**: 1099 forms generated automatically for US advisors
- **International support**: Multi-currency payouts for global advisors  
- **Bank account verification**: Secure payout destination setup
- **Weekly automated payouts**: No manual payout processing needed

**Scope Simplification**:
- ❌ Custom tax document generation → ✅ Stripe handles automatically
- ❌ Manual payout requests → ✅ Automatic weekly schedule
- ❌ Complex international banking → ✅ Stripe's global infrastructure

---

## 🔌 **Backend API Requirements for Worker Team**

### **API Group 1: Advisor Management**

#### **Advisor Profiles API**
```typescript
// Core advisor operations
POST /api/v1/advisors/applications        // Apply to become advisor
PUT  /api/v1/advisors/{id}/profile        // Update advisor profile  
GET  /api/v1/advisors/{id}                // Get advisor details
GET  /api/v1/advisors/search              // Search/filter advisors

// Advisor Portal APIs (Expert-Clarified MVP)
GET  /api/v1/advisors/{id}/dashboard       // Get advisor portal data
PUT  /api/v1/advisors/{id}/booking-status  // Toggle accepting bookings
GET  /api/v1/advisors/{id}/onboarding      // Get onboarding checklist status
PUT  /api/v1/advisors/{id}/calcom-connect  // Connect Cal.com account
PUT  /api/v1/advisors/{id}/stripe-connect  // Setup Stripe Connect Express

// Example API Responses
interface AdvisorProfile {
  id: string
  user_id: string
  display_name: string
  bio: string
  avatar_url: string
  skills: string[]
  specialties: ('frontend' | 'backend' | 'fullstack' | 'design' | 'mobile')[]
  languages: string[] // ['en', 'ar-eg', 'fr']
  rating: number
  review_count: number
  approval_status: 'pending' | 'approved' | 'rejected'
  referral_code: string
  // MVP Portal Fields
  cal_com_event_type_url?: string
  stripe_connect_account_id?: string
  is_accepting_bookings: boolean
  pricing_mode: 'platform' | 'custom' // MVP = 'platform'
  created_at: string
  updated_at: string
}

interface AdvisorDashboard {
  advisor_id: string
  onboarding: {
    stripe_connect_complete: boolean
    cal_com_connected: boolean
    profile_complete: boolean
  }
  availability: {
    next_available_slots: CalComSlot[]
    is_accepting_bookings: boolean
    cal_com_manage_url: string
  }
  earnings_summary: {
    this_month_cents: number
    next_payout_date: string
    next_payout_cents: number
  }
  recent_bookings: ConsultationSummary[]
}
```

#### **Matching & Recommendations API**
```typescript
POST /api/v1/projects/{id}/advisor-recommendations  // Get suitable advisors for project
POST /api/v1/advisors/quick-match                   // Quick match based on requirements
GET  /api/v1/advisors/available                     // Get advisors available now
POST /api/v1/projects/{id}/hire-advisor             // Hire advisor for project

interface MatchingRequest {
  project_id: string
  project_type?: 'ecommerce' | 'portfolio' | 'business' | 'blog'
  tech_requirements?: string[]
  budget_range?: { min: number, max: number }
  urgency?: 'low' | 'medium' | 'high'
  consultation_only?: boolean
}
```

### **API Group 2: Chat Integration**

#### **Chat Collaboration API**
```typescript
POST /api/v1/projects/{id}/chat/add-advisor    // Add advisor to project chat
POST /api/v1/chat/advisor-guided-prompt        // Send AI prompt with advisor guidance
GET  /api/v1/projects/{id}/chat/participants   // Get all chat participants
POST /api/v1/chat/co-orchestrated-response     // Advisor helps craft AI response

interface AdvisorChatMessage {
  id: string
  project_id: string
  advisor_id: string
  message_type: 'guidance' | 'suggestion' | 'prompt_draft' | 'feedback'
  content: string
  ai_context?: {
    related_to_message_id: string
    suggested_prompt: string
    reasoning: string
  }
  created_at: string
}
```

### **API Group 3: Consultation Booking**

#### **Booking Management API**
```typescript
GET  /api/v1/advisors/{id}/availability        // Get advisor's available time slots
POST /api/v1/consultations/book                // Book consultation session
PUT  /api/v1/consultations/{id}/reschedule     // Reschedule consultation
DELETE /api/v1/consultations/{id}              // Cancel consultation  
GET  /api/v1/users/{id}/consultations          // Get user's consultation history

interface ConsultationSlot {
  id: string
  advisor_id: string
  start_time: string // ISO datetime
  duration_minutes: number
  timezone: string
  video_link?: string
  meeting_notes?: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  client_id: string
  project_id?: string
  created_at: string
}
```

### **API Group 4: Financial Operations - SIMPLIFIED FOR MVP**

#### **Consultation Billing API** (Simplified Attribution Model)
```typescript
GET  /api/v1/advisors/{id}/earnings           // Get advisor earnings summary (simplified)
POST /api/v1/projects/{id}/tip-advisor        // Tip advisor for project
GET  /api/v1/advisors/{id}/consultation-stats // Track consultation performance
POST /api/v1/advisors/{id}/stripe-connect     // Setup Stripe Connect Express account

// MVP: Simplified earnings model (consultation-based only)
interface AdvisorEarnings {
  advisor_id: string
  period: { start: string, end: string }
  consultation_fees: {
    total_amount: number
    session_count: number
    total_hours: number
    average_hourly_rate: number
  }
  tips_received: {
    total_amount: number
    tip_count: number
  }
  // Defer to Phase 4: revenue_share, referral_bonuses
  stripe_connect: {
    account_id: string
    onboarding_complete: boolean
    payout_enabled: boolean
    next_payout_date: string
  }
}

// Simplified session tracking (no complex windowing)
interface AdvisorSession {
  id: string
  advisor_id: string
  project_id: string
  client_id: string
  session_type: 'consultation' | 'chat_guidance'
  started_at: string
  ended_at?: string
  duration_minutes: number
  hourly_rate_cents: number
  total_amount_cents: number
  cal_com_booking_id?: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
}
```

#### **Client Billing Integration API** (Simplified for MVP)
```typescript
GET  /api/v1/users/{id}/advisor-charges       // Get advisor consultation charges (simplified)
GET  /api/v1/projects/{id}/advisor-costs      // Get project advisor cost breakdown

// MVP: Focus on consultation billing only
interface AdvisorUsageBilling {
  user_id: string
  period: { start: string, end: string }
  consultations: {
    total_minutes: number
    total_cost_cents: number
    sessions: ConsultationCharge[]
  }
  tips_given: {
    total_amount_cents: number
    tips: TipTransaction[]
  }
  // Defer to Phase 4: subscription_addons, AI minute uplifts
}

interface ConsultationCharge {
  id: string
  advisor_name: string
  project_name: string
  date: string
  duration_minutes: number
  hourly_rate_cents: number
  total_cost_cents: number
  cal_com_booking_id?: string
}
```

### **API Group 5: Quality & Trust**

#### **Reviews & Ratings API**
```typescript
POST /api/v1/advisors/{id}/reviews            // Leave advisor review
GET  /api/v1/advisors/{id}/reviews            // Get advisor reviews
POST /api/v1/projects/{id}/dispute            // File dispute about advisor
GET  /api/v1/advisors/leaderboard             // Get top-rated advisors

interface AdvisorReview {
  id: string
  advisor_id: string
  client_id: string
  project_id: string
  rating: number // 1-5 stars
  review_text: string
  helpful_count: number
  response_time_rating: number
  expertise_rating: number
  communication_rating: number
  created_at: string
  advisor_response?: string
}
```

---

## 🚀 **Implementation Phases**

### **Phase 1: MVP Foundation (3 weeks) - UPDATED**
**Goal**: Basic advisor hiring and consultation booking with expert-recommended tools

**Deliverables** (Updated with Expert Feedback):
- Simplified advisor profiles (manual fields, no LinkedIn sync)
- Basic advisor discovery (simple search/filters, no complex matching algorithm)  
- Cal.com integration for consultation booking
- Stripe Connect Express setup for advisor payments
- Enhanced chat UI components (3 avatars, advisor-guided pills, cost preview banners)
- Mock data integration using realistic advisor/consultation scenarios

**Success Criteria**:
- Clients can discover and hire advisors with clear visual hierarchy
- Cal.com booking flow works end-to-end with professional scheduling
- Chat UI clearly shows Client + Advisor + AI participation  
- Components integrate with existing SheenApps design system
- Mobile-responsive advisor browsing experience

**Scope Cuts Applied**:
- ❌ Custom calendar widget → ✅ Cal.com professional booking
- ❌ LinkedIn profile sync → ✅ Manual advisor profile fields
- ❌ Advanced matching algorithm → ✅ Basic search/filters + "Top Match" suggestion
- ❌ Custom video call embeds → ✅ New tab video calls

### **Phase 2: Chat Integration Polish (2 weeks)**
**Goal**: Smooth advisor collaboration in project chat with cost transparency

**Deliverables** (Enhanced with Expert UX Specs):
- Advisor invitation flow from project dashboard
- Three-avatar chat system (Client/Advisor/AI) with distinct styling
- Cost preview banners ("Advised minutes: +30%" when advisor active)
- Advisor-guided pills on AI responses
- Enhanced typing indicators showing who is responding
- Basic advisor activity tracking in chat

**Success Criteria**:
- Clear visual hierarchy prevents 3-way chat confusion
- Cost transparency when advisor becomes active in project  
- Advisor-guided AI responses clearly marked
- Video call links open properly in new tab

### **Phase 3: Simple Attribution (2 weeks) - SIMPLIFIED**  
**Goal**: Basic billing and advisor payouts (consultation-based only)

**Deliverables** (Simplified Attribution Model):
- Session-based billing tracking (consultations only, no complex AI minute uplift)
- Advisor earnings dashboard with Stripe Connect payouts
- Basic billing integration (add consultation fees to client invoices)
- Simple performance metrics (consultations completed, response time)

**Success Criteria**:
- Clients see advisor consultation charges on bills
- Advisors see earnings and payout schedule in dashboard
- Stripe Connect Express handles KYC and weekly payouts automatically
- Basic performance tracking works

**Scope Simplifications**:
- ❌ Complex attribution windowing system → ✅ Simple session-based tracking
- ❌ AI minute uplift billing → ✅ Consultation fees only (defer to Phase 4)
- ❌ Multi-tier advisor levels → ✅ Single tier with basic ratings

### **Phase 4: Iterate Based on Usage (Ongoing)**
**Goal**: Add sophistication after proving basic value proposition

**What to Consider Adding Based on Real Data**:
- AI minute attribution and uplifts (if clients request it)
- Advisor tier system (if quality differentiation emerges naturally)
- Advanced matching algorithm (if simple search/filters prove inadequate)
- Quality control automation (if manual review becomes bottleneck)
- Custom video call embeds (if new-tab experience proves insufficient)

**Dependencies**: Worker team delivers simplified APIs focused on consultation booking and basic attribution

**Success Criteria**:
- Real advisor profiles and search
- Actual chat integration with persistent chat system
- Working consultation booking with video calls
- Basic revenue tracking

---

## 🤔 **Questions & Concerns**

### **Technical Integration Concerns**

#### **1. Persistent Chat System Integration**
**Question**: How will advisor messages integrate with the existing persistent chat system?
**Concern**: Need to ensure advisor messages sync properly with SSE events and don't break message deduplication
**Recommendation**: Extend existing chat message types to include advisor context

#### **2. Authentication & Authorization**
**Question**: How do advisors authenticate? Separate login system or extend existing auth?
**Concern**: Need role-based permissions (client vs advisor vs admin)
**Recommendation**: Extend existing Supabase auth with user roles and advisor approval workflow

#### **3. Video Call Integration**
**Question**: Which video platform should we integrate? Zoom, Google Meet, custom solution?
**Concern**: Need reliable scheduling and automatic meeting creation
**Options**: 
- Zoom API (most professional)
- Google Meet API (simpler integration)
- Daily.co (developer-friendly)
- Built-in WebRTC (complex but custom)

### **Business Model Concerns**

#### **4. Revenue Sharing Implementation**  
**Question**: How do we track which advisor contributed to which client usage?
**Concern**: Need attribution system for AI minutes, subscriptions, tips
**Recommendation**: Project-level advisor assignment with usage tracking

#### **5. Quality Control Mechanism**
**Question**: How do we prevent low-quality advisors from hurting client experience?
**Concern**: Need vetting process, ongoing performance monitoring, removal process
**Recommendation**: Multi-stage approval (application → trial period → full approval)

#### **6. Advisor Incentive Alignment**
**Question**: How do we ensure advisors help clients succeed vs maximize their own earnings?
**Concern**: Advisors might encourage unnecessary complexity or longer projects
**Recommendation**: Success-based bonuses tied to project completion and client satisfaction

### **User Experience Concerns**

#### **7. Chat Complexity**
**Question**: Will adding advisors make the chat interface too complex?
**Concern**: Three-way conversation (Client + AI + Advisor) might be confusing
**Recommendation**: Clear visual hierarchy and message attribution

#### **8. Advisor Discovery vs Matching**
**Question**: Should we emphasize algorithmic matching or manual advisor browsing?
**Concern**: Too many choices overwhelm users, but limited options feel restrictive
**Recommendation**: Smart defaults with easy override (like "Try our top match" + "Browse all advisors")

#### **9. Pricing Transparency** 
**Question**: How upfront should advisor costs be?
**Concern**: Surprise charges hurt trust, but complex pricing discourages usage
**Recommendation**: Clear cost estimation before hiring, simple per-minute consultation billing

### **Scaling Concerns**

#### **10. Advisor Supply vs Demand**
**Question**: How do we ensure adequate advisor supply as client base grows?
**Concern**: Long wait times or advisor shortages hurt experience
**Recommendation**: Phased rollout with invitation-only advisor program initially

#### **11. International Timezone Challenges**
**Question**: How do we handle global advisor/client timezone matching?
**Concern**: Limited availability windows reduce booking success
**Recommendation**: Timezone-aware matching with async consultation options (recorded video responses)

---

## 💡 **Creative UX Enhancement Ideas**

### **Smart Collaboration Features**
- **AI-Advisor Handoff**: Let AI ping advisor when stuck on complex requests
- **Prompt Improvement Suggestions**: Advisor can suggest better prompts in real-time  
- **Success Pattern Recognition**: Show advisors what worked for similar projects
- **Code Review Integration**: Advisors can review generated code before client sees it

### **Trust Building Features**
- **Advisor Verification Badges**: LinkedIn verified, portfolio validated, client testimonials
- **Real-time Expertise Matching**: "Sarah has built 15 e-commerce sites like yours"
- **Success Stories**: Show before/after examples of advisor-guided projects
- **Transparent Performance Metrics**: Response time, success rate, client retention

### **Gamification Elements**
- **Advisor Leaderboards**: Top-rated advisors get more visibility
- **Client Success Badges**: Advisors earn badges for project types completed
- **Referral Competitions**: Monthly bonuses for most client referrals
- **Expertise Certifications**: SheenApps-specific advisor skill validation

---

This plan provides a comprehensive roadmap for building the Advisor Network feature with clear separation between UI/UX work that can start immediately and backend API requirements that need Worker team coordination.

The focus on UI-first development allows rapid prototyping and user testing while the Worker team builds the necessary backend infrastructure in parallel.

---

## 🧠 **Expert Feedback Integration** (August 25, 2025)

### **✅ What I'm Incorporating from Expert Feedback**

#### **1. Enhanced Chat UX Specifications** 
**Expert's Insight**: "Three avatars + message chips (Client / Advisor / AI)" with "Advisor-guided" pills

**Why I Like This**:
- **Solves complexity concern**: Clear visual hierarchy for 3-way conversations
- **Cost transparency**: "Cost preview" chips when advisor becomes active
- **Integration-ready**: Fits naturally with existing persistent chat system

**Updated Chat Components**:
```tsx
interface ChatMessage {
  author_type: 'client' | 'advisor' | 'ai'
  advisor_guided?: boolean
  cost_impact?: { type: 'session' | 'advised_minutes', rate: number }
}

// New components to add
<MessageChip author={message.author_type} advisorGuided={message.advisor_guided} />
<CostPreviewBanner>Advised minutes: +30% while advisor active</CostPreviewBanner>
<AdvisorGuidedPill>AI response guided by advisor</AdvisorGuidedPill>
```

#### **2. Stripe Connect Express Integration**
**Expert's Insight**: "Stripe Connect Express for KYC, balances, weekly payouts"

**Why I Like This**:
- **Industry standard**: Proven marketplace payment solution
- **Handles complexity**: KYC, tax forms, international payouts automatically  
- **Fits existing setup**: Integrates with current Stripe billing system

**Implementation**: Add Stripe Connect Express onboarding for approved advisors in advisor dashboard

#### **3. Cal.com for Consultation Scheduling**
**Expert's Insight**: "Use Cal.com (or Daily.co + Cal.com) for slots/ICS"

**Why I Like This**:
- **Fastest implementation**: No custom calendar UI needed initially
- **Professional experience**: Proper calendar invites, reminders, timezone handling
- **Video integration**: Can connect to Zoom/Meet automatically

**Updated Booking Components**:
- Replace custom `BookingCalendar` with Cal.com embed
- Add `CalComIntegration` component for advisor setup
- Update consultation flow to use Cal.com booking confirmation

#### **4. Strategic Scope Cuts for Faster MVP**
**Expert's Insight**: "Defer VideoCallEmbed custom UI; open in new tab first"

**Why I Like This**:
- **Ship faster**: Focus on core advisor-client matching first
- **Proven UX patterns**: New tab for video calls is familiar
- **Incremental complexity**: Add custom video UI in Phase 2

**Scope Cuts to Implement**:
- ❌ Custom video call embeds → ✅ Open video calls in new tab
- ❌ LinkedIn profile sync → ✅ Manual advisor profile fields  
- ❌ Advanced leaderboards → ✅ Basic advisor listing with ratings
- ❌ Custom tax document generation → ✅ Use Stripe's standard tax handling

#### **5. Simplified Attribution Model (MVP Version)**
**Expert's Insight**: Complex windowing system with multiple triggers

**My Simplified Approach**:
```typescript
// MVP: Simple session-based attribution (not complex windowing)
interface AdvisorSession {
  advisor_id: string
  project_id: string
  started_at: string
  ended_at?: string
  session_type: 'consultation' | 'chat_guidance'
  minutes_attributed: number
}

// Rule: Advisor gets credit for consultations only initially
// Defer complex AI minute uplift attribution to Phase 2
```

### **❌ What I'm NOT Incorporating from Expert Feedback**

#### **1. Multi-Tier Advisor Levels (J/Pro/Lead)**
**Expert's Suggestion**: "Level bands (J/Pro/Lead) change both session split and uplift split"

**Why I Don't Like This for MVP**:
- **No data for tiering**: Don't know what differentiates advisor skill levels yet
- **Pricing complexity**: Multiple pricing tiers confuse clients  
- **Hierarchy issues**: Creates competition instead of collaboration among advisors
- **Implementation overhead**: Need certification process, tier management UI

**Alternative**: Single advisor tier initially, add levels based on real performance data

#### **2. Complex Attribution Windowing System**
**Expert's Suggestion**: "Start advisor_active_window when... End window after 15 min... cap to N minutes per window"

**Why I Don't Like This for MVP**:
- **Over-engineered**: Multiple trigger types, timing caps, complex state machine
- **Gaming prevention premature**: Assumes bad actors from day 1
- **Implementation complexity**: Many edge cases to handle and debug
- **Billing confusion**: Clients won't understand complex attribution rules

**Alternative**: Simple consultation-based billing first, add AI minute tracking after proving basic value

#### **3. Sophisticated Matching Algorithm**  
**Expert's Suggestion**: "Score = (stack match * 3) + (language * 3) + (timezone overlap * 2)..."

**Why I Don't Like This for MVP**:
- **Premature optimization**: No training data to validate scoring factors
- **Algorithm maintenance**: Complex scoring needs constant tuning
- **False precision**: Detailed scores imply accuracy we don't have yet

**Alternative**: Basic filters (skills, availability, rating) + "Top Match" suggestion + manual client choice

#### **4. Advanced Quality Control Pipeline**
**Expert's Suggestion**: "QA pipeline on advisor changes: lint/tests/accessibility + one-click rollback"

**Why I Don't Like This for MVP**:
- **Process complexity**: QA pipelines are sophisticated systems to build/maintain
- **Premature scaling**: Need advisor volume before quality issues emerge
- **Resource distraction**: Building QA tools instead of core features

**Alternative**: Manual quality review for MVP, automated processes after scale justifies investment

#### **5. Detailed Analytics Dashboard**
**Expert's Suggestion**: "Time-to-useful-diff: ≤ 12 min from advisor join" and other specific metrics

**Why I Don't Like This for MVP**:
- **Metrics before product**: Measuring optimization before basic functionality works
- **Implementation distraction**: Building analytics instead of core user flows
- **Moving targets**: Success metrics will change as we learn user behavior

**Alternative**: Basic usage tracking (consultations booked, completion rate) initially

### **🎯 Updated Implementation Priorities**

#### **Phase 1: MVP Foundation (3 weeks) - UPDATED**
**Goal**: Basic advisor hiring and consultation booking with expert-recommended tools

**What to Build**:
- Simplified advisor profiles (manual fields, no LinkedIn sync)
- Basic advisor discovery (simple search/filters, no complex matching)  
- Cal.com integration for consultation booking
- Stripe Connect Express for advisor payments
- Enhanced chat UI (3 avatars, advisor-guided pills, cost previews)

**Success Criteria**:
- Clients can discover and hire advisors
- Consultations work end-to-end with professional scheduling
- Chat clearly shows advisor participation
- Basic payment flow works (consultation fees)

#### **Phase 2: Chat Integration Polish (2 weeks)**
**Goal**: Smooth advisor collaboration in project chat

**What to Build**:
- Advisor invitation flow from project dashboard
- Enhanced chat UX with cost transparency
- Basic advisor activity tracking
- Video call links (new tab, not embedded)

#### **Phase 3: Simple Attribution (2 weeks)**  
**Goal**: Basic billing and advisor payouts

**What to Build**:
- Session-based billing (consultations only)
- Advisor earnings dashboard
- Stripe Connect payouts
- Basic performance metrics

#### **Phase 4: Iterate Based on Usage (Ongoing)**
**What to Consider Adding**:
- AI minute attribution (if clients want it)
- Advisor tier system (if quality differentiation emerges)
- Advanced matching (if simple approach inadequate)
- Quality control automation (if manual review becomes bottleneck)

### **🚀 Expert Feedback Impact**

**Positive Changes**:
- ✅ **Faster development**: Cal.com and Stripe Connect save weeks of custom development
- ✅ **Better UX specifics**: Clear guidance for 3-way chat design
- ✅ **Proven patterns**: Using industry-standard tools reduces risk
- ✅ **Focused scope**: Strategic cuts let us ship faster

**Avoided Complexity**:  
- ✅ **Simpler data model**: Basic advisor profiles and sessions vs complex attribution schema
- ✅ **MVP-appropriate features**: Core matching and consultation booking vs sophisticated marketplace features
- ✅ **Incremental sophistication**: Can add complexity after proving basic value proposition

**Result**: Expert feedback refined the plan toward faster MVP delivery while validating the overall approach and UI-first strategy.

---

## 🔧 **Expert Implementation Feedback Integration** (August 25, 2025)

### **✅ What I'm Incorporating from Second Expert Review**

#### **1. Proven Database Schema** 
**Expert's Insight**: Minimal, focused schema for consultation marketplace

**Why I Like This**:
- **Actually minimal**: Focused on core functionality without overengineering
- **Clear relationships**: Logical flow from consultations → charges → reviews → payouts
- **Production-tested**: Based on real marketplace experience

**Updated Database Design**:
```sql
-- Expert-recommended minimal schema
alter table public.profiles add column role text 
  check (role in ('client','advisor','admin')) default 'client';

create table advisors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id),
  display_name text not null,
  bio text, avatar_url text, skills text[], specialties text[], languages text[],
  hourly_hint_cents int, rating numeric default 0, review_count int default 0,
  approval_status text check (approval_status in ('pending','approved','rejected')) default 'pending',
  referral_code text unique, created_at timestamptz default now()
);

create table consultations (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references advisors(id),
  client_id uuid not null references auth.users(id),
  project_id uuid, cal_booking_id text, start_time timestamptz not null,
  duration_minutes int not null check (duration_minutes in (15,30,60)),
  status text check (status in ('scheduled','in_progress','completed','cancelled','no_show')) default 'scheduled',
  video_url text, notes text, price_cents int not null, created_at timestamptz default now()
);
```

#### **2. Cal.com + Stripe Integration Specifications**
**Expert's Insight**: Specific webhook contracts and payment timing

**Why I Like This**:
- **Avoids integration pitfalls**: Clear event handling prevents edge cases
- **Payment timing guidance**: T-15 minute capture logic for no-shows
- **Proven patterns**: Based on successful marketplace implementations

**Updated Integration Flow**:
```typescript
// Cal.com webhook handlers
BOOKING_CREATED → create consultations row + Stripe PaymentIntent
BOOKING_RESCHEDULED → update start_time in consultations
BOOKING_CANCELLED → apply cancellation policy + refund logic

// Stripe payment timing
PaymentIntent created on booking confirmation
Capture at T-15 minutes or session start (simplifies refunds)
Platform fee included in pricing, Connect transfer on completion
```

#### **3. Essential Admin Console**
**Expert's Insight**: "Must-have tiny screens" for marketplace operations

**Why I Like This**:
- **Operational necessity**: Cannot run advisor marketplace without admin tools
- **Focused scope**: Just 4 essential screens, not feature creep
- **Manual override capability**: Essential for handling edge cases in early days

**Admin Components to Build**:
- **Applications Screen**: Approve/reject advisor applications, view portfolios
- **Consultations Screen**: Search bookings, handle refunds, mark no-shows
- **Advisors Screen**: Suspend/activate, edit profiles, view CSAT scores
- **Finance Screen**: Export payout CSVs, track platform revenue

#### **4. Ship-Ready UX Copy**
**Expert's Insight**: Tested microcopy and policy templates

**Why I Like This**:
- **Saves iteration time**: No need to craft messaging from scratch
- **Proven conversion patterns**: Based on successful marketplace copy
- **Consistent professional tone**: Friendly but clear messaging

**Updated Component Copy**:
```tsx
// Hire CTA: "Get unstuck in 15 minutes"
// Chat cost banner: "Advisor Active — consultations billed separately (from $9)"
// Booking confirm: "You're booked for {duration} min with {advisor} on {date}"
// Rating prompt: "Did this session move your project forward?"
```

#### **5. Simple Product Rules (MVP-Appropriate)**
**Expert's Insight**: Clear consultation SKUs and policies

**My Simplified Version**:
```typescript
// MVP Product Rules (simplified from expert's complex version)
interface ConsultationRules {
  durations: [15, 30, 60] // minutes
  pricing: [900, 1900, 3500] // cents ($9, $19, $35)
  cancellation: 'free_24h_before' // simple binary rule
  rating: 'post_consultation_5_star' // basic rating system
  grace_period: '5_minutes_late_join' // reasonable tolerance
}
```

### **❌ What I'm NOT Incorporating from Second Expert Review**

#### **1. Complex Cancellation Fee Structure**
**Expert's Suggestion**: "Free reschedule ≥ 12h before; 50% fee inside 12h; 100% fee on no-show"

**Why I Don't Like This for MVP**:
- **Too many edge cases**: Multiple time thresholds and percentage calculations
- **Support complexity**: Complex policies require extensive customer service
- **User confusion**: Difficult to explain multiple fee tiers clearly
- **Implementation overhead**: Complex business logic for unvalidated policies

**Alternative**: Simple 24-hour free cancellation policy initially

#### **2. Automated Replacement Guarantee**
**Expert's Suggestion**: "If CSAT ≤ 3 twice for same advisor → auto-offer free session with top-match"

**Why I Don't Like This for MVP**:
- **Complex automation**: CSAT pattern tracking, auto-triggering systems
- **Operational assumptions**: Assumes we'll have "top-match" advisors available
- **Premature optimization**: Building systems for problems we haven't encountered
- **Edge case engineering**: Many failure scenarios to handle

**Alternative**: Manual admin review for quality issues

#### **3. Sophisticated Analytics Framework**
**Expert's Suggestion**: Detailed event tracking with specific properties and dashboards

**Why I Don't Like This for MVP**:
- **Distraction from core features**: Building analytics instead of consultation flow
- **Unknown success metrics**: Don't know what to measure until we have users
- **Implementation complexity**: Event schemas, dashboard creation, data analysis tools
- **Premature optimization**: Measuring before we have something worth measuring

**Alternative**: Basic usage tracking (consultations booked, completion rate)

#### **4. Aggressive Legal Terms**
**Expert's Suggestion**: "12-month non-circumvention with $500 minimum buy-out fee"

**Why I Don't Like This for MVP**:
- **Adoption barrier**: Aggressive legal terms scare away early adopters
- **Trust issues**: Implies we expect users to circumvent us
- **Enforcement complexity**: Legal mechanisms we're not equipped to handle
- **Focus distraction**: Energy spent on preventing problems vs creating value

**Alternative**: Simple, friendly terms focused on positive user experience

#### **5. Multi-Provider Payout System**
**Expert's Suggestion**: "Make payouts provider pluggable; fallbacks like Wise/Payoneer/Deel"

**Why I Don't Like This for MVP**:
- **Geographic overreach**: Building for markets we haven't validated
- **Integration complexity**: Multiple payment providers to maintain
- **Compliance overhead**: Different countries have different legal requirements
- **Feature bloat**: Infrastructure for unproven international demand

**Alternative**: Start with Stripe-supported regions, expand after proving model

### **🎯 Updated MVP Implementation Priorities**

#### **Phase 1: Core Foundation (3 weeks) - UPDATED WITH EXPERT SCHEMA**
**Goal**: End-to-end consultation booking with advisor portal and client discovery

**Technical Implementation** (Using Expert Specifications):
- Expert's minimal database schema (advisors, consultations, charges, reviews)
- Role-based authentication (client, advisor, admin roles)
- **Advisor Portal MVP**: Onboarding checklist, availability display, earnings overview
- **Client Discovery**: Basic advisor search/filtering, booking flow
- Cal.com webhook integration with clear event contracts
- Stripe Connect Express with T-15 minute payment capture
- Basic admin console (4 essential screens)

**UI Components to Build**:
```tsx
// Advisor Portal (NEW - Expert Clarified)
- AdvisorDashboard with onboarding checklist
- AvailabilityDisplay (Cal.com integration + pause toggle)
- EarningsOverview (consultation fees, payout schedule)
- ProfileBasics (name, bio, skills, avatar)
- BookingsQueue (upcoming consultations)

// Client-Side (Enhanced)
- AdvisorGrid with search/filters
- ConsultationBooking with Cal.com embed
- ChatIntegration with 3-avatar system
```

**Simplified Business Rules** (Avoiding Expert's Complex Policies):
- Fixed pricing: $9/19/35 for 15/30/60 minute consultations (70% to advisor)
- Platform-controlled rates (no per-advisor pricing in MVP)
- Simple cancellation: Free >24h before, charged <24h
- Basic 5-star rating system
- Manual quality control (no automation)

#### **Phase 2: Operations & Polish (2 weeks)**
**Goal**: Essential operational tools and user experience

**What to Build**:
- Admin workflow for advisor approval
- Email templates for booking lifecycle
- Mobile-responsive consultation booking flow
- Expert's ship-ready UX copy implementation

#### **Phase 3: Launch Preparation (1 week)**  
**Goal**: Final testing and launch readiness

**What to Build**:
- End-to-end testing of consultation flow
- Basic performance analytics (volume, completion rate)
- Simple policies and help documentation
- Mobile compatibility verification

### **🚀 Expert Implementation Impact**

**Positive Technical Guidance Incorporated**:
- ✅ **Proven database schema** - Minimal but complete for consultation marketplace
- ✅ **Clear integration contracts** - Cal.com + Stripe with specific event handling
- ✅ **Essential admin tools** - Operational necessities for day-one marketplace management
- ✅ **Ship-ready copy** - Professional, tested messaging for user flows

**Complex Policies Simplified**:
- ✅ **Simple cancellation rules** - 24-hour binary policy vs complex fee structure
- ✅ **Manual quality control** - Admin review vs automated replacement systems  
- ✅ **Basic analytics** - Core metrics vs sophisticated tracking framework
- ✅ **Friendly legal terms** - Trust-building vs aggressive non-circumvention policies

**Result**: Expert's technical foundation with simplified business rules optimized for MVP learning and rapid iteration based on real user feedback.

---

## 📱 **Advisor Portal Clarification** (Expert Follow-up - August 25, 2025)

### **✅ Confirmed: Advisor Portal IS Included in MVP**

The expert confirmed our plan already includes a complete advisor portal with the right MVP scope. Here's the clarified implementation:

#### **What's IN the Advisor Portal MVP**:
```tsx
// Login & Role-Based Access
- Role-based authentication (profiles.role = 'advisor')
- Dedicated advisor portal at /advisor/dashboard

// Onboarding Checklist (3 Required Steps)
1. Stripe Connect Express setup (payouts)
2. Cal.com account connection (scheduling) 
3. Profile basics completion (name, bio, skills, avatar)

// Availability Management
- Display next available slots (from Cal.com API)
- "Accept new bookings" toggle (advisors.is_accepting_bookings)  
- "Manage in Cal.com" external link (advisors.cal_com_event_type_url)

// Earnings & Bookings
- This month's consultation earnings
- Upcoming consultations queue
- Next payout date and amount
- Basic performance metrics (rating, consultation count)

// Pricing Display (Platform-Fixed)
- Show client pricing: $9/$19/$35 for 15/30/60 minutes
- Show advisor cut: 70% of consultation fee
- No per-advisor rate customization (MVP simplification)
```

#### **What's DEFERRED to Post-MVP**:
```tsx
// Advanced Features (Phase 2+)
- Custom pricing overrides per advisor
- Inline availability editing (write to Cal.com API)
- Advanced portfolio management
- Certification/badge systems
- Revenue share from AI minute uplifts
- Detailed analytics dashboards
```

#### **Database Support**:
```sql
-- MVP advisor portal requires these additional fields
alter table advisors add column cal_com_event_type_url text;
alter table advisors add column stripe_connect_account_id text;
alter table advisors add column is_accepting_bookings boolean default true;
alter table advisors add column pricing_mode text check (pricing_mode in ('platform','custom')) default 'platform';
```

### **🎯 Implementation Priority**

The advisor portal is **essential for MVP** because:
- **Advisors need onboarding** - Can't accept bookings without Stripe + Cal.com setup
- **Advisors need earnings visibility** - Must see consultation income and payout schedule  
- **Advisors need booking control** - Toggle availability without going to Cal.com
- **Platform needs approval workflow** - Admin approves advisors, advisors complete setup

### **🚀 Updated Success Criteria**

**Phase 1 Complete When**:
- ✅ **Client flow**: Browse advisors → book consultation → pay → join call → rate
- ✅ **Advisor flow**: Apply → get approved → complete onboarding → receive bookings → see earnings
- ✅ **Admin flow**: Review applications → approve advisors → manage consultations → export payouts

The advisor portal is not an "add-on" - it's a **core component** that makes the two-sided marketplace functional for both clients and advisors.

---

## 🌍 **Internationalization Integration** (Critical Missing Component)

### **❌ Current Plan Gap: No i18n Consideration**

Our plan completely missed that SheenApps has sophisticated **9-locale internationalization** with:
- **Locales**: `en`, `ar-eg`, `ar-sa`, `ar-ae`, `ar`, `fr`, `fr-ma`, `es`, `de`
- **RTL support** for all Arabic locales with proper text direction
- **Multi-currency** support with regional pricing adjustments
- **Locale-specific routing** with `[locale]` dynamic routes
- **Translation files** organized by feature (`auth.json`, `dashboard.json`, etc.)

### **✅ Required i18n Integration for Advisor Network**

#### **1. Translation Files Structure**
**Need to Create**: `advisor.json` files for all 9 locales

```json
// src/messages/en/advisor.json
{
  "portal": {
    "title": "Advisor Portal",
    "dashboard": "Dashboard",
    "earnings": "Earnings",
    "availability": "Availability"
  },
  "onboarding": {
    "welcome": "Welcome to SheenApps Advisor Network",
    "steps": {
      "stripe": "Set up payouts",
      "calcom": "Connect scheduling",
      "profile": "Complete profile"
    }
  },
  "consultations": {
    "upcoming": "Upcoming consultations",
    "duration": {
      "15": "15-minute consultation",
      "30": "30-minute consultation", 
      "60": "60-minute consultation"
    },
    "pricing": {
      "clientPays": "Client pays",
      "youEarn": "You earn",
      "platformFee": "Platform fee"
    }
  },
  "availability": {
    "acceptingBookings": "Accept new bookings",
    "manageInCalcom": "Manage in Cal.com",
    "nextAvailable": "Next available slots"
  },
  "application": {
    "title": "Apply to become an advisor",
    "skills": "Technical skills",
    "experience": "Experience level",
    "portfolio": "Portfolio links"
  }
}

// src/messages/ar-eg/advisor.json (Arabic - Egypt)
{
  "portal": {
    "title": "بوابة المستشار",
    "dashboard": "لوحة التحكم",
    "earnings": "الأرباح",
    "availability": "الأوقات المتاحة"
  },
  // ... complete Arabic translations
}
```

#### **2. Localized Routing Integration**
**Need to Add**: Advisor routes to routing system

```typescript
// src/i18n/routes.ts (UPDATE REQUIRED)
export const ROUTES = {
  // ... existing routes
  ADVISOR_PORTAL: '/advisor/dashboard',
  ADVISOR_APPLICATIONS: '/advisor/apply',
  ADVISOR_AVAILABILITY: '/advisor/availability',
  ADVISOR_EARNINGS: '/advisor/earnings',
  CLIENT_BROWSE_ADVISORS: '/advisors',
  CLIENT_BOOK_CONSULTATION: (advisorId: string) => `/advisors/${advisorId}/book`,
} as const
```

#### **3. Multi-Currency Pricing Integration**
**Need to Integrate**: Regional pricing with consultation fees

```typescript
// Integration with existing regionalPricing config
interface ConsultationPricing {
  base_usd: [900, 1900, 3500] // $9, $19, $35
  localized: {
    'ar-eg': [135, 285, 525], // EGP (15% of USD)
    'ar-sa': [34, 71, 131],   // SAR (1.1x multiplier)  
    'ar-ae': [33, 70, 129],   // AED (1.2x multiplier)
    'fr': [8, 17, 32],        // EUR
    'de': [8, 18, 34],        // EUR (1.05x multiplier)
    // ... all 9 locales
  }
}
```

#### **4. RTL-Compatible Advisor Components**
**Need to Update**: All advisor UI components for RTL support

```tsx
// Advisor components must use logical properties
<AdvisorCard className="flex items-center gap-4 p-6 border rounded-lg rtl:space-x-reverse">
  <AdvisorAvatar className="shrink-0" />
  <div className="flex-1 min-w-0">
    <h3 className="font-semibold text-start">{advisor.name}</h3>
    <p className="text-muted-foreground text-start">{advisor.bio}</p>
  </div>
  <div className="shrink-0 text-end">
    <BookingButton advisor={advisor} />
  </div>
</AdvisorCard>

// Cal.com embeds need RTL direction support
<CalComEmbed 
  eventTypeUrl={advisor.calComUrl}
  config={{ 
    layout: 'month_view',
    branding: { color: '#000000' },
    styles: { 
      direction: direction, // 'rtl' for Arabic locales
      textAlign: isRTL ? 'right' : 'left' 
    }
  }}
/>
```

#### **5. Advisor Profile Localization**
**Need to Support**: Multi-language advisor profiles

```typescript
interface AdvisorProfile {
  // ... existing fields
  display_name: string
  bio: string
  skills: string[] // Technical terms (React, Next.js) stay English
  specialties: string[] // Localized (frontend → تطوير واجهات أمامية)
  languages: string[] // ['en', 'ar-eg', 'fr'] - what advisor speaks
  
  // Localized fields for each supported locale
  localized_bio?: Record<Locale, string>
  localized_specialties?: Record<Locale, string[]>
}
```

### **🎯 Updated Implementation Requirements**

#### **Phase 1 Additions (i18n Integration)**:
```tsx
// MUST ADD to Phase 1 scope
1. Create advisor.json translation files for all 9 locales
2. Update routing configuration with advisor routes  
3. Implement RTL-compatible advisor components
4. Integrate multi-currency consultation pricing
5. Add language switcher to advisor portal
6. Test advisor flow in Arabic (RTL) and European locales

// Updated success criteria
- ✅ Advisor portal works in all 9 locales
- ✅ Consultation pricing displays in local currency
- ✅ Arabic advisor portal displays correctly (RTL)
- ✅ Language switching preserves advisor state
```

#### **Backend API Updates Required**:
```typescript
// APIs must support locale-aware responses
GET /api/v1/advisors/search?locale=ar-eg        // Localized search results
GET /api/v1/consultations/pricing?locale=ar-sa  // Regional pricing
POST /api/v1/advisors/{id}/profile              // Accepts localized_bio fields

// Consultation booking with currency
POST /api/v1/consultations/book {
  advisor_id: string,
  duration_minutes: number,
  locale: string,           // For proper currency display
  currency: string,         // 'EGP', 'SAR', 'EUR', etc.
  amount_cents_local: number // Localized pricing
}
```

### **🚨 Critical Impact on Timeline**

**Additional Development Time Required**:
- **+1 week** for translation files creation (9 locales × advisor content)
- **+3-5 days** for RTL component updates and testing
- **+2-3 days** for multi-currency pricing integration
- **+2 days** for locale-aware routing setup

**New MVP Success Criteria**:
- **Functional in all 9 supported locales**
- **Proper RTL display for Arabic markets** 
- **Currency-appropriate consultation pricing**
- **Language switching works throughout advisor flows**

### **🔧 Implementation Strategy**

**1. Start with English + Arabic (RTL) validation**
**2. Implement multi-currency pricing logic**
**3. Create all translation files in parallel** 
**4. Test advisor discovery/booking in multiple locales**
**5. Validate Cal.com integration works with RTL**

This internationalization integration is **non-negotiable** for SheenApps since we already serve 9 locales with sophisticated regional pricing.

---

## 🔧 **Final Implementation Specifications** (Expert Last-Mile Guidance)

### **✅ What I'm Incorporating from Final Expert Review**

#### **1. Currency Math & Rounding Rules**
**Expert's Insight**: "Lock base SKUs: $9/$19/$35 + per-locale rounding (no decimals in EGP/SAR/AED)"

**Implementation**:
```typescript
// FRONTEND: Consultation pricing with cultural rounding
const CONSULTATION_PRICING = {
  base_usd: [900, 1900, 3500], // cents
  localized: {
    'en': [900, 1900, 3500], // $9.00, $19.00, $35.00
    'ar-eg': [13500, 28500, 52500], // 135 EGP, 285 EGP, 525 EGP (no decimals)
    'ar-sa': [3400, 7100, 13100], // 34 SAR, 71 SAR, 131 SAR (no decimals)  
    'ar-ae': [3300, 7000, 12900], // 33 AED, 70 AED, 129 AED (no decimals)
    'fr': [850, 1750, 3250], // €8.50, €17.50, €32.50 (bankers' rounding)
    'de': [900, 1800, 3400], // €9.00, €18.00, €34.00
  }
}
```

#### **2. Copy-Paste Integration Contracts**
**Expert's Insight**: Minimal webhook contracts with idempotency

```typescript
// BACKEND: Cal.com webhook handler
interface CalComBookingWebhook {
  id: string, // cal_booking_id for idempotency
  eventType: 'BOOKING_CREATED' | 'BOOKING_RESCHEDULED' | 'BOOKING_CANCELLED',
  payload: {
    organizer: { email: string },
    attendees: [{ email: string }],
    startTime: string, // ISO timestamp
    endTime: string,
    metadata: { advisor_id: string, client_id: string, project_id?: string },
    videoCallUrl: string
  }
}

// Action: upsert consultations, create Stripe PaymentIntent, store cal_booking_id
```

#### **3. Simple Policy Copy (In-Product)**
**Expert's Insight**: MVP-appropriate policies

```tsx
// FRONTEND: Policy display in booking flow
const CONSULTATION_POLICIES = {
  cancellation: "Free cancellation up to 24 hours before consultation. Cancellations within 24 hours are charged in full.",
  no_show: "No-shows are charged in full. Advisor no-shows receive full refund or rebooking credit.",
  ownership: "You own all code and assets produced during the consultation session."
}
```

### **❌ What I'm NOT Incorporating from Final Expert Review**

#### **1. T-15 Minute Payment Capture Complexity**
**Expert's Suggestion**: "Capture at T-15 (simple refunds for no-show)"

**Why I Don't Like This for MVP**:
- **Background job complexity**: Need timer-based payment capture systems
- **Edge cases**: Session overruns, network issues, timezone complications
- **MVP simplicity**: Capture on booking is simpler and more predictable

**Alternative**: Capture payment on booking confirmation, manual refunds for no-shows

#### **2. Advanced Fraud Prevention**
**Expert's Suggestion**: "Rate-limit bookings per client per day + unpaid invoice blocking"

**Why I Don't Like This for MVP**:
- **Premature optimization**: Building defenses before understanding abuse patterns
- **Implementation complexity**: Rate limiting, invoice tracking, user management
- **User friction**: Could block legitimate use cases

**Alternative**: Monitor usage, add safeguards if abuse emerges

---

## 🏗️ **Clear FE/BE Implementation Separation**

### **FRONTEND (Next.js App) - Our Implementation**

#### **Phase 1: Core Advisor UI (2 weeks)**

**Advisor Portal Components**:
```tsx
// /src/app/[locale]/advisor/dashboard/page.tsx
- AdvisorDashboard
  - OnboardingChecklist (Stripe + Cal.com + Profile completion)
  - EarningsOverview (monthly total, next payout, advisor cut: 70%)
  - BookingsQueue (upcoming consultations with client info)
  - AvailabilityToggle (accept/pause bookings)

// /src/components/advisor/
- AdvisorProfileEditor (name, bio, skills, specialties, languages)
- StripeConnectOnboarding (redirect to Stripe Express setup)
- CalComConnectionSetup (connect advisor's Cal.com account)
```

**Client-Side Advisor Discovery**:
```tsx
// /src/app/[locale]/advisors/page.tsx
- AdvisorsGrid with RTL support
- SearchFilters (skills, languages, availability, rating)
- AdvisorCard (profile, rating, "Book consultation" CTA)

// /src/app/[locale]/advisors/[advisorId]/book/page.tsx
- CalComEmbed with RTL direction support
- PricingDisplay (localized currency, no decimals for Arabic)
- BookingConfirmation flow
```

**Chat Integration Enhancements**:
```tsx
// /src/components/builder/chat/ (existing chat system)
- ChatParticipants (Client + Advisor + AI distinct avatars)
- AdvisorGuidedPill ("AI response guided by advisor")
- CostPreviewBanner ("Advisor active — consultations billed separately from $9")
- AddAdvisorToProjectButton
```

**i18n Integration**:
```tsx
// /src/messages/*/advisor.json (9 locales)
- Complete translation files for all advisor UI text
- RTL-compatible component styling
- Multi-currency price formatting utilities
```

#### **Phase 2: Admin Console (1 week)**

**Admin Screens**:
```tsx
// /src/app/admin/advisors/ (existing admin structure)
- ApplicationsScreen (approve/reject with portfolio review)
- ConsultationsScreen (search, refund buttons, mark no-show)
- AdvisorsScreen (suspend/reactivate, view CSAT scores)
- FinanceScreen (export payouts CSV, platform revenue tracking)
```

#### **Phase 3: Polish & Testing (1 week)**

```tsx
// Final Integration & Testing
- Mobile responsiveness (all advisor flows)
- Multi-locale testing (minimum: EN + AR-EG)
- Cal.com embed RTL testing
- Email template previews (booking confirmations)
```

### **BACKEND (Worker Team) - External Implementation**

#### **Database Schema & RLS**

```sql
-- Tables (Expert's minimal schema + i18n fields)
CREATE TABLE advisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id),
  display_name text NOT NULL,
  bio text,
  avatar_url text,
  skills text[], -- ['react', 'nextjs', 'typescript']
  specialties text[], -- ['frontend', 'fullstack', 'ecommerce'] 
  languages text[], -- ['en', 'ar-eg', 'fr'] - what advisor speaks
  rating numeric DEFAULT 0,
  review_count int DEFAULT 0,
  approval_status text CHECK (approval_status IN ('pending','approved','rejected')) DEFAULT 'pending',
  stripe_connect_account_id text,
  cal_com_event_type_url text,
  is_accepting_bookings boolean DEFAULT true,
  pricing_mode text CHECK (pricing_mode IN ('platform','custom')) DEFAULT 'platform',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES advisors(id),
  client_id uuid NOT NULL REFERENCES auth.users(id),
  project_id uuid REFERENCES projects(id),
  cal_booking_id text UNIQUE, -- For idempotency
  start_time timestamptz NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes IN (15,30,60)),
  status text CHECK (status IN ('scheduled','in_progress','completed','cancelled','no_show')) DEFAULT 'scheduled',
  video_url text,
  notes text,
  price_cents int NOT NULL,
  currency text DEFAULT 'USD',
  created_at timestamptz DEFAULT now()
);

-- RLS Policies
- Advisors: SELECT own rows, UPDATE own profile
- Consultations: Advisor sees advisor_id = auth.uid(), Client sees client_id = auth.uid()
- Admin: Full access to all tables
```

#### **Integration APIs**

```typescript
// Webhook Endpoints
POST /webhooks/calcom
- Handle BOOKING_CREATED/RESCHEDULED/CANCELLED
- Create/update consultations table
- Create Stripe PaymentIntent for localized amount
- Send booking confirmation email

POST /webhooks/stripe  
- payment_intent.succeeded → keep booking scheduled
- payment_intent.payment_failed → cancel booking + notify parties
- Create Connect transfers on consultation completion

// Advisor Portal APIs
GET  /api/v1/advisors/{id}/dashboard
PUT  /api/v1/advisors/{id}/booking-status
POST /api/v1/advisors/{id}/stripe-connect  
GET  /api/v1/advisors/{id}/earnings
POST /api/v1/consultations/{id}/complete
```

#### **Email Service**

```typescript
// Transactional Email Templates (Localized)
- booking_confirmation (client + advisor, local time + currency)
- booking_rescheduled (both parties)
- booking_cancelled (both parties + refund info)
- consultation_completed (rating prompt to client)
- payout_processed (advisor notification)

// Multi-locale support for all templates
```

#### **Background Jobs**

```typescript
// Payment Processing
- Payment capture on booking (simplified vs T-15 timing)
- Weekly Stripe Connect payouts to advisors
- Failed payment handling + notifications

// Data Cleanup
- Consultation status updates
- Advisor rating calculations
- Payout reconciliation
```

### **🎯 Updated Success Criteria with FE/BE Clarity**

**Frontend Complete When**:
- ✅ Advisor portal works in EN + AR-EG (RTL validated)
- ✅ Client can browse advisors and see localized pricing
- ✅ Cal.com booking embed functions with RTL support
- ✅ Chat shows 3 avatars clearly (Client/Advisor/AI)
- ✅ Admin can approve advisors and manage consultations
- ✅ Mobile responsive across all advisor flows

**Backend Complete When**:
- ✅ Cal.com webhooks create consultations with proper idempotency
- ✅ Stripe payment flow works end-to-end with localized amounts
- ✅ RLS policies enforce proper data access (advisor sees own, client sees own)
- ✅ Email templates send in correct locale with local currency/time
- ✅ Admin APIs support all console operations
- ✅ Weekly payouts process automatically via Stripe Connect

**Integration Complete When**:
- ✅ Book consultation in AR-EG: shows EGP pricing, sends Arabic emails
- ✅ Advisor with incomplete onboarding cannot receive bookings
- ✅ Cancellation policies work: free >24h, charged <24h
- ✅ Admin can refund no-shows and export payout CSV
- ✅ Chat integration shows advisor activity without breaking existing flows

### **📊 Implementation Priority**

**Week 1-2**: Frontend advisor portal + client discovery
**Week 2-3**: Backend APIs + webhook integration  
**Week 3-4**: Admin console + email templates
**Week 4**: Integration testing + multi-locale validation

**Parallel Development**: FE and BE teams can work simultaneously using the API contracts above.