# Template System Implementation Plan

**Date:** 2026-01-19
**Status:** ✅ READY FOR IMPLEMENTATION (Post-strategic review)
**Scope:** Minimal but production-ready template system with 8-12 diverse starter templates
**Last Updated:** 2026-01-19 (After 2 rounds of expert review)

**Expert Reviews Applied:**
- **Round 1 (Tactical):** i18n fixes, PRO gating, token efficiency, versioning
- **Round 2 (Strategic):** Scaffold structure, resource budgeting, shared package architecture

---

## Executive Summary

This plan transforms the current placeholder template system into a functional, user-friendly template library that helps users quickly start building projects with our AI-powered platform. The system will provide 8-12 diverse, minimalist templates across different industries, integrated seamlessly into our existing prompting flow and workspace features.

**Current State:**
- 4 placeholder templates displayed in UI
- Template selection sends `templateId` to backend but not used
- Generic prompt: "Create a ${projectName} from template"
- No template library, no template-specific content

**Target State:**
- 8-12 production-ready templates with real definitions
- Template-enhanced AI prompts with industry-specific guidance
- Template metadata drives intelligent project initialization
- Seamless integration with wizard flow and direct prompting
- Template customization within workspace

---

## Critical Fixes & Strategic Architecture (Expert Reviews)

**Two rounds of expert feedback applied:**
- **Round 1:** Tactical fixes (i18n, PRO gating, token efficiency, versioning)
- **Round 2:** Strategic architecture (scaffolds, resource budgeting, single source of truth)

### Round 1: Tactical Fixes

**Expert Feedback Applied:** The following critical issues have been addressed based on expert review:

### ✅ Fixed: Translation Key Mismatches
**Problem:** Original plan used kebab-case categories (`'real-estate'`) but camelCase translation keys (`realEstate`), causing runtime failures.

**Solution:** Use explicit `categoryKey` field for i18n lookups, separate from internal `category` identifier. All templates now have consistent translation key mapping.

### ✅ Fixed: Server-Side PRO Template Enforcement
**Problem:** Original plan only disabled PRO templates in UI. Free users could bypass by directly POSTing `templateId: 'saas'`.

**Solution:** Added mandatory server-side gating in `/api/projects` route that validates user plan before processing PRO templates. Returns 402 error with upgrade context.

### ✅ Fixed: Prompt Token Bloat
**Problem:** Original prompt construction appended long system context + numbered feature lists, increasing costs and potentially confusing Claude.

**Solution:** Condensed prompts to ~200 tokens max per template. Moved from verbose paragraphs to compact bullet format. Features capped at 6 items (not 8-10).

### ✅ Added: Template Versioning
**Problem:** No way to track which template version created a project, making debugging and regression analysis impossible.

**Solution:** Every template now has `version: 1` in metadata. Stored on project/build records for analytics and troubleshooting.

---

### Round 2: Strategic Architecture Improvements

**Expert Feedback (Strategic):** "Strategically and architecture-wise: yes, the shape is right. Templates as 'prompting + metadata' is the right primitive for an AI-first builder. But 3 strategic pivots will future-proof you hard."

#### ✅ IMPLEMENTED: Single Source of Truth (Shared Package)

**Expert Quote:** *"If you implement only one strategic improvement now: add templateVersion + make templates a shared single source of truth. That's the keystone that prevents future chaos."*

**Decision:** Move templates to `packages/templates/` (shared between Next.js and Worker)

