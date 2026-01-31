# Idea Capture Input Unification Plan

## **Problem Statement**

Component drift between homepage hero and builder/new page has created:
- ❌ Inconsistent UX (voice works on homepage, disabled on builder/new)
- ❌ Duplicate code (two separate implementations)
- ❌ Maintenance burden (fixing bugs in multiple places)
- ❌ Feature fragmentation (new features added to one but not the other)

## **Solution: Single Source of Truth**

Created `src/components/shared/idea-capture-input.tsx` - a unified component that:
- ✅ Works identically across all contexts
- ✅ Respects feature flags (VOICE_INPUT)
- ✅ Supports RTL properly
- ✅ Has variant system for visual differences (hero vs page)
- ✅ Prevents future drift

---

## **Migration Plan**

### **Phase 1: Homepage Hero Migration**

**File:** `src/components/sections/hero-v2-client.tsx`

**Before:**
```typescript
// Custom textarea + VoiceRecordingModal inline
<textarea
  value={ideaText}
  onChange={(e) => setIdeaText(e.target.value)}
  // ... lots of custom props
/>
<button onClick={handleVoiceClick}>
  {useVoice}
</button>
<VoiceRecordingModal ... />
```

**After:**
```typescript
import { IdeaCaptureInput } from '@/components/shared/idea-capture-input'

<IdeaCaptureInput
  value={ideaText}
  onChange={setIdeaText}
  onSubmit={handleStartBuilding}
  isSubmitting={isBuilding}
  variant="hero"
  examples={businessIdeas}
  translations={{
    submit: startBuilding,
    useVoice: useVoice
  }}
/>
```

**Benefits:**
- 30+ lines of code removed
- Voice feature automatically included
- RTL handled automatically
- Feature flags respected

---

### **Phase 2: Builder/New Page Migration**

**File:** `src/components/builder/new-project-page.tsx`

**Current State (lines 810-850):**
```typescript
// Manual textarea implementation
<Textarea
  id="businessIdea"
  value={businessIdea}
  onChange={(e) => setBusinessIdea(e.target.value)}
  // ... manual RTL handling
/>

// Disabled voice button (doesn't work)
<Button variant="outline" size="lg" disabled>
  <Icon name="mic" />
  {translations.builder.newProject.useVoice}
</Button>
```

**After:**
```typescript
import { IdeaCaptureInput } from '@/components/shared/idea-capture-input'

<IdeaCaptureInput
  value={businessIdea}
  onChange={setBusinessIdea}
  onSubmit={handleCreateProject}
  isSubmitting={isCreating}
  variant="page"
  placeholder={translations.builder.newProject.placeholder}
  examples={translations.builder.newProject.examples.map(text => ({
    text,
    duration: 3000,
    pauseAfter: 1000
  }))}
  translations={{
    submit: translations.builder.newProject.startBuilding,
    useVoice: translations.builder.newProject.useVoice,
    uploadFiles: translations.builder.newProject.uploadFiles
  }}
  disabled={!isAuthenticated}
/>
```

**Benefits:**
- Voice button now WORKS (when VOICE_INPUT feature flag enabled)
- Consistent with homepage
- RTL handled automatically
- Less code to maintain

---

## **Feature Flag Strategy**

The unified component respects the `VOICE_INPUT` feature flag:

```typescript
// src/config/features.ts
export const FEATURES = {
  VOICE_INPUT: process.env.NEXT_PUBLIC_ENABLE_VOICE_INPUT === 'true',
  // ...
}
```

**Rollout Plan:**
1. Deploy unified component to production (disabled by default)
2. Enable for 10% of users (A/B test)
3. Monitor error rates and usage metrics
4. Enable for 50% of users
5. Enable for all users
6. Remove feature flag once stable

---

## **Testing Checklist**

### **Homepage Hero Testing**
- [ ] Voice button appears (when feature flag enabled)
- [ ] Voice button hidden (when feature flag disabled)
- [ ] Voice recording modal opens on click
- [ ] Transcription populates textarea
- [ ] Submit button works with keyboard (Cmd+Enter)
- [ ] Submit button disabled when empty
- [ ] Submit button works when clicked
- [ ] Typing animation works when textarea empty
- [ ] Typing animation stops when focused
- [ ] RTL text aligns right (ar-eg, ar-sa, ar-ae, ar)
- [ ] RTL placeholder aligns right
- [ ] RTL submit button has flipped arrow

