# SheenApps Smoke Test Plan

## Overview
This document outlines the comprehensive smoke test strategy for SheenApps - a focused suite that validates critical user flows in under 90 seconds.

## Test Scope & Objectives

### Primary Goals
- **Fast Feedback**: Complete suite runs in <90 seconds
- **High Reliability**: <1% flake rate with retry mechanisms
- **Clear Ownership**: Each test area has a designated owner
- **Actionable Failures**: Immediate Slack notifications to responsible team

### What We Test (Happy Paths Only)
1. **Authentication**: Sign up → Email confirm → Login flow
2. **Dashboard**: Project CRUD operations with optimistic updates
3. **Builder**: AI generation, content editing, undo/redo
4. **Billing**: Stripe checkout and subscription status
5. **Internationalization**: Locale switching and RTL support

### What We Don't Test (Deferred to Full E2E)
- Edge cases and error scenarios
- All social auth providers (only Google mocked)
- Complex webhook scenarios
- Mobile touch interactions
- Cross-browser compatibility

## Pass/Fail Checkpoints

### 1. Authentication (Owner: @auth-team)
- ✅ New user can sign up and receive stubbed email confirmation
- ✅ User can log in and land on dashboard
- ✅ Google OAuth mock completes successfully
- ✅ Password reset flow shows success message
- ✅ Auth tokens stored correctly in localStorage

### 2. Dashboard (Owner: @dashboard-team)
- ✅ User can create new project with toast confirmation
- ✅ Project rename updates optimistically in UI
- ✅ Project opens to correct workspace URL
- ✅ Duplicate creates new project with unique ID
- ✅ Delete removes project from grid immediately
- ✅ No console errors during any operation

### 3. Builder (Owner: @builder-team)
- ✅ First question answered successfully
- ✅ AI content streams within 10 seconds
- ✅ Content editor accepts text changes
- ✅ Undo reverts to exact previous state
- ✅ Redo restores exact changed state
- ✅ Preview updates reflect changes

### 4. Billing (Owner: @revenue-team)
- ✅ Dashboard billing page loads without 404
- ✅ Stripe checkout completes with test card (pm_card_visa)
- ✅ "Pro" badge appears after successful payment
- ✅ Billing portal link generates (no navigation required)
- ✅ Subscription status reflects in UI

### 5. Internationalization (Owner: @platform-team)
- ✅ /ar-eg route loads with RTL html[dir="rtl"]
- ✅ Navigation labels show in Arabic
- ✅ Builder UI elements properly translated
- ✅ Locale persists across navigation

## When to Update This Test Suite

### Add New Tests When:
- **New Locale Added**: Update i18n.smoke.spec.ts with new locale code
- **New Billing Tier**: Add tier verification to billing.smoke.spec.ts
- **New Auth Provider**: Add provider mock to auth.smoke.spec.ts
- **Major Feature Launch**: Create new spec file with @smoke tag
- **Critical Bug Fixed**: Add regression test to prevent recurrence

### Update Existing Tests When:
- **UI Redesign**: Update selectors and assertions
- **API Changes**: Update request mocks and responses
- **Flow Changes**: Adjust step sequences
- **Performance Baseline Shift**: Update timing expectations

### Review Quarterly For:
- Tests that always pass (might be testing the wrong thing)
- Tests taking >15s (optimize or move to full E2E)
- New critical paths not covered
- Deprecated features still being tested

## Technical Implementation

### Test Stack
- **Framework**: Playwright with TypeScript
- **Browser**: Chromium only (for speed)
- **Parallelization**: Disabled (workers=1) to avoid race conditions
- **Retries**: 2x in CI, 0x locally
- **Timeouts**: 45s per test, 120s global

### Environment Configuration
```bash
# Required environment variables
STRIPE_TEST_KEY=sk_test_xxx
SUPABASE_TEST_KEY=xxx
PLAYWRIGHT_CRYPTO_KEY=xxx  # For report encryption
ENABLE_EVENT_SYSTEM=false  # Reduce noise in tests
```