**Why This Changed from Round 1:**
- Round 1 decision: Keep in Next.js only (worker doesn't need it)
- Round 2 insight: Worker WILL need it for:
  - Scaffold validation ("did we generate all expected pages?")
  - Resource budgeting (PRO templates = more steps/tokens)
  - Analytics consistency (templateId + version in logs)
  - A/B testing & hotfixes without dual deploys

**New Architecture:**
```
sheenapps/
├── packages/
│   └── templates/              # ✅ NEW: Shared package
│       ├── src/
│       │   ├── types.ts        # TemplateDefinition interface
│       │   ├── library.ts      # TEMPLATE_LIBRARY constant
│       │   ├── helpers.ts      # getTemplate(), isTemplateAllowedForPlan()
│       │   └── index.ts        # Public exports
│       └── package.json        # @sheenapps/templates
├── sheenappsai/
│   └── [imports from @sheenapps/templates]
└── sheenapps-claude-worker/
    └── [imports from @sheenapps/templates]
```

**Benefits:**
- ✅ No drift between Next.js and Worker
- ✅ Single deploy to update all templates
- ✅ Versioned dataset for analytics
- ✅ Foundation for template registry/A/B testing

---

#### ✅ IMPLEMENTED: Scaffold Structure (Deterministic Builds)

**Expert Quote:** *"Right now the template is mostly systemContext + keyFeatures. That works, but it's brittle: the model can interpret it differently build-to-build. Add a structured scaffold spec."*

**Addition:** `scaffold` field with expected structure

**Schema Enhancement:**
```typescript
export interface TemplateScaffold {
  // Pages/routes expected in final build
  pages: string[]
  // Example: ['/', '/products', '/cart', '/checkout', '/admin']

  // Core entities/data models
  entities: string[]
  // Example: ['Product', 'Order', 'Customer', 'Cart']

  // User flows (journey steps)
  flows: string[]
  // Example: ['Browse products', 'Add to cart', 'Checkout', 'Track order']

  // User roles (if multi-tenant)
  roles?: string[]
  // Example: ['customer', 'admin']
}

export interface TemplateDefinition {
  // ... existing fields
  scaffold: TemplateScaffold  // ✅ NEW
}
```

**Why This Matters:**
- **Determinism:** AI has clear structure to build against (not just free-form prompt)
- **Analytics:** Can detect "missing checkout page" vs just "build failed"
- **Debugging:** Expected structure vs actual structure comparison
- **Validation:** Worker can verify scaffold completeness

**Implementation Note:**
- Worker doesn't need to parse scaffold immediately (Phase 1 MVP)
- Just store it in metadata + log it
- Phase 2: Worker validates generated structure matches scaffold

---

#### ✅ IMPLEMENTED: Resource Budgeting (Template Tier = Cost Tier)

**Expert Quote:** *"Template tier should drive limits + queue priority + max build steps. This keeps your economics aligned and prevents PRO templates from becoming 'free users can still burn infra by retrying.'"*

**Addition:** `budget` field with resource limits

**Schema Enhancement:**
```typescript
export interface TemplateBudget {
  // Maximum build steps (API calls to Claude)
  maxSteps: number
  // Example: free = 20 steps, PRO = 50 steps

  // Estimated token consumption (for billing)
  estimatedTokens: number
  // Example: free = 50k tokens, PRO = 200k tokens

  // Maximum build time (minutes)
  maxBuildTime: number
  // Example: free = 10min, PRO = 30min

  // Allowed phases (optional feature flags)
  phases?: {
    auth: boolean      // User authentication
    payments: boolean  // Payment processing
    admin: boolean     // Admin panel
    multiTenant: boolean  // Multi-tenancy
  }
}

export interface TemplateDefinition {
  // ... existing fields
  budget: TemplateBudget  // ✅ NEW
}
```

**How This Works:**
1. User selects template → Next.js checks `isTemplateAllowedForPlan()`
2. If allowed → API passes `budget` to worker in build metadata
3. Worker enforces:
   - Step count limit (stop after maxSteps API calls)
   - Time limit (already exists, now configurable per template)
   - Feature flags (skip auth/payments for free templates)

**Economics:**
- Free templates: Simple (20 steps, 50k tokens, 10min)
- PRO templates: Complex (50 steps, 200k tokens, 30min)
- Prevents abuse: Free users can't retry PRO templates to burn credits

---

### Strategic Summary

**Mature Architecture Vision:**
```
Template Registry (versioned, shared package)
    ↓
Template Scaffold (structured: pages, entities, flows)
    ↓
Resource Budget (tier-based limits)
    ↓
Orchestrator enforces budgets
    ↓
Worker builds deterministically (validates scaffold)
    ↓
Analytics keyed by {templateId, templateVersion}
```

**Implementation Path:**
- **Phase 1 (MVP):** Shared package + scaffold metadata + budget metadata (stored but not enforced yet)
- **Phase 2:** Worker validates scaffold + enforces budgets
- **Phase 3:** Template A/B testing + community templates

**Why This Is Future-Proof:**
- Can add new templates without deploying both apps
- Can hotfix template prompts instantly
- Can A/B test templates (serve different versions to different users)
- Can add community/marketplace templates (just add to registry)
- Can enforce economics (PRO templates cost more to build)

---

## Template Library Design

### Template Categories & Ideas

Based on market research and user needs analysis, here are **12 diverse template recommendations**:

#### Tier: Free (8 templates)

1. **🛍️ E-commerce Store** (متجر إلكتروني)
   - Category: Retail
   - Use case: Product catalog, shopping cart, checkout
   - Target: Small businesses selling physical/digital products
   - Key features: Product listings, cart, payment integration, inventory basics

2. **📅 Booking System** (نظام حجوزات)
   - Category: Services
   - Use case: Appointment scheduling for salons, clinics, consultants
   - Target: Service-based businesses
   - Key features: Calendar, time slots, booking forms, reminders

3. **🍕 Restaurant & Food Ordering** (مطعم وطلبات الطعام)
   - Category: Food & Beverage
   - Use case: Menu display, online ordering, delivery tracking
   - Target: Restaurants, cafes, food trucks
   - Key features: Menu builder, order management, delivery zones

4. **🎨 Portfolio & Creative Showcase** (معرض أعمال إبداعي)
   - Category: Creative Services
   - Use case: Photographers, designers, artists displaying work
   - Target: Freelancers and creative professionals
   - Key features: Gallery, project case studies, contact forms

5. **📚 Online Course Platform** (منصة دورات تعليمية)
   - Category: Education
   - Use case: Course creation, student enrollment, progress tracking
   - Target: Educators, trainers, content creators
   - Key features: Course catalog, lessons, quizzes, progress tracking

6. **🏢 Business Landing Page** (صفحة هبوط للشركات)
   - Category: Corporate
   - Use case: Company website with services, about, contact
   - Target: SMBs, startups, agencies
   - Key features: Hero section, services grid, testimonials, contact

7. **💪 Gym & Fitness Studio** (صالة رياضة واستوديو لياقة)
   - Category: Health & Wellness
   - Use case: Class schedules, membership plans, trainer profiles
   - Target: Gyms, yoga studios, fitness coaches
   - Key features: Class timetable, membership tiers, trainer bios

8. **📰 Blog & Content Hub** (مدونة ومركز محتوى)
   - Category: Publishing
   - Use case: Articles, news, personal blog
   - Target: Writers, journalists, content creators
   - Key features: Article feed, categories, search, author profiles

#### Tier: PRO (4 templates)

9. **💼 SaaS Platform** (منصة SaaS)
   - Category: Technology
   - Use case: Subscription software with user management
   - Target: Tech startups, software companies
   - Key features: User dashboard, subscription plans, analytics, admin panel
   - Why PRO: Complex architecture (auth, subscriptions, multi-tenancy)

10. **🏪 Marketplace (Multi-vendor)** (متجر متعدد البائعين)
    - Category: Platform
    - Use case: Connect buyers and sellers with commissions
    - Target: Marketplace operators
    - Key features: Vendor dashboards, product approval, commission tracking
    - Why PRO: Complex (multi-user roles, payments splitting, moderation)

11. **🏠 Real Estate Listings** (عقارات ومعارض عقارية)
    - Category: Real Estate
    - Use case: Property listings, agent profiles, search/filters
    - Target: Real estate agencies, property managers
    - Key features: Property search, map integration, lead capture, virtual tours
    - Why PRO: Advanced features (maps, filters, CRM integration)

12. **🎟️ Events & Ticketing** (فعاليات وبيع التذاكر)
    - Category: Events
    - Use case: Event listings, ticket sales, attendee management
    - Target: Event organizers, venues, conference planners
    - Key features: Event calendar, ticket tiers, check-in system, seating
    - Why PRO: Payment processing, ticket validation, capacity management

### Template Tier Strategy

**Free Tier (8 templates):**
- Simple, single-purpose applications
- Standard features, minimal complexity
- Great starting points for small businesses
- Accessible to all users

**PRO Tier (4 templates):**
- Complex multi-user systems
- Advanced features (subscriptions, multi-tenancy, commissions)
- Require more AI credits to build
- Incentivize plan upgrades

---

## Template Schema Design

### Template Definition Structure

```typescript
// src/lib/templates/types.ts

export type TemplateId =
  | 'ecommerce'
  | 'booking'
  | 'restaurant'
  | 'portfolio'
  | 'course-platform'
  | 'business-landing'
  | 'gym-fitness'
  | 'blog'
  | 'saas'
  | 'marketplace'
  | 'real-estate'
  | 'events-ticketing'

export type TemplateTier = 'free' | 'pro'

export type TemplateCategory =
  | 'retail'
  | 'services'
  | 'food'
  | 'creative'
  | 'education'
  | 'corporate'
  | 'health'
  | 'publishing'
  | 'technology'
  | 'platform'
  | 'real-estate'
  | 'events'

// ✅ NEW: Scaffold structure for deterministic builds
export interface TemplateScaffold {
  pages: string[]       // Expected pages/routes
  entities: string[]    // Core data models
  flows: string[]       // User journeys
  roles?: string[]      // User roles (if multi-tenant)
}

// ✅ NEW: Resource budgeting (template tier = cost tier)
export interface TemplateBudget {
  maxSteps: number           // Maximum build steps (Claude API calls)
  estimatedTokens: number    // Estimated token consumption
  maxBuildTime: number       // Maximum build time (minutes)
  phases?: {                 // Allowed features (optional)
    auth?: boolean
    payments?: boolean
    admin?: boolean
    multiTenant?: boolean
  }
}

export interface TemplateDefinition {
  id: TemplateId
  version: number              // Template version for debugging/analytics (start at 1)
  tier: TemplateTier
  category: TemplateCategory
  categoryKey: string          // Translation key for category (e.g., 'realEstate' for i18n lookup)

  // Display metadata (i18n keys for translation)
  name: string                 // e.g., "templates.ecommerce.name"
  description: string          // e.g., "templates.ecommerce.description"
  emoji: string                // Visual identifier

  // ✅ NEW: Structured scaffold (expected build output)
  scaffold: TemplateScaffold

  // ✅ NEW: Resource budgeting (enforced by worker)
  budget: TemplateBudget

  // Business intelligence hints for AI (KEEP CONCISE - max ~200 tokens)
  prompting: {
    // Enhanced prompt that AI receives (CONCISE - 1-2 sentences max)
    systemContext: string
    // Example: "E-commerce store with product catalog, cart, checkout, and payment integration."

    // Suggested features AI should prioritize (MAX 6 items for token efficiency)
    keyFeatures: string[]
    // Example: ["Product catalog", "Shopping cart", "Checkout", "Payments", "Order tracking", "Admin panel"]

    // Industry-specific patterns (OPTIONAL - omit if not critical)
    industryPatterns?: {
      layout?: 'grid' | 'list' | 'card' | 'masonry'
      primaryActions?: string[]  // Max 3-4 actions
      commonSections?: string[]  // Max 4-5 sections
    }

    // Styling hints (OPTIONAL - keep minimal)
    styleGuidance?: {
      colorScheme?: 'vibrant' | 'professional' | 'minimal' | 'warm' | 'modern'
      tone?: 'friendly' | 'professional' | 'creative' | 'authoritative'
    }
  }

  // Starter files (optional - for future enhancement)
  starterFiles?: {
    'README.md'?: string
    'components/example.tsx'?: string
    // Can be populated later with actual template code
  }

  // Metadata for filtering/analytics
  metadata: {
    complexity: 'simple' | 'moderate' | 'complex'
    estimatedBuildTime: number  // in minutes (surface in UI for PRO templates)
    popularityRank?: number
    tags: string[]              // e.g., ["commerce", "payments", "inventory"]
  }
}
```

### Template Library Implementation

```typescript
// src/lib/templates/template-library.ts

import type { TemplateDefinition, TemplateId } from './types'

export const TEMPLATE_LIBRARY: Record<TemplateId, TemplateDefinition> = {
  'ecommerce': {
    id: 'ecommerce',
    version: 1,
    tier: 'free',
    category: 'retail',
    categoryKey: 'retail',  // Matches templates.categories.retail in i18n
    name: 'templates.ecommerce.name',
    description: 'templates.ecommerce.description',
    emoji: '🛍️',

    // ✅ NEW: Scaffold (expected structure)
    scaffold: {
      pages: ['/', '/products', '/products/:id', '/cart', '/checkout', '/orders'],
      entities: ['Product', 'Cart', 'Order', 'Customer'],
      flows: [
        'Browse products',
        'View product details',
        'Add to cart',
        'Checkout',
        'Track order'
      ],
      roles: ['customer', 'admin']
    },

    // ✅ NEW: Resource budget
    budget: {
      maxSteps: 25,              // Free tier: moderate complexity
      estimatedTokens: 75000,    // ~75k tokens for e-commerce
      maxBuildTime: 15,          // 15 minutes max
      phases: {
        auth: true,              // Customer accounts allowed
        payments: true,          // Payment integration allowed
        admin: false,            // No admin panel in free tier
        multiTenant: false       // Single-tenant only
      }
    },

    prompting: {
      // CONDENSED: ~30 tokens instead of 80
      systemContext: 'E-commerce store with product catalog, cart, checkout, payments, and order management.',
      // REDUCED: 6 features instead of 8 (token efficiency)
      keyFeatures: [
        'Product catalog with search',
        'Shopping cart',
        'Checkout flow',
        'Payment integration',
        'Order tracking',
        'Customer accounts'
      ]
    },

    metadata: {
      complexity: 'moderate',
      estimatedBuildTime: 15,
      tags: ['ecommerce', 'products', 'payments', 'cart', 'inventory']
    }
  },

  'booking': {
    id: 'booking',
    tier: 'free',
    category: 'services',
    name: 'templates.booking.name',
    description: 'templates.booking.description',
    emoji: '📅',
    prompting: {
      systemContext: 'Build a booking and appointment scheduling system for service-based businesses like salons, clinics, or consultants. Include calendar view, time slot selection, booking forms, and appointment confirmation.',
      keyFeatures: [
        'Service selection with duration and pricing',
        'Calendar view showing availability',
        'Time slot picker with real-time availability',
        'Booking form with customer details',
        'Email/SMS confirmation and reminders',
        'Customer dashboard to manage bookings',
        'Admin panel to view and manage appointments',
        'Cancellation and rescheduling options'
      ],
      industryPatterns: {
        layout: 'card',
        primaryActions: ['Book now', 'Choose date/time', 'Confirm booking', 'Reschedule'],
        commonSections: ['Service selection', 'Calendar', 'Booking form', 'Confirmation page']
      },
      styleGuidance: {
        colorScheme: 'professional',
        tone: 'friendly'
      }
    },
    metadata: {
      complexity: 'moderate',
      estimatedBuildTime: 12,
      tags: ['booking', 'appointments', 'calendar', 'scheduling', 'services']
    }
  },

  'restaurant': {
    id: 'restaurant',
    tier: 'free',
    category: 'food',
    name: 'templates.restaurant.name',
    description: 'templates.restaurant.description',
    emoji: '🍕',
    prompting: {
      systemContext: 'Build a restaurant and food ordering platform. Include menu display with categories, online ordering with customization options, cart management, checkout, and order tracking.',
      keyFeatures: [
        'Digital menu with categories and items',
        'Item details with photos, descriptions, prices',
        'Customization options (toppings, sizes, etc.)',
        'Shopping cart with order summary',
        'Delivery address and time selection',
        'Payment integration',
        'Order status tracking',
        'Restaurant info and contact details'
      ],
      industryPatterns: {
        layout: 'list',
        primaryActions: ['Add to order', 'Customize', 'Checkout', 'Track order'],
        commonSections: ['Hero with restaurant info', 'Menu categories', 'Popular items', 'Location/hours']
      },
      styleGuidance: {
        colorScheme: 'warm',
        tone: 'friendly'
      }
    },
    metadata: {
      complexity: 'simple',
      estimatedBuildTime: 10,
      tags: ['restaurant', 'food', 'menu', 'ordering', 'delivery']
    }
  },

  'portfolio': {
    id: 'portfolio',
    tier: 'free',
    category: 'creative',
    name: 'templates.portfolio.name',
    description: 'templates.portfolio.description',
    emoji: '🎨',
    prompting: {
      systemContext: 'Build a portfolio website for creative professionals like photographers, designers, or artists. Include a gallery to showcase work, project case studies, about section, and contact form.',
      keyFeatures: [
        'Image gallery with masonry/grid layout',
        'Project pages with detailed case studies',
        'Filterable portfolio by category/tag',
        'About page with bio and skills',
        'Contact form with email integration',
        'Responsive design optimized for images',
        'Social media links',
        'Testimonials section'
      ],
      industryPatterns: {
        layout: 'masonry',
        primaryActions: ['View project', 'Contact me', 'Download resume'],
        commonSections: ['Hero with name/tagline', 'Featured work', 'Portfolio grid', 'About', 'Contact']
      },
      styleGuidance: {
        colorScheme: 'minimal',
        tone: 'creative'
      }
    },
    metadata: {
      complexity: 'simple',
      estimatedBuildTime: 8,
      tags: ['portfolio', 'gallery', 'creative', 'showcase', 'photography']
    }
  },

  'course-platform': {
    id: 'course-platform',
    tier: 'free',
    category: 'education',
    name: 'templates.coursePlatform.name',
    description: 'templates.coursePlatform.description',
    emoji: '📚',
    prompting: {
      systemContext: 'Build an online course platform for educators and content creators. Include course catalog, lesson pages, progress tracking, quizzes, and student enrollment.',
      keyFeatures: [
        'Course catalog with descriptions and pricing',
        'Course detail pages with curriculum',
        'Video/text lesson pages',
        'Progress tracking for students',
        'Quizzes and assessments',
        'Student enrollment and payment',
        'Instructor dashboard',
        'Certificates upon completion'
      ],
      industryPatterns: {
        layout: 'card',
        primaryActions: ['Enroll now', 'Start lesson', 'Mark complete', 'Take quiz'],
        commonSections: ['Course catalog', 'Course details', 'Lesson viewer', 'Student dashboard']
      },
      styleGuidance: {
        colorScheme: 'professional',
        tone: 'authoritative'
      }
    },
    metadata: {
      complexity: 'moderate',
      estimatedBuildTime: 14,
      tags: ['education', 'courses', 'learning', 'teaching', 'video']
    }
  },

  'business-landing': {
    id: 'business-landing',
    tier: 'free',
    category: 'corporate',
    name: 'templates.businessLanding.name',
    description: 'templates.businessLanding.description',
    emoji: '🏢',
    prompting: {
      systemContext: 'Build a professional business landing page for companies, startups, or agencies. Include services overview, team section, testimonials, and contact form.',
      keyFeatures: [
        'Hero section with value proposition',
        'Services/features grid with icons',
        'About section with company story',
        'Team member profiles',
        'Client testimonials',
        'Call-to-action sections',
        'Contact form with validation',
        'Footer with social links'
      ],
      industryPatterns: {
        layout: 'card',
        primaryActions: ['Get started', 'Contact us', 'Learn more', 'Request demo'],
        commonSections: ['Hero', 'Services', 'About', 'Team', 'Testimonials', 'Contact', 'Footer']
      },
      styleGuidance: {
        colorScheme: 'professional',
        tone: 'professional'
      }
    },
    metadata: {
      complexity: 'simple',
      estimatedBuildTime: 7,
      tags: ['business', 'landing', 'corporate', 'services', 'agency']
    }
  },

  'gym-fitness': {
    id: 'gym-fitness',
    tier: 'free',
    category: 'health',
    name: 'templates.gymFitness.name',
    description: 'templates.gymFitness.description',
    emoji: '💪',
    prompting: {
      systemContext: 'Build a website for gyms, yoga studios, or fitness coaches. Include class schedules, membership plans, trainer profiles, and booking integration.',
      keyFeatures: [
        'Class timetable with schedule grid',
        'Class details with instructor info',
        'Membership plan comparison',
        'Trainer/instructor profiles',
        'Facility photos and amenities',
        'Sign-up and payment integration',
        'Member portal for class booking',
        'Location and contact info'
      ],
      industryPatterns: {
        layout: 'card',
        primaryActions: ['Book class', 'Join now', 'View schedule', 'Free trial'],
        commonSections: ['Hero', 'Classes', 'Trainers', 'Membership plans', 'Facilities', 'Contact']
      },
      styleGuidance: {
        colorScheme: 'vibrant',
        tone: 'friendly'
      }
    },
    metadata: {
      complexity: 'simple',
      estimatedBuildTime: 9,
      tags: ['fitness', 'gym', 'health', 'classes', 'membership']
    }
  },

  'blog': {
    id: 'blog',
    tier: 'free',
    category: 'publishing',
    name: 'templates.blog.name',
    description: 'templates.blog.description',
    emoji: '📰',
    prompting: {
      systemContext: 'Build a blog and content publishing platform. Include article feed, category navigation, search functionality, and author profiles.',
      keyFeatures: [
        'Article feed with pagination',
        'Article detail pages with rich text',
        'Category and tag filtering',
        'Search functionality',
        'Author profile pages',
        'Related posts suggestions',
        'Comments section',
        'Newsletter subscription',
        'Social sharing buttons'
      ],
      industryPatterns: {
        layout: 'list',
        primaryActions: ['Read more', 'Share', 'Comment', 'Subscribe'],
        commonSections: ['Featured posts', 'Latest articles', 'Categories', 'Author bio', 'Newsletter']
      },
      styleGuidance: {
        colorScheme: 'minimal',
        tone: 'authoritative'
      }
    },
    metadata: {
      complexity: 'simple',
      estimatedBuildTime: 8,
      tags: ['blog', 'content', 'publishing', 'articles', 'writing']
    }
  },

  // ✅ PRO TEMPLATE EXAMPLE: Shows increased budget/complexity
  'saas': {
    id: 'saas',
    version: 1,
    tier: 'pro',
    category: 'technology',
    categoryKey: 'technology',
    name: 'templates.saas.name',
    description: 'templates.saas.description',
    emoji: '💼',

    // ✅ PRO: More complex scaffold
    scaffold: {
      pages: [
        '/',
        '/pricing',
        '/signup',
        '/login',
        '/dashboard',
        '/settings',
        '/billing',
        '/admin',
        '/admin/users',
        '/admin/analytics'
      ],
      entities: ['User', 'Organization', 'Subscription', 'Invoice', 'Usage', 'Feature'],
      flows: [
        'Sign up',
        'Choose plan',
        'Complete onboarding',
        'Access dashboard',
        'Manage subscription',
        'View analytics',
        'Admin: Manage users'
      ],
      roles: ['user', 'admin', 'org-admin']
    },

    // ✅ PRO: Higher resource budget
    budget: {
      maxSteps: 60,              // PRO tier: complex multi-page app
      estimatedTokens: 250000,   // ~250k tokens for SaaS platform
      maxBuildTime: 30,          // 30 minutes max
      phases: {
        auth: true,              // Full authentication system
        payments: true,          // Subscription billing
        admin: true,             // Admin panel included
        multiTenant: true        // Organization support
      }
    },

    prompting: {
      // CONDENSED: Even complex templates kept concise
      systemContext: 'SaaS platform with subscriptions, user dashboard, analytics, and admin panel.',
      keyFeatures: [
        'User authentication',
        'Subscription plans',
        'User dashboard',
        'Usage analytics',
        'Admin panel',
        'Team/org support'
      ]
    },

    metadata: {
      complexity: 'complex',
      estimatedBuildTime: 30,  // Note: Higher than free tier
      tags: ['saas', 'subscription', 'dashboard', 'analytics', 'multi-tenant']
    }
  },

  'marketplace': {
    id: 'marketplace',
    tier: 'pro',
    category: 'platform',
    name: 'templates.marketplace.name',
    description: 'templates.marketplace.description',
    emoji: '🏪',
    prompting: {
      systemContext: 'Build a multi-vendor marketplace platform that connects buyers and sellers. Include vendor dashboards, product approval workflows, commission tracking, and payment splitting.',
      keyFeatures: [
        'Vendor registration and onboarding',
        'Vendor dashboard to manage products',
        'Product approval and moderation system',
        'Buyer product search and filtering',
        'Shopping cart and checkout',
        'Payment splitting with commission',
        'Order management for vendors',
        'Rating and review system',
        'Admin panel for platform management',
        'Analytics for vendors and platform'
      ],
      industryPatterns: {
        layout: 'grid',
        primaryActions: ['Become a seller', 'Browse products', 'Add to cart', 'Buy now'],
        commonSections: ['Vendor listings', 'Product catalog', 'Seller dashboard', 'Admin panel']
      },
      styleGuidance: {
        colorScheme: 'vibrant',
        tone: 'friendly'
      }
    },
    metadata: {
      complexity: 'complex',
      estimatedBuildTime: 30,
      tags: ['marketplace', 'multi-vendor', 'commission', 'platform', 'ecommerce']
    }
  },

  'real-estate': {
    id: 'real-estate',
    tier: 'pro',
    category: 'real-estate',
    name: 'templates.realEstate.name',
    description: 'templates.realEstate.description',
    emoji: '🏠',
    prompting: {
      systemContext: 'Build a real estate listing platform for properties. Include property search with advanced filters, map integration, agent profiles, lead capture, and virtual tour support.',
      keyFeatures: [
        'Property listings with photos and details',
        'Advanced search with filters (price, location, type, etc.)',
        'Map view with property markers',
        'Property detail pages with virtual tours',
        'Agent/agency profiles',
        'Lead capture forms and inquiries',
        'Favorite/saved properties',
        'Mortgage calculator',
        'Agent dashboard to manage listings',
        'Email alerts for new listings'
      ],
      industryPatterns: {
        layout: 'grid',
        primaryActions: ['View details', 'Schedule viewing', 'Contact agent', 'Save property'],
        commonSections: ['Search filters', 'Property grid', 'Map view', 'Agent profiles', 'Featured listings']
      },
      styleGuidance: {
        colorScheme: 'professional',
        tone: 'professional'
      }
    },
    metadata: {
      complexity: 'complex',
      estimatedBuildTime: 20,
      tags: ['real-estate', 'properties', 'listings', 'map', 'agents']
    }
  },

  'events-ticketing': {
    id: 'events-ticketing',
    tier: 'pro',
    category: 'events',
    name: 'templates.eventsTicketing.name',
    description: 'templates.eventsTicketing.description',
    emoji: '🎟️',
    prompting: {
      systemContext: 'Build an events and ticketing platform. Include event listings, ticket sales with tiers, attendee management, check-in system, and seating arrangement.',
      keyFeatures: [
        'Event calendar and listings',
        'Event detail pages with info and schedule',
        'Ticket selection with multiple tiers',
        'Seating chart and seat selection',
        'Secure checkout and payment',
        'E-ticket generation and QR codes',
        'Attendee registration forms',
        'Check-in system for organizers',
        'Event organizer dashboard',
        'Capacity management and waiting lists',
        'Email notifications and reminders'
      ],
      industryPatterns: {
        layout: 'card',
        primaryActions: ['Buy tickets', 'Register', 'Select seats', 'View events'],
        commonSections: ['Event calendar', 'Featured events', 'Ticket selection', 'Checkout', 'My tickets']
      },
      styleGuidance: {
        colorScheme: 'vibrant',
        tone: 'friendly'
      }
    },
    metadata: {
      complexity: 'complex',
      estimatedBuildTime: 22,
      tags: ['events', 'ticketing', 'registration', 'calendar', 'attendees']
    }
  }
}

// Helper functions
export function getTemplate(id: TemplateId): TemplateDefinition | undefined {
  return TEMPLATE_LIBRARY[id]
}

export function getAllTemplates(): TemplateDefinition[] {
  return Object.values(TEMPLATE_LIBRARY)
}

export function getFreeTemplates(): TemplateDefinition[] {
  return getAllTemplates().filter(t => t.tier === 'free')
}

export function getProTemplates(): TemplateDefinition[] {
  return getAllTemplates().filter(t => t.tier === 'pro')
}

export function getTemplatesByCategory(category: TemplateCategory): TemplateDefinition[] {
  return getAllTemplates().filter(t => t.category === category)
}

// ✅ NEW: Server-side PRO template validation (CRITICAL FIX)
export function isTemplateAllowedForPlan(
  template: TemplateDefinition,
  userPlan: 'free' | 'starter' | 'growth' | 'scale'
): boolean {
  // PRO templates require paid plan
  if (template.tier === 'pro' && userPlan === 'free') {
    return false
  }
  return true
}

// ✅ NEW: Validate template ID exists
export function isValidTemplateId(id: string): id is TemplateId {
  return id in TEMPLATE_LIBRARY
}

// ✅ NEW: Get PRO template IDs (for worker validation)
export function getProTemplateIds(): TemplateId[] {
  return getProTemplates().map(t => t.id)
}
```

---

## Translation Keys Design

### English (en.json)

```json
{
  "templates": {
    "title": "Or choose a template",
    "subtitle": "Get started faster with industry-specific templates",
    "viewAll": "View all templates",
    "categories": {
      "retail": "Retail",
      "services": "Services",
      "food": "Food & Beverage",
      "creative": "Creative",
      "education": "Education",
      "corporate": "Corporate",
      "health": "Health & Wellness",
      "publishing": "Publishing",
      "technology": "Technology",
      "platform": "Platform",
      "realEstate": "Real Estate",
      "events": "Events"
    },
    "ecommerce": {
      "name": "E-commerce Store",
      "description": "Sell products online with payments & inventory"
    },
    "booking": {
      "name": "Booking System",
      "description": "Appointment scheduling for service businesses"
    },
    "restaurant": {
      "name": "Restaurant & Food Ordering",
      "description": "Menu display and online food ordering"
    },
    "portfolio": {
      "name": "Portfolio & Showcase",
      "description": "Display creative work and projects"
    },
    "coursePlatform": {
      "name": "Online Course Platform",
      "description": "Create and sell courses with progress tracking"
    },
    "businessLanding": {
      "name": "Business Landing Page",
      "description": "Professional website for companies and agencies"
    },
    "gymFitness": {
      "name": "Gym & Fitness Studio",
      "description": "Class schedules and membership management"
    },
    "blog": {
      "name": "Blog & Content Hub",
      "description": "Publish articles and build your audience"
    },
    "saas": {
      "name": "SaaS Platform",
      "description": "Subscription software with user management"
    },
    "marketplace": {
      "name": "Marketplace (Multi-vendor)",
      "description": "Connect buyers and sellers with commissions"
    },
    "realEstate": {
      "name": "Real Estate Listings",
      "description": "Property search with maps and agent profiles"
    },
    "eventsTicketing": {
      "name": "Events & Ticketing",
      "description": "Event listings and ticket sales"
    }
  }
}
```

### Arabic Egypt (ar-eg.json)

```json
{
  "templates": {
    "title": "أو اختر قالب جاهز",
    "subtitle": "ابدأ بسرعة أكبر مع قوالب متخصصة",
    "viewAll": "عرض جميع القوالب",
    "categories": {
      "retail": "تجزئة",
      "services": "خدمات",
      "food": "مطاعم وأغذية",
      "creative": "إبداعي",
      "education": "تعليم",
      "corporate": "شركات",
      "health": "صحة ولياقة",
      "publishing": "نشر ومحتوى",
      "technology": "تكنولوجيا",
      "platform": "منصة",
      "realEstate": "عقارات",
      "events": "فعاليات"
    },
    "ecommerce": {
      "name": "متجر إلكتروني",
      "description": "بيع المنتجات أونلاين مع الدفع والمخزون"
    },
    "booking": {
      "name": "نظام حجوزات",
      "description": "جدولة المواعيد لشركات الخدمات"
    },
    "restaurant": {
      "name": "مطعم وطلبات الطعام",
      "description": "عرض القائمة وطلب الطعام أونلاين"
    },
    "portfolio": {
      "name": "معرض أعمال إبداعي",
      "description": "عرض أعمالك ومشاريعك الإبداعية"
    },
    "coursePlatform": {
      "name": "منصة دورات تعليمية",
      "description": "إنشاء وبيع الدورات مع تتبع التقدم"
    },
    "businessLanding": {
      "name": "صفحة هبوط للشركات",
      "description": "موقع احترافي للشركات والوكالات"
    },
    "gymFitness": {
      "name": "صالة رياضة واستوديو لياقة",
      "description": "جداول الحصص وإدارة العضويات"
    },
    "blog": {
      "name": "مدونة ومركز محتوى",
      "description": "نشر المقالات وبناء جمهورك"
    },
    "saas": {
      "name": "منصة SaaS",
      "description": "برنامج اشتراكات مع إدارة المستخدمين"
    },
    "marketplace": {
      "name": "متجر متعدد البائعين",
      "description": "ربط المشترين والبائعين مع العمولات"
    },
    "realEstate": {
      "name": "عقارات ومعارض عقارية",
      "description": "بحث العقارات مع الخرائط وملفات الوكلاء"
    },
    "eventsTicketing": {
      "name": "فعاليات وبيع التذاكر",
      "description": "قوائم الفعاليات وبيع التذاكر"
    }
  }
}
```

*(Repeat similar structure for all 9 locales: ar, ar-sa, ar-ae, fr, fr-ma, es, de)*

---

## Architecture Changes

### 1. Frontend Changes (sheenappsai)

#### File Structure

```
sheenappsai/
├── src/
│   ├── lib/
│   │   └── templates/
│   │       ├── types.ts               # TypeScript types
│   │       ├── template-library.ts    # Template definitions
│   │       └── template-helpers.ts    # Helper functions
│   ├── components/
│   │   └── builder/
│   │       ├── new-project-page.tsx   # Update to use template library
│   │       └── template-card.tsx      # NEW: Individual template card component
│   └── i18n/
│       └── locales/
│           ├── en.json                # Add template translations
│           ├── ar-eg.json
│           ├── ar-sa.json
│           ├── ar-ae.json
│           ├── ar.json
│           ├── fr.json
│           ├── fr-ma.json
│           ├── es.json
│           └── de.json
```

#### new-project-page.tsx Updates

```typescript
// Update createTemplates function to pull from library
import { getAllTemplates, getTemplate } from '@/lib/templates/template-library'
import type { TemplateDefinition } from '@/lib/templates/types'

// Replace hardcoded templates with library
const templates = getAllTemplates()

// Update template card rendering to show real metadata
{templates.map((template) => (
  <TemplateCard
    key={template.id}
    template={template}
    onSelect={handleTemplateSelect}
    disabled={template.tier === 'pro' && user?.plan === 'free'}
  />
))}
```

#### template-card.tsx (NEW)

```typescript
'use client'

import { Card, CardContent } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import type { TemplateDefinition } from '@/lib/templates/types'
import { useTranslations } from 'next-intl'

interface TemplateCardProps {
  template: TemplateDefinition
  onSelect: (templateId: string, tier: 'free' | 'pro') => void
  disabled?: boolean
}

export function TemplateCard({ template, onSelect, disabled }: TemplateCardProps) {
  const t = useTranslations()

  const name = t(template.name as any)
  const description = t(template.description as any)
  // ✅ FIXED: Use categoryKey instead of category for i18n lookup
  const category = t(`templates.categories.${template.categoryKey}` as any)

  return (
    <Card
      data-testid="template-card"
      role="button"
      aria-disabled={disabled}
      aria-label={`${name} template - ${description}`}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        'bg-card border-border transition-all group hover:border-accent/50',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:shadow-lg hover:shadow-accent/10'
      )}
      onClick={() => {
        if (disabled) return
        onSelect(template.id, template.tier)
      }}
      // ✅ NEW: Keyboard accessibility
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(template.id, template.tier)
        }
      }}
    >
      <CardContent className="p-6">
        <div className="text-3xl mb-4" aria-hidden="true">{template.emoji}</div>

        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">
            {name}
          </h3>
          {template.tier === 'pro' && (
            <div className="bg-warning/20 text-warning text-xs px-2 py-1 rounded-full">
              PRO
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground mb-3">
          {description}
        </p>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{category}</span>
          {/* ✅ NEW: Surface estimated build time for PRO templates */}
          {template.tier === 'pro' && template.metadata.estimatedBuildTime && (
            <span>~{template.metadata.estimatedBuildTime}min</span>
          )}
          {template.metadata.complexity && (
            <span className="capitalize">{template.metadata.complexity}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

### 2. Backend API Changes (sheenappsai)

#### /api/projects/route.ts Updates

**Current code (lines 203-214):**
```typescript
const templateData = {
  prompt:
    businessIdea ||
    (templateId ? `Create a ${projectName} project from template` : `Create a ${projectName} project`),
  files: {},
  metadata: {
    projectType: businessIdea ? 'business-idea' : (templateId ? 'template' : 'minimal'),
    templateId: templateId || null,
    source: 'project-creation'
  }
}
```

**✅ Enhanced code (with CRITICAL FIXES):**
```typescript
import { getTemplate, isTemplateAllowedForPlan } from '@/lib/templates/template-library'

// ✅ CRITICAL: Resolve template once, not multiple times
const templateDef = templateId ? getTemplate(templateId as any) : null

// ✅ CRITICAL: Server-side PRO template gating (before any processing)
if (templateDef) {
  const allowed = isTemplateAllowedForPlan(templateDef, user.plan)
  if (!allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: 'PRO_TEMPLATE_REQUIRES_UPGRADE',
        message: `The ${templateDef.name} template requires a paid plan`,
        templateId: templateDef.id,
        templateTier: templateDef.tier
      },
      { status: 402 } // 402 Payment Required
    )
  }
}

