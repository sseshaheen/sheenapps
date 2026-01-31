# SheenApps Builder - Technical Architecture Overview

## Executive Summary

The SheenApps Builder is a sophisticated AI-powered website builder operating within a Next.js 15 marketing site with 9 locales (en, ar-eg, ar-sa, ar-ae, ar, fr, fr-ma, es, de). The system enables users to create, customize, and deploy websites through natural language interactions, leveraging a microservices architecture with a dedicated Worker API for build processing.

### Key Achievements
- **3x Performance Improvement**: Build time reduced from 14s to 5s
- **Bundle Size Optimization**: 164KB reduction (327% of initial goal)
- **Real-time Build Tracking**: Clean events API with structured progress monitoring
- **AI Tier Routing**: Intelligent fallback system across multiple providers
- **Scalable Architecture**: Separated concerns between UI and Worker services

## System Architecture

### 1. Core Components

#### 1.1 Builder Interface Layer
```
src/components/builder/
├── builder-chat-interface.tsx       # Main chat UI with build progress integration
├── responsive-workspace-content-simple.tsx  # Workspace layout management
├── clean-build-progress.tsx         # Real-time progress visualization
├── project-recommendations.tsx      # Post-deployment AI suggestions
└── preview/
    ├── simple-iframe-preview.tsx    # Iframe-based preview (primary)
    └── generated-template-preview.tsx # React-based preview (experimental)
```

**Key Features:**
- **Chat-driven interaction** with mode switching (build/plan)
- **Real-time build progress** with phase-based tracking
- **Responsive layout** with mobile/desktop adaptation
- **Post-build recommendations** for continuous improvement

#### 1.2 State Management Architecture

```typescript
// Global Build State Store (Singleton Pattern)
src/store/build-state-store.ts
- Manages current buildId globally
- Prevents zombie polling issues
- Ensures atomic buildId transitions

// Auth State Management
src/store/auth-store.ts
- Server-side auth with polling disabled
- Cookie-based session management
- Integrated credits modal system

// Builder Store (Legacy)
src/store/builder-store.ts
- Template management
- Section editing capabilities
- Undo/redo functionality
```

**State Flow:**
1. **Global buildId management** prevents multiple polling instances
2. **Singleton pattern** for useCleanBuildEvents hook
3. **Shared data store** broadcasts updates to all subscribers
4. **React Query integration** for efficient data fetching

### 2. Build System Architecture

#### 2.1 Build Event Pipeline

```
User Input → Chat Interface → Worker API → Build Events → Real-time Updates
                                   ↓
                            Database Storage
                                   ↓
                            Clean Events API → UI Components
```

**Event Types:**
- `queued`: Build entered queue
- `started`: Build processing began
- `progress`: Incremental updates with phase/step info
- `completed`: Build successfully finished
- `failed`: Build encountered error
- `deployed`: Preview URL available

#### 2.2 Worker API Integration

```typescript
// Worker API Client v2.1
src/services/worker-api-client.ts
- HMAC authentication
- Rate limiting with exponential backoff
- Automatic retry logic
- Environment-aware configuration

// Preview Deployment Service
src/services/preview-deployment.ts
- Handles /v1/create-preview-for-new-project
- Manages /v1/update-project calls
- Balance validation pre-flight checks
- Server-generated project ID support
```

**Security Features:**
- **HMAC signatures** for request authentication
- **Rate limiting** with backoff strategy
- **Balance checks** before operations
- **CORS-safe** server-side implementation

### 3. AI Service Architecture

#### 3.1 Unified AI Service

```
Request → Tier Router → Provider Selection → Service Execution → Response
            ↓                    ↓                   ↓
      Complexity Analysis   Fallback Logic    Token Management
```

**Service Hierarchy:**
```typescript
UnifiedAIService (Entry Point)
├── TierRouter (Intelligence Layer)
│   ├── Request Analysis
│   ├── Domain Classification
│   └── Complexity Assessment
├── FallbackOrchestrator (Resilience)
│   ├── Provider Rotation
│   ├── Error Recovery
│   └── Cost Optimization
└── ServiceFactory (Provider Management)
    ├── AnthropicService
    ├── OpenAIService
    └── MockService (Development)
```

#### 3.2 AI Tier System

**Tier Classification:**
- **Premium**: Critical/complex requests (Claude 3.5 Sonnet)
- **Standard**: Business analysis (GPT-4)
- **Basic**: Simple content generation (GPT-3.5)
- **Economy**: Lightweight tasks (Claude Haiku)

**Intelligent Routing Factors:**
- Request complexity analysis
- Domain-specific requirements
- Cost optimization constraints
- Response time requirements
- Error rate thresholds

### 4. Preview Systems

#### 4.1 Dual Preview Architecture

