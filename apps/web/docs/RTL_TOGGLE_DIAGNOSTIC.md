# RTL Toggle Switch Diagnostic Report

## ✅ RESOLVED - Expert Solution Applied

## Issue Summary (FIXED)
Toggle switch component behaved inconsistently in RTL (Arabic) locales - fixing one mode (monthly/yearly) broke the other mode's visual alignment. **This has been resolved using the expert's recommended solution.**

## Current Implementation
**File:** `/src/components/pricing/billing-toggle.tsx`

**Current RTL Solution:**
```typescript
// Layout mirroring
<div className={cn(
  "flex items-center justify-center gap-4",
  isRTL && "flex-row-reverse" // Reverse layout order
)}>

// Toggle switch mirroring
<button className={cn(
  "relative w-14 h-7 bg-gray-700 rounded-full",
  isRTL && "scale-x-[-1]" // Flip toggle horizontally
)}>

// Circle position (same logic for both LTR/RTL)
<m.div animate={{ x: billingCycle === 'monthly' ? 2 : 26 }} />
```

## Problem Description
- **Layout Order:** `flex-row-reverse` correctly mirrors: `Monthly | Toggle | Yearly` → `Yearly | Toggle | Monthly`
- **Toggle Visual:** `scale-x-[-1]` flips the toggle switch horizontally
- **Circle Logic:** Uses same positions (2 for left, 26 for right) in both LTR/RTL

**User Report:** "fix one mode the other looks weird on rtl"

## Attempted Solutions
1. **Dual Layout Approach:** Separate RTL/LTR components - caused positioning conflicts
2. **Position Logic Reversal:** Changed circle positions for RTL - broke consistency
3. **Current Approach:** CSS mirroring with consistent logic - still problematic

## Technical Context
- **Component Structure:** `Label | Toggle | Label + Badge`
- **Toggle Dimensions:** 56px width (w-14), 28px height (h-7)
- **Circle Size:** 20px (w-5 h-5) with 4px margin (top-1)
- **Circle Range:** Position 2 (left) to 26 (right) = 24px travel
- **Animation:** Framer Motion spring animation

## Test Case
**URL:** `http://localhost:3000/ar/pricing`
**Steps:**
1. Load Arabic pricing page
2. Toggle between monthly/yearly billing
3. Observe circle position relative to active label

## Research References
Based on Material Design, Apple HIG, and RTL design best practices:
- RTL components should be visually mirrored
- Internal logic can remain consistent
- Toggle switches typically use CSS transforms for RTL

## ✅ Expert Solution Applied

**Root Cause Identified**: The `scale-x-[-1]` flip on the toggle track broke the coordinate system, causing inconsistent behavior.

**Expert's Recommendation**:
1. **Mirror labels only**: Keep `flex-row-reverse` for layout
2. **Don't mirror the track**: Remove `scale-x-[-1]` completely
3. **Anchor knob to inline-start**: Use `left-1` for LTR, `right-1` for RTL
4. **Use signed translation**: `yearly = +travel` for LTR, `yearly = -travel` for RTL

**Implementation Applied**:
```typescript
const travel = 24 // distance between positions
const anchorClass = isRTL ? "right-1" : "left-1" // inline-start anchor
const x = billingCycle === 'yearly' ? (isRTL ? -travel : travel) : 0

// Knob with proper anchoring and signed translation
<m.div
  animate={{ x }}
  className={cn("absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm", anchorClass)}
/>
```

**Result**: Stable knob positioning in both LTR and RTL, both monthly and yearly modes work correctly.

## Files Involved
- `/src/components/pricing/billing-toggle.tsx` - Main component
- `/src/components/pricing/pricing-page-content.tsx` - Parent component
- `/src/messages/ar*/pricing-page.json` - Arabic translations

## Environment
- Next.js 15, TypeScript, Tailwind CSS
- Framer Motion animations
- 9 locales supported (4 Arabic variants)

---
*Generated for expert RTL UI consultation*