### Test Data Management
- **User**: Pre-seeded "smoke_user@test.com" via Supabase API
- **Projects**: Template project created before each test run
- **Payments**: Stripe test tokens (pm_card_visa)
- **Cleanup**: Automatic via test lifecycle hooks

#### Required Test User Setup
For smoke tests to pass, create a test user in your local Supabase:

**Option 1: Via Supabase Dashboard**
1. Go to Authentication → Users in Supabase Dashboard
2. Click "Add user" → "Create new user"
3. Email: `smoke_user@test.com`
4. Password: `SmokeTest123!`
5. Check "Auto Confirm Email"

**Option 2: Via SQL Editor**
```sql
-- Create user with confirmed email
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'smoke_user@test.com',
  crypt('SmokeTest123!', gen_salt('bf')),
  now(),
  now(),
  now()
);
```

## CI/CD Integration

### GitHub Actions Workflow
- **Trigger**: Every push and PR
- **Timeout**: 8 minutes (includes setup)
- **Caching**: Stripe CLI cached between runs
- **Artifacts**: Encrypted reports uploaded
- **Branch Protection**: Required check before merge

### Failure Handling
1. **Immediate**: Slack notification to test owner
2. **Artifacts**: Screenshots, videos, console logs
3. **Retry**: Automatic 2x retry before failure
4. **Rollback**: Block deployment on failure

## Performance Monitoring

### Baseline Metrics
Initial baseline captured on: 2025-06-26
- basic.smoke.spec.ts: 16.1s total (5 tests)
  - Homepage loads successfully: 5.4s
  - Internationalization basics: 4.1s  
  - Performance baseline: 4.2s
  - Login page is accessible: 1.4s
  - API endpoints respond: 1.1s

### Performance Alerts
- **Warning**: Test duration >120% of baseline
- **Critical**: Test duration >150% of baseline
- **Action**: Investigate root cause within 24 hours

### Reporting
- **Real-time**: Console output during runs
- **Historical**: Grafana dashboard (main branch only)
- **Trends**: Weekly performance regression report
- **SLOs**: 99% pass rate, <90s total runtime

## Security & Privacy

### Data Protection
- Test reports encrypted with PLAYWRIGHT_CRYPTO_KEY
- No real user data in tests
- PII scrubbed from artifacts
- Secrets stored in GitHub encrypted secrets

### Access Control
- Only platform team can modify smoke tests
- Test results visible to all engineering
- Grafana dashboard read-only for stakeholders

## Maintenance Schedule

### Daily
- Automated runs on every commit
- Owner responds to failures

### Weekly
- Review flaky test report
- Update baseline if needed
- Clean up old artifacts

### Monthly
- Full test audit by platform team
- Update deprecated selectors
- Review and optimize slow tests

### Quarterly
- Stakeholder review of coverage
- Update ownership assignments
- Plan for new feature coverage

## Quick Reference

### Running Tests Locally
```bash
# Install dependencies
npm install
npx playwright install chromium --with-deps

# Run all smoke tests
npm run test:smoke

# Run with UI
npm run test:smoke:ui

# Debug specific test
npm run test:smoke:debug

# Update baseline
npm run test:smoke:baseline
```

### Common Issues
1. **Stripe webhook timeout**: Ensure `stripe listen --stop` in cleanup
2. **Flaky AI tests**: Use `expect.poll()` with 10s timeout
3. **Auth race conditions**: Check localStorage before assertions
4. **Locale persistence**: Clear cookies between tests

### Contact
- **Platform Team**: #platform-team slack channel
- **Test Failures**: Auto-posted to #eng-alerts
- **Questions**: Create issue in GitHub with `smoke-test` label

---

Last Updated: 2025-06-26
Next Review: 2025-07-26
Implementation Status: ✅ **ACTIVE** - Smoke tests deployed and running