**Iframe Preview (Primary):**
```typescript
// Simple iframe with sandboxed content
- URL: https://preview--{projectId}.sheenapps.com
- Isolation: Complete DOM separation
- Performance: Lazy loading with visibility detection
- Updates: URL refresh on build completion
```

**React Preview (Experimental):**
```typescript
// Direct React component rendering
- Performance: 2-5x faster initial render
- Integration: Shared context with builder
- Limitations: Style isolation challenges
- Status: Feature-flagged for testing
```

### 5. Database Architecture

#### 5.1 Schema Evolution (Migration 028)

**Before (JSON Blob):**
```sql
projects.config::jsonb  -- Untyped, slow queries
```

**After (Typed Columns):**
```sql
projects:
  - build_status: enum
  - current_build_id: ulid
  - preview_url: text
  - framework: text
  - last_build_started: timestamp
  - last_build_completed: timestamp
```

**Performance Impact:**
- 70% faster queries with indexed columns
- Type safety at database level
- Reduced JSON parsing overhead
- Better query optimization

#### 5.2 Event Storage

```sql
project_build_events:
  - id: bigserial (primary key)
  - build_id: text (indexed)
  - user_id: uuid (indexed)
  - event_type: text
  - event_phase: text
  - event_data: jsonb
  - overall_progress: numeric
  - user_visible: boolean
  - created_at: timestamptz
```

### 6. Authentication Architecture

#### 6.1 Server-Side Auth Pattern

```typescript
// Server Actions (Best Practice)
export async function signInWithPasswordAndRedirect(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword(...)

  if (error) redirect(`/auth/login?error=${error.message}`)

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
```

**Key Principles:**
- **No client-side Supabase auth calls** when server auth enabled
- **Server actions** handle all auth operations
- **Cookie-based** session management
- **URL parameters** for error communication
- **getUser()** for privileged operations (not getSession())

### 7. Internationalization (i18n) Architecture

#### 7.1 Navigation System

```typescript
// Centralized Navigation Utilities
src/utils/navigation.ts
- useNavigationHelpers() hook
- ROUTES constants
- Locale-aware routing
- Billing path generation

// Proper Usage
import { useRouter, Link } from '@/i18n/routing'  ✅
import { useRouter } from 'next/navigation'  ❌
```

**Translation Loading Pattern:**
```typescript
// Server-side translation loading
const messages = (await import(`../../messages/${locale}.json`)).default
const translations = {
  navigation: messages.navigation,
  hero: {
    floatingBadges: messages.hero.floatingBadges, // REQUIRED
    trustBar: messages.hero.trustBar, // REQUIRED
  }
}
```

## Technical Debt & Known Issues

### Critical Issues

1. **Build State Synchronization**
   - **Issue**: Race conditions between API updates and project data polling
   - **Impact**: Wrong buildId polled, stale data displayed
   - **Mitigation**: 10-second protection window, API precedence logic
   - **Solution Needed**: Event-driven updates instead of polling

2. **React Hook Violations**
   - **Issue**: Conditional hook calls in some components
   - **Impact**: Development warnings, potential production errors
   - **Files**: See REACT_HOOK_VIOLATION_DIAGNOSTIC_REPORT.md
   - **Solution Needed**: Refactor to unconditional hook usage

3. **Memory Leaks in Event System**
   - **Issue**: Event listeners not always cleaned up
   - **Impact**: Memory growth over time
   - **Mitigation**: beforeunload snapshots for monitoring
   - **Solution Needed**: Systematic cleanup on unmount

### Performance Bottlenecks

1. **Multiple Parallel Polling**
   - **Current**: Singleton pattern prevents duplicate polling
   - **Issue**: Still polling-based, not event-driven
   - **Impact**: Unnecessary API calls, delayed updates
   - **Solution**: WebSocket or SSE implementation

2. **Bundle Size Concerns**
   - **Achievement**: 164KB reduction achieved
   - **Remaining**: AI services still contribute 80KB+
   - **Solution**: More aggressive code splitting, dynamic imports

3. **Translation File Size**
   - **Issue**: All translations loaded per page
   - **Impact**: 200KB+ per locale file
   - **Solution**: Component-level translation splitting

### Architecture Gaps

1. **Testing Coverage**
   - **Current**: ~30 test files need updates
   - **Issue**: Tests use deprecated APIs
   - **Impact**: CI/CD reliability concerns
   - **Solution**: Comprehensive test refactor

2. **Error Recovery**
   - **Current**: Basic retry logic in Worker client
   - **Gap**: No circuit breaker pattern
   - **Impact**: Cascading failures possible
   - **Solution**: Implement circuit breaker with fallback

3. **Monitoring & Observability**
   - **Current**: Basic console logging
   - **Gap**: No structured logging or APM
   - **Impact**: Difficult production debugging
   - **Solution**: OpenTelemetry integration

