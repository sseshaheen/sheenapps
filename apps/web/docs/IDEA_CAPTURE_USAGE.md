# Idea Capture Input - Usage Guide

## **The Component**

`src/components/shared/idea-capture-input-v2.tsx`

**Key improvements over original:**
- ✅ Uses CVA (matches your Button/Card pattern)
- ✅ Composition via `children` prop (no prop soup)
- ✅ Fixes IME composition bug (Arabic/Chinese input safe)
- ✅ Stable refs via `forwardRef`
- ✅ Simpler API (3 required props, rest optional)

---

## **Usage 1: Homepage Hero**

**File:** `src/components/sections/hero-v2-client.tsx`

```typescript
import { IdeaCaptureInput } from '@/components/shared/idea-capture-input-v2'
import { TypingAnimation } from '@/components/ui/typing-animation'

export function HeroV2Client({ ... }) {
  const [ideaText, setIdeaText] = useState('')
  const [isBuilding, setIsBuilding] = useState(false)

  const handleStartBuilding = () => {
    setIsBuilding(true)
    router.push('/builder/new')
  }

  return (
    <section>
      {/* ... header content ... */}

      <IdeaCaptureInput
        variant="hero"
        value={ideaText}
        onChange={setIdeaText}
        onSubmit={handleStartBuilding}
        isSubmitting={isBuilding}
        submitText={startBuilding}
        voiceText={useVoice} // Shows voice button
        placeholder={demoPrompt}
      >
        {/* Typing animation via children slot */}
        <div className="pointer-events-none absolute inset-0 p-3 sm:p-4">
          <TypingAnimation
            sequences={businessIdeas}
            className="text-sm sm:text-base md:text-lg text-white font-mono leading-relaxed"
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>
      </IdeaCaptureInput>
    </section>
  )
}
```

**Diff:**
```diff
- <textarea value={ideaText} ... 30 lines of code />
- <button onClick={handleVoiceClick}>...</button>
- <VoiceRecordingModal ... />
+ <IdeaCaptureInput ... 10 lines />
```

---

## **Usage 2: Builder/New Page**

**File:** `src/components/builder/new-project-page.tsx`

```typescript
import { IdeaCaptureInput } from '@/components/shared/idea-capture-input-v2'

export function NewProjectPage({ translations, locale }: NewProjectPageProps) {
  const [businessIdea, setBusinessIdea] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateProject = async () => {
    if (!businessIdea.trim()) return
    setIsCreating(true)
    // ... creation logic
  }

  return (
    <div>
      {/* ... header ... */}

      <IdeaCaptureInput
        variant="page"
        value={businessIdea}
        onChange={setBusinessIdea}
        onSubmit={handleCreateProject}
        isSubmitting={isCreating}
        submitText={translations.builder.newProject.startBuilding}
        voiceText={translations.builder.newProject.useVoice} // NOW WORKS!
        placeholder={translations.builder.newProject.placeholder}
        disabled={!isAuthenticated} // Grays out for logged-out users
      >
        {/* Helper text via children slot */}
        {!isAuthenticated && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-gray-400">
              {translations.builder.newProject.signInPlaceholder}
            </p>
          </div>
        )}
      </IdeaCaptureInput>

      {/* Wizard toggle still works independently */}
      <div className="mt-6">
        <InfraModeSelector ... />
      </div>
    </div>
  )
}
```

**Diff:**
```diff
- <Textarea id="businessIdea" ... />
- <Button variant="outline" disabled>Voice</Button> // ❌ Always disabled
+ <IdeaCaptureInput voiceText="Use Voice" /> // ✅ Now works!
```

---

## **Usage 3: Custom Voice Handling** (Advanced)

If you need custom logic when voice completes:

```typescript
<IdeaCaptureInput
  value={idea}
  onChange={setIdea}
  onSubmit={handleSubmit}
  submitText="Submit"
  voiceText="Record"
  onVoiceTranscription={(transcribed) => {
    // Custom logic instead of default replace
    setIdea(prev => prev + '\n\n' + transcribed) // Append
    trackAnalytics('voice-used', { length: transcribed.length })
  }}
/>
```

---

## **Why This Works (vs Original Approach)**

### **Original (Had Prop Soup Risk):**
```typescript
<IdeaCaptureInput
  variant="hero"
  examples={[...]} // Prop
  showExamples={true} // Prop
  examplesFormat="typing" // Prop
  analyticsPage="hero" // Prop
  analyticsVariant="v2" // Prop
  validationRules={{ minLength: 10 }} // Prop
  showCharCount={true} // Prop
  // ... 15 more props
/>
```

### **New (Composition):**
```typescript
<IdeaCaptureInput variant="hero" submitText="Go" voiceText="Record">
  {/* Whatever you want goes here as children */}
  <TypingAnimation ... />
  <CharCounter ... />
  <HelperText ... />
</IdeaCaptureInput>
```

