//launch_readiness_sprint_board_setup.md
# SheenApps Sprint Board Setup - Action Implementation

**Created**: December 23, 2024
**Purpose**: Convert strategic roadmap into actionable sprint tickets
**Sprint Model**: 2-week sprints, Friday demos, Monday sprint planning

---

## 🎯 Epic Structure (4 Core Tracks)

### **Epic 1: Security & AI Day-1** 🔐
**Priority**: P0 - Critical launch blocker
**Timeline**: Sprint 1 (Week 1-2)
**Success Metrics**:
- RLS enabled with 0 violations
- AI production services operational
- Build pipeline clean (0 lint/TS errors)

### **Epic 2: Monetisation & Export** 💳
**Priority**: P0 - Revenue capability
**Timeline**: Sprint 2 (Week 3-4)
**Success Metrics**:
- Stripe checkout functional
- Basic export working (HTML/CSS ZIP)
- Payment flow tested across 9 locales

### **Epic 3: User Hub & Teams** 📱
**Priority**: P1 - Core user experience
**Timeline**: Sprint 3 (Week 5-6)
**Success Metrics**:
- Dashboard with project management
- Basic team collaboration
- Usage analytics visible

### **Epic 4: Performance & Launch** ⚡
**Priority**: P1 - Launch readiness
**Timeline**: Sprint 4 (Week 7-8)
**Success Metrics**:
- Bundle size compliance (<160KB builder, <200KB homepage)
- Load testing passed (5× projected traffic)
- Soft launch to 50 partners

---

## 🎫 Sprint 1: Security & AI Day-1 (Week 1-2)

### **SEC-001: Deploy RLS Security Fixes**
- **Owner**: [Backend Lead]
- **Priority**: P0
- **Tags**: Security, Database, Critical
- **Epic**: Security & AI Day-1

**Description**: Re-enable Row Level Security across all tables
**Acceptance Criteria**:
- [ ] Deploy SECURITY_RESTORE.sql to production database
- [ ] Verify all tables have RLS enabled
- [ ] Test demo access with `demo_` prefix works
- [ ] Confirm authenticated user access preserved
- [ ] RLS audit logging captures violations

**Definition of Done**:
- Build passes with RLS enabled
- RLS audit log fires once per policy breach
- Demo projects accessible without auth
- Zero data exposure in logs

**Implementation**:
```sql
-- Use existing SECURITY_RESTORE.sql
psql $DATABASE_URL < SECURITY_RESTORE.sql
```

**Dependencies**: None
**Estimate**: 2 days

---

### **SEC-002: Fix Build Quality Gates**
- **Owner**: [DevOps Lead]
- **Priority**: P0
- **Tags**: CI/CD, Build, Quality
- **Epic**: Security & AI Day-1

**Description**: Remove build ignores and fix all lint/TypeScript errors
**Acceptance Criteria**:
- [ ] Remove `ignoreDuringBuilds: true` from next.config.ts
- [ ] Fix all existing ESLint errors (currently ~15)
- [ ] Fix all TypeScript errors (currently ~8)
- [ ] Pre-commit hooks prevent regression
- [ ] Build fails on any lint/TS error

**Definition of Done**:
- `npm run build` passes with 0 errors/warnings
- `npm run lint` returns clean
- `npm run type-check` passes
- Pre-commit hook blocks bad commits

**Implementation**:
```bash
# Remove ignores in next.config.ts
# Fix each error systematically
# Add husky pre-commit hooks
```

**Dependencies**: None
**Estimate**: 3 days

---

### **AI-001: Enable Production AI Services**
- **Owner**: [AI Lead]
- **Priority**: P0
- **Tags**: AI, Production, Cost-Control
- **Epic**: Security & AI Day-1

**Description**: Switch from mock to real AI services with cost controls
**Acceptance Criteria**:
- [ ] Add OPENAI_API_KEY and ANTHROPIC_API_KEY to environment
- [ ] Verify automatic switch from mock services
- [ ] Configure $200 monthly budget cap
- [ ] Set up 95th percentile latency monitoring (<4s)
- [ ] Test circuit breaker at 5 consecutive 5xx errors