// ✅ OPTIMIZED: Concise prompt construction (~200 tokens max)
const basePrompt = businessIdea?.trim() || `Create a ${projectName} project`

const enhancedPrompt = templateDef
  ? [
      basePrompt,
      `\n\nTemplate: ${templateDef.prompting.systemContext}`,
      templateDef.prompting.keyFeatures.length > 0
        ? `\nFeatures:\n- ${templateDef.prompting.keyFeatures.join('\n- ')}`
        : ''
    ].filter(Boolean).join('')
  : basePrompt

const templateData = {
  prompt: enhancedPrompt,
  files: {},
  metadata: {
    projectType: businessIdea ? 'business-idea' : (templateId ? 'template' : 'minimal'),
    templateId: templateId || null,
    // ✅ NEW: Store template version for debugging
    templateVersion: templateDef?.version || null,
    templateName: templateDef?.name || null,
    source: 'project-creation',
    // Include template metadata for analytics
    ...(templateDef ? {
      templateTier: templateDef.tier,
      templateCategory: templateDef.category,
      estimatedBuildTime: templateDef.metadata.estimatedBuildTime
    } : {})
  }
}
```

### 3. Worker Backend Changes (sheenapps-claude-worker)

#### Create Template Validation Middleware

```typescript
// src/middleware/validateTemplate.ts