### **Builder/New Page Testing**
- [ ] Voice button appears (when feature flag enabled)
- [ ] Voice button works (not disabled anymore)
- [ ] Voice recording modal opens
- [ ] Transcription populates textarea
- [ ] Submit creates project
- [ ] Disabled state when not authenticated
- [ ] RTL support works
- [ ] Wizard toggle still works (not affected by migration)
- [ ] Infrastructure mode selector still works

### **Cross-Browser Testing**
- [ ] Chrome (desktop)
- [ ] Safari (desktop + iOS)
- [ ] Firefox (desktop)
- [ ] Edge (desktop)
- [ ] Chrome Mobile (Android)

### **Regression Testing**
- [ ] Homepage CTA metrics still tracked
- [ ] Builder page project creation still works
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] No visual regressions (screenshot diff)

---

## **Rollback Plan**

If issues arise after migration:

**Immediate Rollback (< 5 minutes):**
1. Revert to previous Git commit
2. Deploy immediately
3. Monitor metrics

**Feature Flag Rollback (< 1 minute):**
```bash
# Disable voice input via feature flag
NEXT_PUBLIC_ENABLE_VOICE_INPUT=false
```

**Component-Level Rollback:**
- Homepage hero: Keep old implementation as `hero-v2-client-legacy.tsx`
- Builder/new: Keep old implementation in Git history
- Toggle via feature flag: `USE_LEGACY_IDEA_CAPTURE`

---

## **Success Metrics**

**Before Migration:**
- Voice feature availability: 50% (only on homepage)
- Code duplication: 2 implementations
- Lines of code: ~150 total
- Bug fix effort: 2x (need to fix in both places)

**After Migration:**
- Voice feature availability: 100% (when enabled)
- Code duplication: 1 implementation
- Lines of code: ~80 total (47% reduction)
- Bug fix effort: 1x (fix once, applies everywhere)

**User-Facing Metrics:**
- Voice usage rate: Track in analytics
- Idea submission rate: Should remain stable or increase
- Error rate: Should remain at 0%
- User confusion reports: Should decrease

---

## **Implementation Order**

**Week 1: Foundation**
1. ✅ Create unified `IdeaCaptureInput` component
2. ✅ Add comprehensive JSDoc and TypeScript types
3. Write Storybook stories for visual testing
4. Add unit tests (React Testing Library)

**Week 2: Homepage Migration**
1. Migrate hero page to use `IdeaCaptureInput`
2. Test on staging
3. Deploy to production (feature flag OFF)
4. Monitor metrics for 48 hours
5. Enable feature flag for 10% of users
6. Monitor for 7 days

**Week 3: Builder/New Migration**
1. Migrate builder/new page to use `IdeaCaptureInput`
2. Test on staging
3. Deploy to production (feature flag OFF)
4. Monitor metrics for 48 hours
5. Enable feature flag for 10% of users
6. Monitor for 7 days

**Week 4: Full Rollout**
1. Enable for 50% of users
2. Monitor for 3 days
3. Enable for 100% of users
4. Remove legacy code after 30 days of stability

---

## **Future Enhancements**

Once unified component is stable:

1. **File Upload Support**
   - Add drag-and-drop
   - Support images, PDFs, Figma files
   - Show file previews

2. **Rich Text Editing**
   - Markdown support
   - Link previews
   - @ mentions for AI features

3. **Smart Suggestions**
   - AI-powered autocomplete
   - Industry-specific templates
   - Previous idea history

4. **Multi-Language Voice**
   - Detect language automatically
   - Support 9+ languages
   - Real-time translation

---

## **References**

**Existing Components:**
- Voice recording: `src/components/sections/voice-recording-modal.tsx`
- Typing animation: `src/components/ui/typing-animation.tsx`
- RTL utilities: `src/utils/rtl.ts`
- Feature flags: `src/config/features.ts`

**Similar Patterns in Codebase:**
- Chat input unification: `src/components/builder/chat/chat-input.tsx`
- Composer unification: `src/components/workspace/composer.tsx`
- Modal patterns: `src/components/ui/dialog.tsx`

**Best Practices Applied:**
- Single source of truth (DRY principle)
- Feature flag driven development
- Variant system for flexibility
- Comprehensive TypeScript types
- RTL-first design
- Accessibility (ARIA labels, keyboard shortcuts)