**Definition of Done**:
- Real AI responses in development
- Budget dashboard shows usage/limits
- Circuit breaker triggers and recovers
- Latency SLO tracked in real-time

**Implementation**:
```bash
# Environment setup
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=ant-...

# Verify auto-detection
npm run dev # Should show "OpenAI detected" in logs
```

**Dependencies**: None
**Estimate**: 2 days

---

### **AI-002: Setup Production Rate Limiting**
- **Owner**: [Backend Lead]
- **Priority**: P1
- **Tags**: AI, Rate-Limiting, Redis
- **Epic**: Security & AI Day-1

**Description**: Configure Redis-based rate limiting for production scale
**Acceptance Criteria**:
- [ ] Set up Upstash Redis instance
- [ ] Configure rate limiting environment variables
- [ ] Test rate limit enforcement (10 AI requests/minute)
- [ ] Verify graceful fallback when Redis unavailable
- [ ] Monitor rate limit violations

**Definition of Done**:
- Rate limits enforced in production
- Graceful degradation on Redis failure
- Monitoring alerts for rate limit breaches

**Implementation**:
```bash
# Environment variables
export UPSTASH_REDIS_REST_URL=https://...
export UPSTASH_REDIS_REST_TOKEN=...
```

**Dependencies**: AI-001
**Estimate**: 1 day

---

## 🎫 Sprint 2: Monetisation & Export (Week 3-4)

### **PAY-001: Stripe Integration Setup**
- **Owner**: [Frontend Lead]
- **Priority**: P0
- **Tags**: Stripe, Payments, Revenue
- **Epic**: Monetisation & Export

**Description**: Implement Stripe Checkout for subscription payments
**Acceptance Criteria**:
- [ ] Install Stripe dependencies (`stripe`, `@stripe/stripe-js`)
- [ ] Create `/api/checkout/create-session` endpoint
- [ ] Implement subscription webhooks handler
- [ ] Connect pricing UI to real Stripe checkout
- [ ] Test payment flow in all 9 locales

**Definition of Done**:
- Stripe checkout completes successfully
- Webhooks handle subscription events
- Plan enforcement works
- Multi-currency pricing functional

**Implementation**:
```bash
npm install stripe @stripe/stripe-js
```

**Dependencies**: None
**Estimate**: 5 days

---

### **EXP-001: Basic Site Export Feature**
- **Owner**: [Frontend Lead]
- **Priority**: P0
- **Tags**: Export, Core-Feature, ZIP
- **Epic**: Monetisation & Export

**Description**: Implement HTML/CSS export with ZIP download
**Acceptance Criteria**:
- [ ] Replace `logger.info('Export')` with real implementation
- [ ] Generate static HTML/CSS from current project
- [ ] Create ZIP archive with all assets
- [ ] Add feature flag control for export access
- [ ] Test export across different project types

**Definition of Done**:
- Export button generates downloadable ZIP
- ZIP contains functional HTML/CSS site
- Feature flag controls access
- Works for salon/business project types

**Implementation**:
```typescript
// Replace in workspace-header.tsx onExport handler
const handleExport = async () => {
  const zip = await generateProjectZip(projectId)
  downloadZip(zip, `${projectName}.zip`)
}
```

**Dependencies**: None
**Estimate**: 3 days

---

## 🎫 Sprint 3: User Hub & Teams (Week 5-6)

### **DASH-001: Project Dashboard Creation**
- **Owner**: [Frontend Lead]
- **Priority**: P1
- **Tags**: Dashboard, UX, Projects
- **Epic**: User Hub & Teams

**Description**: Create project listing and management interface
**Acceptance Criteria**:
- [ ] Create `/dashboard` route and page
- [ ] Display user's projects in grid/list view
- [ ] Add project creation flow
- [ ] Implement project deletion with confirmation
- [ ] Show usage statistics per project

**Definition of Done**:
- Dashboard accessible after login
- CRUD operations work for projects
- Usage stats display correctly
- Mobile-responsive interface

**Dependencies**: PAY-001 (subscription status)
**Estimate**: 4 days

---

### **TEAM-001: Basic Team Collaboration**
- **Owner**: [Backend Lead]
- **Priority**: P1
- **Tags**: Teams, Collaboration, Sharing
- **Epic**: User Hub & Teams