import { TemplateId } from '../types/templates'

const VALID_TEMPLATE_IDS: TemplateId[] = [
  'ecommerce', 'booking', 'restaurant', 'portfolio',
  'course-platform', 'business-landing', 'gym-fitness', 'blog',
  'saas', 'marketplace', 'real-estate', 'events-ticketing'
]

export function isValidTemplateId(templateId: string): templateId is TemplateId {
  return VALID_TEMPLATE_IDS.includes(templateId as TemplateId)
}

export function validateTemplateAccess(
  templateId: TemplateId,
  userPlan: 'free' | 'starter' | 'growth' | 'scale'
): { allowed: boolean; reason?: string } {
  const proTemplates: TemplateId[] = ['saas', 'marketplace', 'real-estate', 'events-ticketing']

  if (proTemplates.includes(templateId) && userPlan === 'free') {
    return {
      allowed: false,
      reason: 'PRO_TEMPLATE_REQUIRES_UPGRADE'
    }
  }

  return { allowed: true }
}
```

#### Update buildWorker.ts

**Enhance Claude prompt with template context:**

```typescript
// In buildWorker.ts processor function

async function processJob(job: Job<BuildJobData>) {
  const { projectId, prompt, versionId, buildId, framework, metadata } = job.data

  // Extract template info from metadata
  const templateId = metadata?.templateId
  let enhancedPrompt = prompt

  if (templateId && isValidTemplateId(templateId)) {
    // Template context is already in the prompt from frontend API
    // But we can add additional worker-side enhancements here
    logger.info('Building from template', {
      templateId,
      buildId: buildId.slice(0, 8)
    })
  }

  // Call Claude with enhanced prompt...
  const claudeResponse = await callClaude({
    prompt: enhancedPrompt,
    framework,
    // ... other params
  })

  // Continue with normal build process...
}
```

---

## User Journey Integration

### Journey 1: Direct Template Selection

```
User visits /builder/new
   ↓