## Recommendations for Next Phase

### Immediate Priorities (Week 1-2)

1. **WebSocket Implementation**
   - Replace polling with real-time events
   - Implement reconnection logic
   - Add heartbeat mechanism
   - Estimated effort: 5 days

2. **React Hook Violation Fixes**
   - Audit all components for violations
   - Refactor conditional hooks
   - Add ESLint rules for prevention
   - Estimated effort: 3 days

3. **Test Suite Modernization**
   - Update to current API patterns
   - Add integration tests for Worker API
   - Implement E2E tests for critical paths
   - Estimated effort: 5 days

### Medium-term Goals (Month 1-2)

1. **Performance Optimization**
   - Implement service worker for caching
   - Add prefetching for common paths
   - Optimize translation loading
   - Target: 50% reduction in TTI

2. **Error Handling Enhancement**
   - Circuit breaker implementation
   - Graceful degradation patterns
   - User-friendly error messages
   - Comprehensive error tracking

3. **Monitoring Infrastructure**
   - OpenTelemetry setup
   - Custom metrics dashboard
   - Alert configuration
   - Performance budgets

### Long-term Vision (Quarter)

1. **Microservices Evolution**
   - Extract AI services to separate service
   - Implement API gateway
   - Add service mesh for communication
   - Enable horizontal scaling

2. **Advanced Features**
   - Collaborative editing
   - Version branching
   - A/B testing capabilities
   - Custom domain management

3. **Platform Scaling**
   - Multi-region deployment
   - CDN integration
   - Database sharding
   - Queue-based job processing

## Security Considerations

### Current Security Measures

1. **Authentication**
   - Server-side auth with Supabase
   - Secure cookie management
   - CSRF protection via server actions
   - Rate limiting on auth endpoints

2. **API Security**
   - HMAC signatures for Worker API
   - Environment variable validation
   - Request size limits
   - Input sanitization

3. **Data Protection**
   - RLS policies in Supabase
   - User isolation at database level
   - Encrypted sensitive data
   - Audit logging for changes

### Security Gaps & Recommendations

1. **Content Security Policy**
   - Need stricter CSP headers
   - Implement nonce-based inline scripts
   - Regular security audits

2. **Dependency Management**
   - Implement automated vulnerability scanning
   - Regular dependency updates
   - Supply chain attack prevention

3. **Secrets Management**
   - Move to dedicated secrets manager
   - Implement key rotation
   - Audit secret usage

## Performance Metrics

### Current Performance

```
Build Time: 5s (was 14s)
Bundle Sizes:
- Homepage: 233KB (was 314KB)
- Builder: 257KB (was 340KB)

API Response Times:
- Build Events: ~100ms
- Project Update: ~200ms
- AI Generation: 2-5s

Core Web Vitals:
- LCP: 2.1s
- FID: 95ms
- CLS: 0.05
```

### Target Metrics

```
Build Time: <3s
Bundle Sizes: <200KB per route
API Response: <100ms p99
AI Generation: <2s average
LCP: <1.5s
FID: <50ms
CLS: <0.01
```

## Conclusion

The SheenApps Builder represents a sophisticated, production-ready AI website builder with strong foundations in place. The architecture successfully separates concerns between UI and Worker services, implements intelligent AI routing, and provides real-time build tracking.

Key strengths include the clean separation of concerns, robust error handling, and successful performance optimizations. The main areas for improvement center around moving from polling to event-driven architecture, comprehensive test coverage, and enhanced monitoring capabilities.

The recommended next steps focus on immediate stability improvements while building toward a more scalable, observable, and performant platform. With the suggested enhancements, the system is well-positioned to handle significant growth while maintaining excellent user experience.

## Appendix

### A. File Structure Reference
- See section 1.1 for component organization
- Database schema in migration files
- API routes in src/app/api/

### B. Environment Variables
- `WORKER_BASE_URL`: Worker service endpoint
- `WORKER_SHARED_SECRET`: HMAC authentication secret
- `NEXT_PUBLIC_WORKER_BASE_URL`: Client-accessible Worker URL
- `ENABLE_SERVER_AUTH`: Server-side auth flag
- `NEXT_PUBLIC_ENABLE_CLEAN_EVENTS`: Clean events API flag

### C. Key Technologies
- Next.js 15 (App Router)
- React 18.3
- TypeScript 5.3
- Supabase (Auth & Database)
- React Query v5
- Zustand (State Management)
- Framer Motion (Animations)
- TailwindCSS (Styling)

### D. Related Documentation
- CLAUDE.md: Development guidelines
- SUPABASE_AUTH_IMPLEMENTATION_GUIDE.md: Auth patterns
- BUILDER_TECHNICAL_OVERVIEW_CODE_SNIPPETS.md: Code snippets of key and important relevant files
- Migration files: Database evolution history
