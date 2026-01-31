# Performance-Impacting Lint Warnings Report

## Summary

Total performance-related warnings found (excluding test files):
- **Missing Hook Dependencies**: 38 occurrences
- **Using `<img>` instead of `next/image`**: 6 occurrences
- **Console.log in Render/Effect Paths**: 42 occurrences (non-test files)
- **Functions Defined in Render Scope**: 2 occurrences

## 1. Missing Hook Dependencies (react-hooks/exhaustive-deps)

These can cause stale closures, bugs, and unnecessary re-renders:

### Admin Pages
- `/src/app/admin/payments/page.tsx:31` - useEffect missing dependency: `fetchFailedPayments`
- `/src/app/admin/revenue/page.tsx:59` - useEffect missing dependency: `fetchRevenueData`
- `/src/app/admin/usage/page.tsx:58` - useEffect missing dependency: `fetchUsageData`
- `/src/app/admin/webhooks/page.tsx:31` - useEffect missing dependency: `fetchWebhookEvents`

### Auth Components
- `/src/components/auth/auth-provider.tsx:120` - useEffect missing dependency: `store`

### Builder Components
- `/src/components/builder/hints/editing-guidance.tsx:71` - useEffect missing dependencies: `guidanceSteps.length`, `handleDismiss`
- `/src/components/builder/hints/smart-hint.tsx:50` - useEffect missing dependency: `handleDismiss`
- `/src/components/builder/orchestration/chat-interface.tsx:108` - useEffect missing dependency: `startAIAnalysis`
- `/src/components/builder/orchestration/preview-manager.tsx:49` - useEffect missing dependency: `generatePreview`
- `/src/components/builder/orchestration/progress-tracker.tsx:151` - useEffect missing dependencies: `buildProgress`, `buildSteps`, `simulateOrchestrationStep`
- `/src/components/builder/orchestration/virtualized-chat-interface.tsx:219` - useEffect missing dependency: `messages`
- `/src/components/builder/question-flow/mobile-question-interface.tsx:384` - useEffect missing dependency: `currentQuestion`
- `/src/components/builder/question-flow/mobile-question-interface.tsx:493` - useCallback missing dependency: `setCurrentPreview`

### Dashboard Components
- `/src/components/dashboard/billing/revenue-chart.tsx:35` - useEffect missing dependency: `fetchRevenue`
- `/src/components/dashboard/billing/usage-monitor.tsx:100` - useEffect missing dependency: `updateUsage`
- `/src/components/dashboard/billing-section.tsx:44` - useEffect missing dependency: `checkSubscription`
- `/src/components/dashboard/projects/project-export.tsx:122` - useEffect missing dependency: `exportProject`

### UI Components
- `/src/components/ui/image-carousel.tsx:35` - useCallback missing dependency: `currentIndex`
- `/src/components/ui/image-carousel.tsx:41` - useCallback missing dependency: `currentIndex`
- `/src/components/ui/sliding-image-row.tsx:37` - useEffect missing dependency: `images.length`

### Home Page Components
- `/src/components/home/build-with-ai.tsx:70` - useEffect missing dependency: `setControls`
- `/src/components/home/floating-components.tsx:45` - useEffect missing dependency: `isInView`
- `/src/components/home/how-it-works.tsx:36` - useEffect missing dependency: `handleVideoPlay`
- `/src/components/home/process-demo.tsx:90` - useEffect missing dependencies: `currentStep`, `lastCompletedStep`
- `/src/components/home/rotating-business-ideas.tsx:42` - useEffect missing dependencies: `items.length`, `isPaused`
- `/src/components/home/video-section.tsx:75` - useEffect missing dependency: `handleVideoPlay`

### Pricing Components
- `/src/components/pricing/pricing-cards.tsx:105` - useCallback missing dependencies: `locale`, `router`
- `/src/components/pricing/pricing-toggle.tsx:25` - useEffect missing dependencies: `isMonthly`, `onToggle`

### Question Components
- `/src/components/questions/QuestionFlow.tsx:42` - useEffect missing dependency: `setCurrentStepIndex`
- `/src/components/questions/steps/ResultsPage.tsx:89` - useEffect missing dependency: `calculateScores`

### Services
- `/src/services/events/event-logger.ts:285` - Memoization for `logScreenView` has unnecessary dependencies
- `/src/services/workspace/generator/workspace-generator.ts:111` - useCallback missing dependency: `generateWorkspace`
- `/src/services/workspace/workspace-subscription-manager.ts:86` - useEffect missing dependency: `unsubscribe`

## 2. Using `<img>` Instead of Next.js Image Component

These impact LCP and bandwidth:

1. `/src/components/builder/new-project-page.tsx:122`
2. `/src/components/builder/preview/section-renderers/hero-renderer.tsx:181`
3. `/src/components/builder/preview/section-renderers/testimonials-renderer.tsx:201`
4. `/src/components/home/hero-section.tsx:297`
5. `/src/components/home/testimonials.tsx:151`
6. `/src/components/preview/[projectId]/[choiceId]/PreviewContent.tsx:120`

## 3. Console.log in Performance-Critical Paths

### Builder Components (High Impact)
- `/src/components/builder/mobile/mobile-preview-panel.tsx:36,40` - Console logs in render path
- `/src/components/builder/orchestration-interface.tsx:73,78` - Console logs in orchestration logic
- `/src/components/builder/preview/preview-renderer.tsx:35,46` - Console logs in preview rendering
- `/src/components/builder/preview/section-renderers/hero-renderer.tsx:20-23` - Multiple console logs in renderer
- `/src/components/builder/preview/section-wrapper.tsx:75,99` - Console logs in section updates
- `/src/components/builder/question-flow/mobile-question-interface.tsx` - 23 console logs throughout question flow logic
- `/src/components/builder/question-flow/question-interface.tsx` - Multiple console logs in question handling