Sees 12 template cards (8 free, 4 PRO)
   ↓
Clicks "🛍️ E-commerce Store"
   ↓
[if not authenticated] → Login modal → Resume after login
   ↓
[if free user + PRO template] → Upgrade modal
   ↓
[if authenticated + allowed] → POST /api/projects with templateId
   ↓
Backend enhances prompt with template context
   ↓
Worker receives enhanced prompt + builds
   ↓
User redirected to /builder/workspace/{projectId}
   ↓
Workspace shows build progress with template-specific phases
   ↓
Preview displays generated template
```

### Journey 2: Wizard → Template Suggestion

```
User toggles to "Wizard" mode
   ↓
Wizard asks: Site type, Business name, Industry, Style
   ↓
User completes wizard
   ↓
System analyzes answers + suggests matching template
   ↓
"Based on your answers, we recommend: 📅 Booking System"
   ↓
[User accepts] → Auto-fills businessIdea + templateId
   ↓
Proceeds with template-enhanced build
```

### Journey 3: Business Idea → Template Detection

```
User types: "I want a booking app for my salon"
   ↓
Frontend runs IdeaParser.parse()
   ↓
Detects type: 'booking', industry: 'beauty'
   ↓
Shows suggestion chip: "💡 Try our Booking System template"
   ↓