**Description**: Implement basic team invite and read-only access
**Acceptance Criteria**:
- [ ] Create team invite modal with email input
- [ ] Send invitation emails via Supabase
- [ ] Implement read-only collaborator view
- [ ] Add basic team member management UI
- [ ] Test permission enforcement

**Definition of Done**:
- Team invites sent and accepted
- Read-only access enforced
- Team management UI functional
- Database permissions correct

**Dependencies**: SEC-001 (RLS policies)
**Estimate**: 4 days

---

## 🎫 Sprint 4: Performance & Launch (Week 7-8)

### **PERF-001: Bundle Size Optimization**
- **Owner**: [DevOps Lead]
- **Priority**: P1
- **Tags**: Performance, Bundle-Size, CI
- **Epic**: Performance & Launch

**Description**: Reduce bundle sizes to meet hard limits
**Acceptance Criteria**:
- [ ] Homepage bundle ≤ 200KB (currently 340KB)
- [ ] Builder bundle ≤ 160KB (currently 337KB)
- [ ] Implement code splitting optimizations
- [ ] Add tree-shaking improvements
- [ ] CI fails build if limits exceeded

**Definition of Done**:
- All bundles within size limits
- CI enforcement active
- Performance improvements measured
- Bundle analysis available

**Implementation**:
```bash
# Use existing bundle checker
node scripts/check-bundle-size.js
# Should pass with green checkmarks
```

**Dependencies**: SEC-002 (clean build)
**Estimate**: 5 days

---

### **LAUNCH-001: Soft Launch Preparation**
- **Owner**: [Product Lead]
- **Priority**: P1
- **Tags**: Launch, Beta, Partners
- **Epic**: Performance & Launch

**Description**: Prepare for 50-partner soft launch
**Acceptance Criteria**:
- [ ] Finalize Terms of Service and Privacy Policy
- [ ] Set up customer support system
- [ ] Create feature flags for safe rollout
- [ ] Prepare rollback procedures
- [ ] Recruit 50 design partners

**Definition of Done**:
- Legal docs deployed
- Support system operational
- Feature flags functional
- Partner list confirmed
- Launch checklist complete

**Dependencies**: All previous epics
**Estimate**: 5 days

---

## 🚦 CI Gates & Monitoring (Sprint 0 - Immediate)

### **CI-001: Bundle Size Enforcement Gate**
- **Owner**: [DevOps Lead]
- **Priority**: P0
- **Tags**: CI, Performance, Gates

**Description**: Enable hard bundle size limits in CI pipeline
**Acceptance Criteria**:
- [ ] Integrate `scripts/check-bundle-size.js` into CI
- [ ] Set failure thresholds (200KB homepage, 160KB builder)
- [ ] Add bundle size reporting to PR comments
- [ ] Create bundle size dashboard

**Implementation**:
```yaml
# In GitHub Actions
- name: Check Bundle Size
  run: npm run build && node scripts/check-bundle-size.js
```

**Estimate**: 0.5 days

---

### **CI-002: Web Vitals Logging Dashboard**
- **Owner**: [Frontend Lead]
- **Priority**: P0
- **Tags**: Performance, Monitoring, Analytics

**Description**: Set up real-time performance monitoring
**Acceptance Criteria**:
- [ ] Enable Web Vitals collection in production
- [ ] Create performance dashboard in Logflare
- [ ] Set up LCP <2s alerts
- [ ] Track 95th percentile metrics

**Implementation**:
```typescript
// Use existing web-vitals setup in analytics/
// Connect to Supabase/Logflare dashboard
```

**Estimate**: 1 day

---

### **CI-003: AI Cost Monitoring Dashboard**
- **Owner**: [AI Lead]
- **Priority**: P0
- **Tags**: AI, Cost-Control, Monitoring

**Description**: Real-time AI spend tracking and alerts
**Acceptance Criteria**:
- [ ] Dashboard shows monthly spend vs budget
- [ ] Alerts at 70%, 95%, 100% budget thresholds
- [ ] Cost per generation tracking
- [ ] Circuit breaker status monitoring