**Key insight:** The component doesn't need to know about typing animations, char counters, helper text. It just needs a `children` slot.

---

## **Technical Gotchas Fixed**

### **1. IME Composition Bug**

**Problem:** Cmd+Enter during Arabic input would submit mid-word.

**Fix:**
```typescript
handleKeyDown(e) {
  if (e.nativeEvent.isComposing) return // ✅ Check IME state
  if (e.key === 'Enter' && e.metaKey) onSubmit()
}
```

### **2. Voice Modal Scroll Lock**

**Problem:** Opening voice modal on hero locks body scroll.

**Fix:** VoiceRecordingModal already uses Radix Dialog which handles this. No change needed.

### **3. RTL Arrow Flip**

**Problem:** Manual `rtl:rotate-180` scattered everywhere.

**Fix:** Centralized in component:
```typescript
<Icon name="arrow-right" className="rtl:rotate-180" />
```

---

## **Migration Steps (10 Minutes Total)**

### **Step 1: Homepage (5 min)**

```bash
# File: src/components/sections/hero-v2-client.tsx

# 1. Add import
+ import { IdeaCaptureInput } from '@/components/shared/idea-capture-input-v2'

# 2. Replace lines 175-240 with:
<IdeaCaptureInput
  variant="hero"
  value={ideaText}
  onChange={setIdeaText}
  onSubmit={handleStartBuilding}
  isSubmitting={isBuilding}
  submitText={startBuilding}
  voiceText={useVoice}
  placeholder={demoPrompt}
>
  <div className="pointer-events-none absolute inset-0 p-3 sm:p-4">
    <TypingAnimation
      sequences={businessIdeas}
      className="text-sm sm:text-base md:text-lg text-white font-mono"
      dir={isRTL ? 'rtl' : 'ltr'}
    />
  </div>
</IdeaCaptureInput>

# 3. Remove old state/handlers:
- const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false)
- const handleVoiceClick = () => setIsVoiceModalOpen(true)
- const handleVoiceTranscription = (text) => setIdeaText(text)
```

### **Step 2: Builder/New Page (5 min)**

```bash
# File: src/components/builder/new-project-page.tsx

# 1. Add import
+ import { IdeaCaptureInput } from '@/components/shared/idea-capture-input-v2'

# 2. Replace lines 810-850 with:
<IdeaCaptureInput
  variant="page"
  value={businessIdea}
  onChange={setBusinessIdea}
  onSubmit={handleCreateProject}
  isSubmitting={isCreating}
  submitText={translations.builder.newProject.startBuilding}
  voiceText={translations.builder.newProject.useVoice}
  placeholder={translations.builder.newProject.placeholder}
  disabled={!isAuthenticated}
/>

# 3. No state to remove (voice was already broken)
```

### **Step 3: Test (2 min)**

```bash
# Enable voice feature
echo "NEXT_PUBLIC_ENABLE_VOICE_INPUT=true" >> .env.local

# Run dev server
npm run dev:safe

# Test both pages:
# 1. http://localhost:3000/en (homepage)
# 2. http://localhost:3000/en/builder/new

# Voice button should appear on BOTH pages now ✅
```

---

## **What You Get**

### **Before:**
- ❌ Voice works on homepage only
- ❌ Voice button disabled on builder/new
- ❌ 150+ lines of duplicate code
- ❌ Bug fixes needed in 2 places

### **After:**
- ✅ Voice works everywhere
- ✅ Voice button functional on all pages
- ✅ 80 lines of shared code
- ✅ Bug fixes applied once

---

## **Future-Proofing**

Want to add file upload later?

```typescript
// 1. Add prop to component
interface IdeaCaptureInputProps {
  uploadText?: string
  onFileUpload?: (files: File[]) => void
}

// 2. Add button in component
{uploadEnabled && (
  <Button variant="outline" onClick={handleUpload}>
    <Icon name="paperclip" /> {uploadText}
  </Button>
)}

// 3. Use in both pages immediately
<IdeaCaptureInput
  voiceText="Voice"
  uploadText="Upload"
  onFileUpload={handleFiles}
/>
```

No prop soup because upload logic lives in parent, not in component.

---

## **Analytics Separation** (As Expert Suggested)

Keep analytics in parents, not in shared component:

```typescript
// Hero page
<IdeaCaptureInput
  onSubmit={() => {
    trackEvent('hero-cta-clicked', { locale })
    handleStartBuilding()
  }}
/>

// Builder page
<IdeaCaptureInput
  onSubmit={() => {
    trackEvent('project-created', { locale, method: 'builder-new' })
    handleCreateProject()
  }}
/>
```

Different events, same component. Clean separation.