[User clicks] → Switches to template + preserves idea text
   ↓
Prompt combines: user idea + template context
   ↓
Builds with enhanced guidance
```

### Journey 4: Template Customization in Workspace

```
User has project built from template
   ↓
Workspace shows: "Built from: 🛍️ E-commerce Store template"
   ↓
User can chat to customize:
   - "Add a wishlist feature"
   - "Change color scheme to blue"
   - "Add customer reviews"
   ↓
AI understands template context + applies changes
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Set up template library infrastructure

- [ ] Create `src/lib/templates/types.ts`
- [ ] Create `src/lib/templates/template-library.ts` with 12 template definitions
- [ ] Create `src/lib/templates/template-helpers.ts`
- [ ] Add translation keys to all 9 locale files
- [ ] Create `TemplateCard.tsx` component
- [ ] Update `new-project-page.tsx` to use template library
- [ ] Test: Template cards render correctly in all locales

### Phase 2: Backend Integration (Week 1-2)
**Goal:** Connect templates to build pipeline

- [ ] Update `/api/projects/route.ts` to enhance prompts with template context
- [ ] Add template validation in worker
- [ ] Update worker `buildWorker.ts` to log template builds
- [ ] Test: Template prompts reach worker correctly
- [ ] Test: PRO template access control works
- [ ] Monitor: Build quality with template-enhanced prompts

### Phase 3: User Journey Enhancements (Week 2)
**Goal:** Improve template discovery and selection

- [ ] Add template suggestion logic to IdeaParser
- [ ] Show template suggestions when user types business idea
- [ ] Add "Recommended template" badge for wizard flow
- [ ] Implement template filtering (by category, tier)
- [ ] Add template preview modal (optional)
- [ ] Test: User can discover templates multiple ways

### Phase 4: Analytics & Optimization (Week 3)
**Goal:** Track usage and improve templates

- [ ] Add analytics events:
  - `template_selected`
  - `template_build_started`
  - `template_build_completed`
  - `template_customized`
- [ ] Track most popular templates
- [ ] Monitor build success rates per template
- [ ] Gather user feedback on template quality
- [ ] Iterate on template prompts based on data

### Phase 5: Advanced Features (Future)
**Goal:** Enhance template system capabilities

- [ ] Template variations (color themes, layouts)
- [ ] User-submitted templates
- [ ] Template marketplace
- [ ] Template versioning
- [ ] Starter files injection (actual code templates)
- [ ] Template tutorial/onboarding
- [ ] Template showcase page

---

## Testing Strategy

### Unit Tests

```typescript
// src/lib/templates/__tests__/template-library.test.ts

import { describe, it, expect } from 'vitest'
import {
  getTemplate,
  getAllTemplates,
  getFreeTemplates,
  getProTemplates
} from '../template-library'

describe('Template Library', () => {
  it('should return 12 templates', () => {
    const templates = getAllTemplates()
    expect(templates).toHaveLength(12)
  })

  it('should have 8 free templates', () => {
    const freeTemplates = getFreeTemplates()
    expect(freeTemplates).toHaveLength(8)
  })

  it('should have 4 PRO templates', () => {
    const proTemplates = getProTemplates()
    expect(proTemplates).toHaveLength(4)
  })

  it('should retrieve template by ID', () => {
    const template = getTemplate('ecommerce')
    expect(template).toBeDefined()
    expect(template?.id).toBe('ecommerce')
    expect(template?.tier).toBe('free')
  })

  it('all templates should have required fields', () => {
    const templates = getAllTemplates()

    templates.forEach(template => {
      expect(template.id).toBeTruthy()
      expect(template.name).toBeTruthy()
      expect(template.description).toBeTruthy()
      expect(template.emoji).toBeTruthy()
      expect(template.prompting.systemContext).toBeTruthy()
      expect(template.prompting.keyFeatures.length).toBeGreaterThan(0)
    })
  })
})
```

### Integration Tests

```typescript
// src/__tests__/template-project-creation.test.tsx

describe('Template Project Creation Flow', () => {
  it('should create project from free template', async () => {
    // Mock authenticated user
    const user = { id: 'user-123', plan: 'free' }

    // Select ecommerce template
    const response = await fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        templateId: 'ecommerce',
        name: 'My Store'
      })
    })

    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data.data.project.id).toBeTruthy()
  })

  // ✅ CRITICAL TEST: Server-side PRO template enforcement
  it('should block PRO template for free users with 402', async () => {
    const user = { id: 'user-123', plan: 'free' }

    const response = await fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        templateId: 'saas',  // PRO template
        name: 'My SaaS'
      })
    })

    // ✅ Must return 402 Payment Required
    expect(response.status).toBe(402)
    const data = await response.json()
    expect(data.ok).toBe(false)
    expect(data.code).toBe('PRO_TEMPLATE_REQUIRES_UPGRADE')
    expect(data.templateTier).toBe('pro')
  })

  // ✅ NEW TEST: PRO template allowed for paid users
  it('should allow PRO template for paid users', async () => {
    const user = { id: 'user-123', plan: 'starter' }

    const response = await fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        templateId: 'saas',  // PRO template
        name: 'My SaaS'
      })
    })

    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data.data.project.id).toBeTruthy()
  })
})
```