**Implementation**:
```typescript
// Use existing AI cost tracking system
// Create dashboard visualization
// Set up alert webhooks
```

**Estimate**: 1 day

---

## 🔥 Risk Burn-Down (30-Minute Session)

### **Open Questions to Resolve Immediately**

1. **Export Scope Decision**:
   - **Question**: Single-page sites only or multi-page support?
   - **Impact**: Development complexity and timeline
   - **Decision Needed**: By end of day
   - **Owner**: [Product Lead]

2. **AI Budget Allocation**:
   - **Question**: How to split $200/month across user tiers?
   - **Options**: $50 basic, $75 pro, $75 enterprise OR usage-based
   - **Decision Needed**: By end of day
   - **Owner**: [Product Lead]

3. **Beta User Pipeline**:
   - **Question**: Who are the first 50 design partners?
   - **Action**: Create recruitment plan and contact list
   - **Decision Needed**: By end of week
   - **Owner**: [Marketing Lead]

4. **Team Capacity**:
   - **Question**: Full-time availability of developers for 90-day sprint?
   - **Action**: Confirm resource allocation and any external needs
   - **Decision Needed**: By end of day
   - **Owner**: [Engineering Manager]

5. **Compliance Requirements**:
   - **Question**: Any industry-specific needs beyond basic GDPR?
   - **Action**: Review target markets and compliance requirements
   - **Decision Needed**: By end of week
   - **Owner**: [Legal/Compliance]

---

## 📅 Sprint Cadence & Communication

### **Monday Sprint Planning**
- Review previous sprint completion
- Plan next 2-week sprint
- Assign tickets to owners
- Update epic progress bars
- Roadmap document stays untouched

### **Daily Standups**
- Focus on ticket progress, not roadmap items
- Blockers escalated immediately
- Dependencies tracked in ticket system

### **Friday Demo & Review**
- Demo completed features
- Move done tickets to "Accepted"
- Post bundle/vitals metrics to Slack
- Update roadmap changelog with lessons learned
- Review epic progress against success metrics

### **Sprint Metrics Dashboard**
- Epic completion percentage
- Bundle size compliance
- Web Vitals performance
- AI cost efficiency
- Velocity tracking

---

## 🏗️ Implementation Commands

### **Immediate Setup (Today)**
```bash
# 1. Enable bundle size gate
echo "scripts/check-bundle-size.js" >> .github/workflows/ci.yml

# 2. Set up monitoring
npm run build
node scripts/check-bundle-size.js

# 3. Start security fix
# psql $DATABASE_URL < SECURITY_RESTORE.sql (when ready)
```

### **Sprint 1 Kickoff (Monday)**
```bash
# 1. Create epic tracking
mkdir -p .github/project-board
echo "Epic tracking initialized" > .github/project-board/README.md

# 2. Set up ticket templates
mkdir -p .github/ISSUE_TEMPLATE
# Add epic and sprint templates
```

---

## 🎯 Success Criteria per Epic

### **Epic 1: Security & AI Day-1**
- ✅ RLS enabled with 0 violations in logs
- ✅ Build pipeline completely clean (0 lint/TS errors)
- ✅ Real AI services operational with cost controls
- ✅ Circuit breaker tested and functional

### **Epic 2: Monetisation & Export**
- ✅ Stripe checkout working in all 9 locales
- ✅ Basic HTML/CSS export generates functional sites
- ✅ Payment webhooks handle subscription events
- ✅ Plan enforcement prevents unauthorized access

### **Epic 3: User Hub & Teams**
- ✅ Dashboard shows all user projects with statistics
- ✅ Team collaboration with read-only access working
- ✅ Project creation/deletion flows complete
- ✅ Usage analytics visible and accurate

### **Epic 4: Performance & Launch**
- ✅ All bundles within size limits (CI enforced)
- ✅ Load testing passed for 5× projected traffic
- ✅ 50 design partners recruited and onboarded
- ✅ Soft launch successfully deployed

---

**Bottom Line**: The strategic roadmap provides the North-Star vision, but success depends on executing every line as an owned, testable task with clear accountability and measurable outcomes.

*Next Action: Create your preferred issue tracker (Jira/Linear/GitHub Issues) and import these tickets with owners and dates assigned.*