### Dashboard Components (Medium Impact)
- `/src/components/dashboard/billing/revenue-chart.tsx:73,81,117` - Console logs in chart updates
- `/src/components/dashboard/projects/project-search.tsx:30` - Console log in search handler

### Home Page Components (Low-Medium Impact)
- `/src/components/home/animated-checkmarks.tsx:85` - Console log in animation callback
- `/src/components/home/sliding-image-row.tsx:60` - Console log in effect

## 4. Functions Defined in Render Scope

These cause unnecessary re-renders:

1. `/src/components/builder/builder-wrapper.tsx:60,62` - `openModal` and `openBuilder` functions make useCallback dependencies change on every render
2. `/src/components/pricing/pricing-cards.tsx:105` - Callback function with unstable dependencies

## Recommendations

### Priority 1 - Fix Missing Dependencies
- Add missing dependencies to hooks to prevent stale closures
- Use `useCallback` for stable function references
- Consider using `useRef` for values that shouldn't trigger re-renders

### Priority 2 - Replace `<img>` with Next.js Image
- Replace all 6 instances with `next/image` for automatic optimization
- This will improve LCP scores and reduce bandwidth usage

### Priority 3 - Remove Console Logs from Production Code
	•	Use logger.debug() or a custom logger that’s stripped from builds.
  • if needed, set up a babel plugin to auto-remove console.log.


### Priority 4 - Optimize Render Functions
- Move function definitions outside components or wrap with useCallback (⚠️ Reminder: Avoid premature optimization—do this for hot paths, especially those passing functions as props to memoed components.)
- Ensure stable references for functions passed as props

## Implementation Plan

### Phase 1 - Fix Missing Hook Dependencies (Priority: HIGH)
**Goal**: Prevent stale closures and bugs by ensuring all hook dependencies are properly declared.

#### 1.1 Admin Pages (4 files) ✅ Completed
- [x] `/src/app/admin/payments/page.tsx` - Add `fetchFailedPayments` to useEffect ✅ Fixed with useCallback
- [x] `/src/app/admin/revenue/page.tsx` - Add `fetchRevenueData` to useEffect ✅ Fixed with useCallback
- [x] `/src/app/admin/usage/page.tsx` - Add `fetchUsageData` to useEffect ✅ Fixed with useCallback
- [x] `/src/app/admin/webhooks/page.tsx` - Add `fetchWebhookEvents` to useEffect ✅ Fixed with useCallback

#### 1.2 Builder Components (7 files) ⏳ In Progress
- [x] `/src/components/builder/question-flow/mobile-question-interface.tsx` - Fix 2 hook issues ✅ Fixed dependencies
- [x] `/src/components/builder/orchestration/progress-tracker.tsx` - Fix 3 missing dependencies ✅ Fixed all 3
- [x] `/src/components/builder/hints/editing-guidance.tsx` - Fix 2 missing dependencies ✅ Fixed with useMemo
- [x] `/src/components/builder/hints/smart-hint.tsx` - Fix 1 missing dependency ✅ Fixed with useCallback
- [ ] `/src/components/builder/orchestration/chat-interface.tsx` - Fix 1 missing dependency
- [ ] `/src/components/builder/orchestration/preview-manager.tsx` - Fix 1 missing dependency
- [ ] `/src/components/builder/orchestration/virtualized-chat-interface.tsx` - Fix 1 missing dependency

#### 1.3 Dashboard & UI Components (4 files)
- [ ] `/src/components/dashboard/billing-section.tsx` - Add `checkSubscription`
- [ ] `/src/components/dashboard/projects/project-export.tsx` - Add `exportProject`
- [ ] `/src/components/ui/image-carousel.tsx` - Fix 2 useCallback dependencies
- [ ] `/src/components/ui/sliding-image-row.tsx` - Add `images.length`

#### 1.4 Home Page Components (6 files)
- [ ] `/src/components/home/build-with-ai.tsx` - Add `setControls`
- [ ] `/src/components/home/floating-components.tsx` - Add `isInView`
- [ ] `/src/components/home/how-it-works.tsx` - Add `handleVideoPlay`
- [ ] `/src/components/home/process-demo.tsx` - Add 2 dependencies
- [ ] `/src/components/home/rotating-business-ideas.tsx` - Add 2 dependencies
- [ ] `/src/components/home/video-section.tsx` - Add `handleVideoPlay`

### Phase 2 - Replace `<img>` with `next/image` (Priority: MEDIUM)
- [ ] Replace 6 instances for automatic optimization and lazy loading

### Phase 3 - Remove Console Logs (Priority: MEDIUM)
- [ ] Clean mobile-question-interface.tsx (23 logs)
- [ ] Clean remaining production code (19 logs)

### Phase 4 - Optimize Render Functions (Priority: LOW)
- [ ] Fix 2 render scope function definitions

## Progress Tracking

### Completed: 12/88 issues
- Missing Dependencies: 12/38 ✅
- Image Optimizations: 0/6 ✅
- Console Logs Removed: 0/42 ✅
- Render Functions: 0/2 ✅

### Current Status: Phase 1.2 In Progress - Builder Components (4/7 files complete)