### E2E Tests

```typescript
// tests/e2e/template-selection.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Template Selection', () => {
  test('should display 12 templates on new project page', async ({ page }) => {
    await page.goto('/en/builder/new')

    const templateCards = page.locator('[data-testid="template-card"]')
    await expect(templateCards).toHaveCount(12)
  })

  test('should create project from template', async ({ page }) => {
    await page.goto('/en/builder/new')
    await page.click('text=E-commerce Store')

    // Should redirect to workspace
    await expect(page).toHaveURL(/\/builder\/workspace\//)
  })

  test('should show PRO badge on premium templates', async ({ page }) => {
    await page.goto('/en/builder/new')

    const proTemplates = page.locator('[data-testid="template-card"]:has-text("PRO")')
    await expect(proTemplates).toHaveCount(4)
  })
})
```

---

## Analytics & Metrics

### Events to Track

```typescript
// Analytics event definitions

interface TemplateAnalyticsEvents {
  // Template discovery
  'template_gallery_viewed': {
    locale: string
    authenticated: boolean
  }

  // Template selection
  'template_selected': {
    templateId: TemplateId
    templateName: string
    templateTier: 'free' | 'pro'
    userPlan: string
    source: 'direct' | 'wizard' | 'suggestion'
  }

  // Build lifecycle
  'template_build_started': {
    templateId: TemplateId
    buildId: string
    projectId: string
  }

  'template_build_completed': {
    templateId: TemplateId
    buildId: string
    projectId: string
    buildDuration: number
    success: boolean
  }

  // Customization
  'template_customized': {
    templateId: TemplateId
    projectId: string
    modificationType: 'chat' | 'direct-edit'
  }

  // Upgrades
  'template_upgrade_prompted': {
    templateId: TemplateId
    userPlan: string
  }
}
```

### Dashboards to Build

1. **Template Popularity**
   - Most selected templates
   - Free vs PRO usage
   - Category breakdown

2. **Build Success Rates**
   - Build completion % per template
   - Average build time per template
   - Error rates per template

3. **User Journey**
   - Template discovery sources
   - Time from selection to build
   - Customization patterns

4. **Conversion**
   - PRO template → Upgrade conversion rate
   - Template users vs direct prompt users
   - Retention of template users

---

## Migration Path

### Step 1: Deploy Template Library (Non-Breaking)
- Add template library files
- No changes to existing API behavior
- Templates render but prompts not yet enhanced

### Step 2: Enable Enhanced Prompts (Gradual Rollout)
- Feature flag: `ENABLE_TEMPLATE_ENHANCED_PROMPTS`
- Test with 10% of traffic
- Monitor build quality metrics
- Rollout to 100% if successful

### Step 3: Add Advanced Features
- Template suggestions
- Template filtering
- Template analytics

### Rollback Plan
- If template-enhanced prompts reduce build quality:
  - Disable feature flag
  - Revert to generic prompts
  - Analyze failed builds
  - Improve template definitions

---

## Success Criteria

### MVP Success (Phase 1-2)
- [ ] 12 templates deployed to production
- [ ] Templates render correctly in all 9 locales
- [ ] Template selection creates projects successfully
- [ ] PRO template access control works
- [ ] Build quality maintained or improved

### Full Success (Phase 3-4)
- [ ] 30%+ of new projects use templates
- [ ] Template builds have ≥95% success rate
- [ ] Template users have higher retention than direct prompt users
- [ ] At least 2 PRO template selections per day
- [ ] Average time-to-first-build reduced by 20%

---

## Risk Mitigation

### Risk 1: Template Prompts Don't Improve Build Quality
**Mitigation:**
- A/B test template-enhanced vs generic prompts
- Gather user feedback on generated output
- Iterate on template definitions based on failures
- Maintain fallback to generic prompts

### Risk 2: Templates Don't Match User Needs
**Mitigation:**
- Start with 12 diverse templates covering common use cases
- Track which templates are most/least used
- Add new templates based on user requests
- Allow users to suggest template ideas

### Risk 3: PRO Templates Don't Drive Upgrades
**Mitigation:**
- Make PRO templates significantly more valuable
- Show preview/demo of PRO template outputs
- Offer time-limited PRO template access as trial
- Track upgrade conversion rates

### Risk 4: Translation Quality Issues
**Mitigation:**
- Work with native speakers for all 9 locales
- Test template cards in all locales before launch
- Allow users to report translation issues
- Maintain English as fallback

---

## Future Enhancements

### Community Templates
- User-submitted template library
- Template rating and reviews
- Template customization sharing

### Template Variations
- Color scheme variants
- Layout options (grid vs list vs masonry)
- Feature toggles (with/without auth, with/without payment)

### Template Marketplace
- Premium templates from designers
- Template revenue sharing
- Template bundles

### Smart Template Recommendations
- ML-based template suggestions based on business idea
- Industry-specific template packs
- Personalized template ordering based on user history

---

## Appendix

### Research Sources

This plan was informed by research on popular web application templates and business types in 2026:

