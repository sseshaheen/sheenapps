# Playwright Upgrade Plan: 1.54.2 → 1.57

## Overview

| Item | Current | Target |
|------|---------|--------|
| Version | 1.54.2 | 1.57.x |
| Chromium | ~139.x | 143.0.7499.4 |
| Firefox | ~140.x | 144.0.2 |
| WebKit | ~26.x | 26.0 |

---

## Risk Assessment: LOW

Your project has **no breaking changes** that require code modifications:
- No `page.accessibility` usage (removed in 1.57)
- No deprecated `page.type()` / `locator.type()` usage
- No `browserContext.on('backgroundpage')` usage
- No glob URL patterns with `?` or `[]`
- Config already uses `defineConfig()` (required since 1.31)

---

## Changes Across Versions (1.55 → 1.57)

### Version 1.57 (Latest)

**Major Change: Chrome for Testing**
- Playwright now uses **Chrome for Testing** instead of Chromium
- Tests should continue working with no changes
- Visual difference: new Chrome icon/title in toolbar
- Arm64 Linux still uses Chromium

**Breaking Changes:**
- `page.accessibility` API removed (deprecated 3 years ago) — **Not used in your project**

**New Features Available:**
- `testConfig.webServer.wait` - regex-based server readiness check
- `testConfig.tag` - add tags to all tests in a run
- `worker.on('console')` - capture worker console events
- `locator.description()` - get locator descriptions
- Speedboard in HTML reporter - tests sorted by execution time
- Service Worker network requests now routable

### Version 1.56

**New Features:**
- **Playwright Agents** - AI-guided test creation (planner, generator, healer)
- `page.consoleMessages()`, `page.pageErrors()`, `page.requests()` - retrieve recent page activity
- `--test-list` CLI flag for manual test specification
- UI Mode enhancements: merge files, update snapshots option
- `PLAYWRIGHT_TEST` env var in worker processes

**Deprecation:**
- `browserContext.on('backgroundpage')` deprecated — **Not used in your project**

### Version 1.55

**New Features:**
- `testStepInfo.titlePath` - full title path through steps
- Codegen generates automatic `toBeVisible()` assertions
- Debian 13 "Trixie" support

**Breaking Change:**
- Dropped Chromium extension manifest v2 support — **N/A for your tests**

---

## Upgrade Steps

### Step 1: Update Package

```bash
npm install @playwright/test@1.57 --save-dev
```

### Step 2: Install New Browsers

```bash
npx playwright install --with-deps
```

> This downloads Chrome for Testing (new in 1.57) plus Firefox and WebKit.

### Step 3: Verify Configuration

Your `playwright.config.ts` is already compatible. No changes required.

**Optional Enhancement** — Add `wait` field to webServer for more reliable startup:

```typescript
// playwright.config.ts - webServer section
webServer: {
  command: process.env.TEST_TYPE === 'p0' ? 'npm run dev:test' : 'npm run dev',
  url: process.env.TEST_TYPE === 'p0' ? 'http://localhost:3100' : 'http://localhost:3000',
  reuseExistingServer: true,
  timeout: 120 * 1000,
  wait: /ready/i,  // NEW in 1.57: Wait for this regex in stdout
  // ... rest of config
},
```

### Step 4: Run Test Suite

```bash
# Run smoke tests
npm run test:smoke

# Run with headed mode to verify Chrome for Testing
npm run test:smoke:headed

# Run P0 tests
npm run test:e2e:p0
```

### Step 5: Visual Verification

After running headed tests, confirm:
- Browser window shows Chrome icon (not Chromium)
- Title bar shows "Chrome for Testing"
- All tests pass as before

---

## Optional: New Features to Consider Adopting

### 1. Speedboard in HTML Reporter (1.57)

Already enabled automatically. After running tests:
```bash
npx playwright show-report
```
Look for the new Speedboard view showing tests sorted by execution time.

### 2. Page Activity Methods (1.56)

Useful for debugging flaky tests:

```typescript
test('example', async ({ page }) => {
  await page.goto('/dashboard')

  // Debug: Get recent console messages
  const consoleLogs = await page.consoleMessages()
  console.log('Console:', consoleLogs.map(m => m.text()))

  // Debug: Get recent page errors
  const errors = await page.pageErrors()
  if (errors.length) console.log('Errors:', errors)
})
```

### 3. Test Tags at Config Level (1.57)

Add tags to all tests in a run:

```typescript
// playwright.config.ts
export default defineConfig({
  tag: ['@nightly'],  // All tests get this tag
  // ...
})
```

### 4. Service Worker Routing (1.57)

If you need to mock Service Worker requests:

```typescript
await context.route('**/sw.js', route => route.fulfill({
  body: 'self.addEventListener("fetch", () => {})',
}))
```

---

## Rollback Plan

If issues arise:

```bash
# Revert to previous version
npm install @playwright/test@1.54.2 --save-dev

# Reinstall browsers
npx playwright install --with-deps
```

---

## Pre-Upgrade Checklist

- [ ] Ensure all current tests pass (`npm run test:smoke`)
- [ ] Commit any pending changes
- [ ] Create backup branch: `git checkout -b pre-playwright-1.57`

## Post-Upgrade Checklist

- [ ] `npm install @playwright/test@1.57 --save-dev`
- [ ] `npx playwright install --with-deps`
- [ ] `npm run test:smoke` passes
- [ ] `npm run test:smoke:headed` shows Chrome icon
- [ ] `npm run test:e2e:p0` passes
- [ ] Review HTML report Speedboard for slow tests
- [ ] Delete this plan file or move to docs

---

## Sources

- [Playwright Release Notes](https://playwright.dev/docs/release-notes)
- [GitHub Releases](https://github.com/microsoft/playwright/releases)
- [Chrome for Testing Announcement](https://medium.com/@nickcis/playwright-1-57-the-must-use-update-for-web-test-automation-in-2025-b194df6c9e03)