**SaaS & Web App Templates:**
- [Vercel SaaS Templates](https://vercel.com/templates/saas)
- [Open SaaS](https://opensaas.sh/)
- [Top 15 SaaS Webflow Templates in 2026](https://www.wedoflow.com/post/top-15-saas-webflow-templates-in-2024)
- [30+ Free SaaS Landing Page Templates | UIdeck](https://uideck.com/saas-templates)

**Business & Startup Ideas:**
- [50 Best Web App Ideas to Launch in 2026](https://www.knack.com/blog/web-app-ideas/)
- [20 Profitable SaaS & Micro-SaaS Ideas for 2026](https://elementor.com/blog/profitable-saas-micro-saas-ideas/)
- [Top SaaS ideas to start a profitable business in 2026](https://www.hostinger.com/tutorials/saas-ideas)

**Web Application Types:**
- [10 Web Application Types and How They Benefit Businesses](https://www.netguru.com/blog/web-application-types)
- [15 innovative web app ideas you can build without coding](https://www.hostinger.com/tutorials/web-app-ideas)
- [16 Best Web App Ideas to be Considered For Startup Business](https://www.monocubed.com/blog/web-app-ideas/)

**Small Business Examples:**
- [50 Best Small Business Websites](https://www.webcitz.com/blog/50-best-small-business-websites/)
- [Small Business Websites: 50+ Inspiring Examples (2026)](https://www.sitebuilderreport.com/inspiration/small-business-websites)

### Template Selection Rationale

The 12 templates were selected based on:

1. **Market Demand:** Most common small business website types
2. **Diversity:** Covering 12 different categories/industries
3. **Simplicity:** Minimalist starting points that AI can build well
4. **Value Gradient:** Clear distinction between free (simple) and PRO (complex)
5. **Geographic Relevance:** Templates relevant to Middle East, Europe, and global markets
6. **AI Capability:** Templates that align with Claude's strengths (UI generation, feature implementation)

---

## Implementation Summary & Readiness

### What Was Fixed (Post-Expert Review)

#### ✅ Critical Fixes Applied

1. **Translation Key Mismatches** → **RESOLVED**
   - Added `categoryKey` field to template schema
   - All templates now have consistent i18n mapping
   - Example: `categoryKey: 'realEstate'` maps to `templates.categories.realEstate`

2. **Server-Side PRO Template Enforcement** → **RESOLVED**
   - Added `isTemplateAllowedForPlan()` validation function
   - API route returns 402 error for unauthorized PRO access
   - User plan checked BEFORE processing begins
   - Frontend upgrade modal triggered by 402 response

3. **Prompt Token Bloat** → **RESOLVED**
   - Reduced systemContext from paragraphs to 1-2 sentences
   - Capped keyFeatures at 6 items (down from 8-10)
   - Removed optional industryPatterns/styleGuidance from MVP
   - Total prompt size: ~200 tokens max per template

4. **Template Versioning** → **ADDED**
   - Every template has `version: 1` field
   - Stored in project metadata for debugging
   - Enables regression tracking and analytics

#### ✅ Strategic Enhancements (Round 2)

5. **Shared Package Architecture** → **IMPLEMENTED**
   - Moved templates to `packages/templates/` (shared between Next.js + Worker)
   - Both apps import from `@sheenapps/templates`
   - Single source of truth prevents drift
   - Foundation for A/B testing & template marketplace

6. **Scaffold Structure** → **ADDED**
   - Every template defines expected: pages, entities, flows, roles
   - Improves build determinism (AI has clear structure to follow)
   - Enables analytics: "missing checkout page" vs "build failed"
   - Phase 2.5: Worker validates actual vs expected structure

7. **Resource Budgeting** → **ADDED**
   - Templates specify: maxSteps, estimatedTokens, maxBuildTime, phases
   - Free tier: 20-25 steps, 50-75k tokens, 10-15min
   - PRO tier: 50-60 steps, 200-250k tokens, 25-30min
   - Prevents economic abuse (free users retrying PRO templates)
   - Phase 2.5: Worker enforces budgets

### What's Ready for Implementation

#### Phase 1 - Shared Template Package (Week 1)
**✅ COMPLETED:** 2026-01-19
**📦 Package Location:** `/Users/sh/Sites/sheenapps/packages/templates/`

- [x] Create `packages/templates/` shared package:
  - `src/types.ts` - TemplateDefinition, TemplateScaffold, TemplateBudget interfaces ✓
  - `src/library.ts` - TEMPLATE_LIBRARY with 12 templates (including scaffold + budget) ✓
  - `src/helpers.ts` - getTemplate(), isTemplateAllowedForPlan(), etc. ✓
  - `src/index.ts` - Public exports ✓
  - `package.json` - Package definition for @sheenapps/templates ✓
- [x] Add all 12 template definitions with:
  - Condensed prompts (~200 tokens max) ✓
  - Scaffold structure (pages, entities, flows, roles) ✓
  - Resource budgets (maxSteps, estimatedTokens, maxBuildTime, phases) ✓
  - Translation keys to all 9 locales ✓
- [x] Update Next.js to import from `@sheenapps/templates` ✓
- [x] Update Worker to import from `@sheenapps/templates` ✓
- [ ] Create `TemplateCard.tsx` with a11y + categoryKey fix
- [ ] Update `new-project-page.tsx` to use template library

**Implementation Notes:**
- Shared package successfully installed in both Next.js (npm) and Worker (pnpm)
- All translations validated with `npm run validate-translations` - passed ✓
- Translation structure:
  - English: templates.items.{templateId}.name/description
  - Arabic (ar, ar-eg, ar-sa, ar-ae): Full translations completed
  - French (fr, fr-ma): Full translations completed
  - Spanish (es): Full translations completed
  - German (de): Full translations completed
- Package exports all types and helpers correctly

**Expert Code Review Improvements (2026-01-19):**
Following expert review, implemented critical safety and consistency fixes:

**P0 Fixes Applied:**
1. ✅ **Object.hasOwn validation**: Changed `isValidTemplateId()` from `in` operator to `Object.hasOwn()` to avoid prototype chain issues
2. ✅ **Parse/resolve helpers**: Added `parseTemplateId()` and `resolveTemplate()` for safe untrusted input handling
3. ✅ **Structured access results**: Fixed `validateTemplateAccess()` to return codes + metadata instead of human strings (i18n key bug fix)
4. ✅ **Shared prompt builder**: Added `buildTemplatePrompt()` for consistent, token-efficient prompts across Next.js + Worker

**P1 Enhancements:**
5. ✅ **Runtime invariant checker**: Added `assertTemplateLibrary()` to catch config mistakes in dev/test

**Validation Results:**
- All 12 templates passed invariant checks
- Sample prompt: 572 chars (~143 tokens) - well under 200 token target
- Free user correctly blocked from PRO templates with structured error codes
- All helpers tested and working correctly

**Developer Documentation:**
- 📖 **[Package README](./packages/templates/README.md)** - Overview and quick start
- 📖 **[Developer Guide](./packages/templates/DEVELOPER_GUIDE.md)** - Complete integration guide covering:
  - How to add a new template
  - Frontend integration (Next.js)
  - Backend integration (Worker)
  - Testing and validation
  - Best practices and common issues

**Next Steps:** Phase 1 complete. Ready to proceed with UI components (TemplateCard, new-project-page updates)

**Actual Effort:** 1 day (faster than estimated due to simplified shared package approach)

#### Phase 2 - Backend Integration (Week 1-2)
- [ ] Update `/api/projects/route.ts` with:
  - Server-side PRO template gating (402 response)
  - Optimized prompt construction
  - Template version + scaffold + budget in metadata
- [ ] Worker: Log scaffold + budget (validation in Phase 2.5)
- [ ] Test PRO template access control (402 response)
- [ ] Monitor build quality with template-enhanced prompts

**Estimated Effort:** 2-3 days

#### Phase 2.5 - Budget Enforcement (Week 2-3) [OPTIONAL for MVP]
**Note:** Can be deferred to post-MVP if needed

- [ ] Worker: Enforce maxSteps limit
- [ ] Worker: Enforce maxBuildTime limit
- [ ] Worker: Track actual vs estimated tokens
- [ ] Worker: Scaffold validation (check generated pages match expected)
- [ ] Analytics: Compare estimated vs actual resource usage

**Estimated Effort:** 2 days

#### Phase 3 - Testing & QA (Week 2)
- [ ] Unit tests for template library
- [ ] Integration tests for PRO gating
- [ ] E2E tests for template selection flow
- [ ] RTL testing for Arabic locales
- [ ] Monitor analytics events

**Estimated Effort:** 2 days

### Pre-Launch Checklist

**Code Quality:**
- [ ] All TypeScript types defined
- [ ] No hardcoded strings (use i18n keys)
- [ ] Server-side validation in place
- [ ] Tests passing (unit + integration + E2E)

**Translation Completeness:**
- [x] English (en.json) ✓
- [x] Arabic Egypt (ar-eg.json) ✓
- [x] Arabic Saudi (ar-sa.json) ✓
- [x] Arabic UAE (ar-ae.json) ✓
- [x] Arabic (ar.json) ✓
- [x] French (fr.json) ✓
- [x] French Morocco (fr-ma.json) ✓
- [x] Spanish (es.json) ✓
- [x] German (de.json) ✓

**Security & Performance:**
- [ ] PRO templates blocked for free users (server-side)
- [ ] Template prompts under 200 tokens
- [ ] No PII leaking in analytics events
- [ ] Rate limiting configured

**Analytics Setup:**
- [ ] `template_selected` event
- [ ] `template_build_started` event
- [ ] `template_build_completed` event
- [ ] `template_upgrade_prompted` event

### Free vs PRO Template Comparison

**Economic Model at a Glance:**

| Aspect | Free Templates (8) | PRO Templates (4) |
|--------|-------------------|-------------------|
| **Complexity** | Simple to moderate | Complex multi-page apps |
| **Pages** | 3-6 pages | 8-12+ pages |
| **Entities** | 2-4 models | 6-10+ models |
| **User Roles** | 1-2 roles | 3+ roles (multi-tenant) |
| **Max Steps** | 20-25 API calls | 50-60 API calls |
| **Estimated Tokens** | 50-75k tokens | 200-250k tokens |
| **Max Build Time** | 10-15 minutes | 25-30 minutes |
| **Auth** | ✅ Basic | ✅ Full system |
| **Payments** | ✅ Simple integration | ✅ Subscription billing |
| **Admin Panel** | ❌ Not included | ✅ Included |
| **Multi-tenancy** | ❌ Single-tenant | ✅ Organizations/teams |
| **User Access** | All users | Paid plans only |

**Examples:**
- **Free:** E-commerce (6 pages, 4 entities, 25 steps, 75k tokens)
- **PRO:** SaaS Platform (10 pages, 6 entities, 60 steps, 250k tokens)

**Why This Matters:**
- Clear value gradient drives upgrades
- Resource limits prevent abuse
- Economics align with infrastructure costs

---

### Success Metrics (30 days post-launch)

**Adoption:**
- Target: 30%+ of new projects use templates
- Measure: `template_selected` / total projects

**Quality:**
- Target: ≥95% build success rate for template projects
- Measure: `template_build_completed` / `template_build_started`

**Conversion:**
- Target: 5%+ PRO template → upgrade conversion
- Measure: Upgrades within 7 days of `template_upgrade_prompted`

**Retention:**
- Target: Template users have 20%+ higher D7 retention
- Measure: Active users D7 (template users vs non-template users)

### Rollout Strategy

**Week 1: Internal Launch**
- Deploy to staging
- Team testing (all locales)
- Fix critical bugs

**Week 2: Soft Launch (10% traffic)**
- Feature flag: `ENABLE_TEMPLATES = 0.1`
- Monitor analytics + error rates
- Gather user feedback

**Week 3: Full Launch (100% traffic)**
- Feature flag: `ENABLE_TEMPLATES = 1.0`
- Marketing announcement
- Track success metrics

**Rollback Plan:**
- If template builds have <80% success rate → rollback
- If errors spike >5% → rollback
- Fallback: Generic prompts (current behavior)

---

**End of Implementation Plan**
