# Builder Architecture Analysis - Complete Technical Documentation

## Executive Summary

The current SheenApps builder system is a complex multi-layered architecture involving:
- React components with Zustand state management
- AI-powered question flow system
- Live preview engine with iframe-based rendering
- Per-section editing with undo/redo capabilities
- Layout switching with state preservation
- Complex message passing between iframe and parent window

**Key Issues Identified:**
1. **Timing Dependencies**: Multiple async operations with complex interdependencies
2. **State Synchronization**: Multiple stores managing overlapping concerns
3. **Message Passing Complexity**: Heavy reliance on postMessage communication
4. **DOM Manipulation**: Direct iframe DOM access creating fragile coupling
5. **Button State Management**: Complex button visibility logic across contexts

---

## 1. System Overview & Data Flow

### 1.1 High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Input    │───▶│  Question Flow  │───▶│ Layout Selection│
│   (Initial Idea)│    │   (AI-Powered)  │    │ & Preview Gen   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Undo/Redo Sys │◀───│ Section Editing │◀───│ Live Preview    │
│  (Per-Section)  │    │   (Edit Mode)   │    │   (Iframe)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 1.2 Core Data Flow

1. **Initialization**: `WorkspaceCore` → `QuestionFlowStore` → AI API
2. **Question Processing**: AI generates questions → User answers → Business context builds
3. **Layout Generation**: Business context → AI generates layout options
4. **Preview Rendering**: Layout selection → `LivePreviewEngine` → Iframe content
5. **Section Editing**: Edit button click → Editor modal → Content update → History recording
6. **Layout Navigation**: Layout switch → State preservation → Content restoration

---

## 2. Question Flow System

### 2.1 Question Flow Store (`/src/store/question-flow-store.ts`)

**Purpose**: Manages AI-powered question sequence and business context building

**Key State:**
```typescript
interface QuestionFlowState {
  currentQuestion: Question | null
  businessContext: BusinessContext | null
  questionHistory: Question[]
  answers: Answer[]
  isLoading: boolean
  error: string | null
}
```

**Core Methods:**
- `startQuestionFlow()`: Initiates AI question generation
- `submitAnswer()`: Processes user answers and triggers next question
- `buildBusinessContext()`: Aggregates answers into business context

### 2.2 Question Generation Process

1. **Initial Call**: `startQuestionFlow(initialIdea, projectId)`
2. **AI Processing**: OpenAI generates contextual questions based on idea
3. **Question Display**: Question rendered with options/input fields
4. **Answer Processing**: User selection triggers business context update
5. **Next Question**: AI generates follow-up based on previous answers

**Critical Timing**: Questions load in parallel with site building (2-second delay for new projects)

### 2.3 Business Context Building

```typescript
interface BusinessContext {
  originalIdea: string
  businessType: string
  targetAudience: string
  keyFeatures: string[]
  brandPersonality: string
  colorPreferences: string
  layoutPreferences: string
  // ... additional context fields
}
```

---

## 3. Live Preview Engine System

### 3.1 LivePreviewEngine (`/src/services/preview/live-preview-engine.ts`)

**Purpose**: Manages iframe-based preview with real-time content updates

**Key Components:**
- **Iframe Management**: Creates, loads, and manages preview iframe
- **Content Updates**: Applies changes via postMessage and DOM manipulation
- **Message Handling**: Bidirectional communication with iframe content
- **State Tracking**: Monitors build progress and content changes

### 3.2 Iframe Architecture

**Iframe Creation:**
```typescript
private createIframe(): void {
  this.previewFrame = document.createElement('iframe')
  this.previewFrame.srcdoc = this.generateInitialHTML()
  // Styling and event setup
}
```

**Initial HTML Structure:**
- Complete HTML document with CSS and JavaScript
- Section wrappers with `data-section-type` attributes
- Edit controls with hover functionality
- JavaScript bridge functions for parent communication

### 3.3 Message Passing System

**Parent → Iframe Messages:**
- `PREVIEW_UPDATE`: Apply content changes
- `RESTORE_SECTION`: Restore saved section content
- `REINITIALIZE_SECTION_EDITING`: Reset edit controls
- `UPDATE_UNDO_REDO_BUTTONS`: Update button states

**Iframe → Parent Messages:**
- `EDIT_SECTION_REQUEST`: User clicked edit button
- `UNDO_SECTION_REQUEST`: User clicked undo
- `REDO_SECTION_REQUEST`: User clicked redo
- `LAYOUT_SWITCH`: User selected different layout

### 3.4 Content Update Process

1. **Impact Generation**: User action generates `PreviewImpact`
2. **Impact Processing**: `ImpactProcessor` converts to `PreviewUpdate`
3. **Change Application**: `ChangeApplicator` applies DOM changes
4. **Iframe Update**: Changes sent via postMessage to iframe
5. **DOM Manipulation**: Iframe JavaScript applies changes to content

---

## 4. Section Editing System

### 4.1 Edit Controls in Iframe

Each editable section wrapped with controls:
```html
<div class="editable-section"
     data-section-type="hero"
     data-section-id="hero-123">
  <!-- Section content -->
  <div class="section-controls">
    <button class="edit-button" onclick="window.editSection(...)">Edit</button>
    <button class="undo-button" onclick="window.undoSection(...)">Undo</button>
    <button class="redo-button" onclick="window.redoSection(...)">Redo</button>
  </div>
</div>
```

### 4.2 Edit Flow Process

1. **User Clicks Edit**: `window.editSection()` called in iframe
2. **Message Sent**: `EDIT_SECTION_REQUEST` posted to parent
3. **Modal Opens**: `SectionEditModal` component renders
4. **AI Generation**: User inputs processed by AI to generate new content
5. **Content Update**: New content applied via `LivePreviewEngine`
6. **History Recording**: Change recorded in `PerSectionHistoryStore`
7. **Button Update**: Undo/redo buttons updated with new state

### 4.3 Section Edit Modal Components

**Key Files:**
- `/src/components/builder/section-edit/section-edit-modal.tsx`
- `/src/components/builder/section-edit/section-edit-form.tsx`
- `/src/components/builder/ai-section-generator.tsx`

**Process:**
1. Modal receives section type and current content
2. User enters modification requests
3. AI generates new section content
4. Preview shows before/after comparison
5. User accepts/rejects changes

---

## 5. Undo/Redo System

### 5.1 Per-Section History Store (`/src/stores/per-section-history-store.ts`)

**Purpose**: Tracks edit history per section per layout

**Data Structure:**
```typescript
interface SectionHistory {
  entries: HistoryEntry[]
  currentIndex: number
  maxEntries: number // 10 steps limit
}

interface HistoryEntry {
  content: any
  timestamp: number
  userAction: string
  id: string
}

// Storage key format: `${layoutId}_${sectionType}_${sectionId}`
histories: Record<string, SectionHistory>
```

### 5.2 History Operations

**Recording Edits:**
```typescript
recordEdit(layoutId: string, sectionType: string, sectionId: string, content: any, userAction: string)
```

**Undo/Redo Operations:**
```typescript
undo(layoutId: string, sectionType: string, sectionId: string): HistoryEntry | null
redo(layoutId: string, sectionType: string, sectionId: string): HistoryEntry | null
```

**State Queries:**
```typescript
canUndo(layoutId: string, sectionType: string, sectionId: string): boolean
canRedo(layoutId: string, sectionType: string, sectionId: string): boolean
```

### 5.3 Button Management System

**UndoRedoButtonManager** (`/src/services/undo-redo/UndoRedoButtonManager.ts`):
- Centralizes button state management
- Handles both iframe communication and direct DOM manipulation
- Implements debouncing and caching for performance
- Manages button visibility for different contexts

**Button Update Flow:**
1. Edit recorded → Button state changes
2. `updateSectionButtons()` called
3. Try iframe communication first
4. Fallback to direct DOM manipulation
5. Button visibility and state updated

---

## 6. Layout Navigation & Restoration

### 6.1 Layout Switching Process

**Triggered by:**
- User clicks layout option in question flow
- User navigates back to previous layout

**Process in `WorkspaceCore`:**
1. `switchToLayout(layoutId)` called
2. Debouncing prevents rapid switches
3. `onLayoutChange(layoutId)` updates current layout
4. Check if layout has edit history
5. If history exists, trigger restoration

### 6.2 State Restoration System

**Layout Final Components** (`getLayoutFinalComponents`):
```typescript
// Returns final state of all edited sections for a layout
{
  "hero": { id: "hero-123", html: "...", css: "...", props: {...} },
  "features": { id: "features-456", html: "...", css: "...", props: {...} },
  // ... other sections
}
```

**Restoration Process:**
1. **Trigger**: Layout change to edited layout detected
2. **Delay**: 800ms wait for iframe DOM/CSS loading
3. **Direct DOM Access**: Bypass all systems, directly manipulate iframe DOM
4. **Section Replacement**: Replace each section with saved HTML
5. **CSS Application**: Inject saved CSS styles
6. **Control Reinitialization**: Trigger `REINITIALIZE_SECTION_EDITING`
7. **Button Updates**: Update undo/redo button states

### 6.3 Edit Controls Wrapper Generation

Restored sections wrapped with edit controls:
```typescript
const wrapWithEditControlsSimple = (html: string, componentType: string, componentId: string, sectionName: string): string => {
  return `
    <div class="editable-section"
         data-section-type="${componentType}"
         data-section-id="${componentId}"
         data-section-name="${sectionName}">
      ${html}
      <div class="section-controls">
        <!-- Edit, Undo, Redo buttons -->
      </div>
    </div>
  `
}
```

---

## 7. Critical Issues & Pain Points

### 7.1 ACTUAL BUGS & FAILURES We've Been Fighting

#### **Section Edit Restoration Failures**
**The Core Problem**: Section edits don't preserve when navigating between layouts

**What We've Observed:**
- User edits hero section on Layout A
- User switches to Layout B, then back to Layout A
- **RESULT**: Original layout shows, edited content lost
- **User Impact**: "I lost all my changes!"

**Failed Attempts:**
1. **Direct DOM Manipulation Approach**: Tried bypassing all systems, directly replacing iframe DOM
2. **PostMessage Coordination**: Attempted complex message passing to restore state
3. **CSS Variable Persistence**: Tried preserving styles across layout switches
4. **Multiple Timer Delays**: Added 100ms, 200ms, 300ms, 800ms delays - still unreliable

**Current Status**: ❌ **STILL BROKEN** - Restoration works sometimes, fails randomly

#### **Button Disappearing Issue**
**The Core Problem**: Edit/Undo/Redo buttons appear briefly then vanish

**What We've Observed:**
- User edits a section successfully
- Buttons appear for 2-3 seconds
- Buttons suddenly disappear
- **User Impact**: "I can't undo my changes!"

**Root Cause Discovery:**
- `updateUndoRedoButtons()` function hiding buttons when no history exists
- Restored sections treated as "no history" sections
- Button visibility logic conflicts between different code paths

**Failed Attempts:**
1. **Button State Caching**: Tried caching button states - buttons still disappeared
2. **Direct DOM Button Creation**: Manually created buttons - styling issues
3. **Message Timing Fixes**: Adjusted message delays - inconsistent results
4. **CSS-only Solutions**: Tried CSS visibility rules - JavaScript still overrode

**Current Status**: ⚠️ **PARTIALLY FIXED** - Latest fix may resolve but needs testing

#### **Timing Race Conditions**
**The Core Problem**: System components load in unpredictable order

**What We've Observed:**
- Preview engine loads before iframe DOM ready
- Button updates sent before iframe JavaScript loaded
- CSS variables applied before stylesheets loaded
- History recorded before section properly initialized

**Specific Failures:**
```javascript
// This fails randomly:
setTimeout(() => restoreSection(), 800) // Sometimes iframe not ready
setTimeout(() => updateButtons(), 200)  // Sometimes buttons don't exist yet
setTimeout(() => applyCSS(), 100)       // Sometimes styles don't apply
```

**Current Status**: ❌ **ONGOING ISSUE** - Band-aided with multiple timeouts

#### **State Synchronization Chaos**
**The Core Problem**: Multiple systems tracking the same data differently

**What We've Observed:**
- `PerSectionHistoryStore` says section has history
- `LivePreviewEngine` shows different content
- Iframe DOM contains third version
- Button states don't match any of the above

**Specific Example:**
```
History Store: "Hero section has 3 edits"
Preview Engine: "Hero section is original"
Iframe DOM: "Hero section shows edit #2"
Buttons: "No undo/redo available"
```

**Current Status**: ❌ **FUNDAMENTAL ARCHITECTURE ISSUE**

#### **CSS Styling Failures**
**The Core Problem**: Restored sections lose their styling

**What We've Observed:**
- Section HTML restores correctly
- CSS variables become undefined
- Gradients/colors break
- Layout shifts occur

**Failed Debugging:**
```javascript
// This should work but doesn't:
const gradientAccent = computedStyle.getPropertyValue('--gradient-accent')
console.log(gradientAccent) // Returns empty string randomly
```

**Current Status**: ❌ **INTERMITTENT FAILURE**

#### **Message Passing Failures**
**The Core Problem**: Parent-iframe communication unreliable

**What We've Observed:**
- Messages sent but never received
- Messages received multiple times
- Wrong message order
- Silent message failures

**Specific Failures:**
```javascript
// This should trigger button updates but often doesn't:
iframe.contentWindow.postMessage({
  type: 'REINITIALIZE_SECTION_EDITING'
}, '*')
// Sometimes received, sometimes lost, no error thrown
```

**Current Status**: ❌ **NO RELIABLE ERROR HANDLING**

### 7.2 Performance Degradation Issues

#### **Development Server File Download Bug**
**The Core Problem**: Dev server corrupts webpack chunks

**What Happens:**
- User refreshes page
- Browser downloads files named "en", "ar-eg" instead of rendering
- Console shows: `Cannot find module './vendor-chunks/next.js'`
- **User Impact**: "The site is broken!"

**Workaround**: `npm run dev:safe` (clears cache, uses polling)
**Status**: ❌ **ONGOING DEVELOPMENT DISRUPTION**

#### **Bundle Size Explosion**
**The Core Problem**: Builder becomes slow due to large JavaScript bundles

**What We Observed:**
- Homepage: 314KB (was 395KB)
- Builder: 300KB (was 340KB)
- Preview engine embedded HTML: 50KB+ strings in JavaScript
- Multiple iframe instances loading

**Impact**: Slow initial page loads, poor mobile performance
**Status**: ⚠️ **PARTIALLY IMPROVED** but still heavy

#### **Memory Leaks**
**The Core Problem**: History and cached data accumulates indefinitely

**What Happens:**
- Edit history never cleaned up
- Cached components multiply
- Event listeners not removed
- Multiple preview engine instances

**Status**: ❌ **NO CLEANUP STRATEGY**

### 7.3 User Experience Failures

#### **"Everything Disappears" Bug**
**What Users Experience:**
1. User spends 15 minutes editing sections
2. User switches layouts to compare
3. User switches back
4. **ALL EDITS GONE**
5. User has to start over

**Frequency**: ~30% of layout switches
**User Feedback**: "This is unusable, I lost hours of work"

#### **"Buttons Don't Work" Bug**
**What Users Experience:**
1. User makes an edit successfully
2. User wants to undo
3. Undo button is invisible/disabled
4. **No way to revert changes**

**Frequency**: ~50% of edit operations
**User Feedback**: "I made a mistake but can't fix it"

#### **"Loading Never Ends" Bug**
**What Users Experience:**
1. User clicks edit button
2. Loading spinner appears
3. **Spinner never disappears**
4. Modal never opens

**Root Cause**: Preview engine initialization timing failures
**Status**: ❌ **RANDOM OCCURRENCE**

#### **"Styles Look Broken" Bug**
**What Users Experience:**
1. Preview looks perfect initially
2. After editing, colors are wrong
3. Layout is shifted
4. **Professional design becomes amateur**

**Root Cause**: CSS variable restoration failures
**Status**: ❌ **UNPREDICTABLE**

### 7.4 Development & Debugging Nightmares

#### **Impossible to Debug**
**Problems:**
- Errors happen across iframe boundary (can't debug)
- Silent failures (no error messages)
- Race conditions (can't reproduce consistently)
- Multiple async systems (can't trace execution)

**Example Debug Session:**
```
1. Set breakpoint in parent window
2. Error occurs in iframe
3. No stack trace crosses boundary
4. Console shows nothing
5. Give up, add more setTimeout delays
```

#### **Change Impact Unpredictability**
**Problems:**
- Fix one issue, break two others
- Changes require updates in 5+ files
- No way to test all edge cases
- Rollbacks are complex

**Example:**
```
"Fixed button disappearing" →
"Now CSS doesn't load" →
"Fixed CSS loading" →
"Now undo doesn't work" →
"Fixed undo" →
"Now buttons disappear again"
```

#### **Testing Impossibility**
**Problems:**
- Can't mock iframe interactions
- Can't simulate timing issues
- Can't test real user workflows
- Integration tests don't cover edge cases

**Current Test Coverage**: ~20% of actual user paths

### 7.5 Expert Consultation Red Flags

#### **Architecture Smells**
1. **God Object**: `LivePreviewEngine` does everything
2. **Spaghetti State**: 4 different stores for overlapping data
3. **Magic Numbers**: setTimeout(800), setTimeout(200), etc.
4. **String Dependencies**: Hard-coded CSS selectors everywhere
5. **Silent Failures**: No error boundaries or retry logic

#### **Code Quality Issues**
1. **200+ line functions** that do multiple things
2. **Deeply nested conditionals** for timing logic
3. **Copy-paste patterns** instead of abstractions
4. **No error handling** for async operations
5. **Hard-coded business logic** mixed with infrastructure

#### **Technical Debt Indicators**
1. **Band-aid fixes**: Every fix adds more complexity
2. **Fear of changes**: Simple changes break multiple things
3. **Debug driven development**: Add logs, hope for the best
4. **Timeout driven development**: Add delays, cross fingers
5. **Works on my machine**: Different behavior across environments

### 7.6 What We've Learned (The Hard Way)

#### **Iframe Architecture Is Problematic**
- Message passing is unreliable
- DOM access across boundaries is fragile
- Debugging is nearly impossible
- State synchronization is complex
- Performance overhead is significant

#### **Multiple State Systems Don't Work**
- Different stores get out of sync
- No single source of truth
- Unclear data ownership
- Difficult to reason about
- Testing becomes impossible

#### **Timing-Based Solutions Are Unreliable**
- setTimeout delays don't guarantee order
- Different browsers have different timing
- Network conditions affect timing
- User interactions mess up timing
- Mobile performance varies timing

#### **Direct DOM Manipulation Is Fragile**
- CSS selectors can change
- Element IDs are not guaranteed
- Framework re-renders break manual changes
- Event binding gets complex
- Memory leaks from manual listeners

### 7.7 The Real Question for Expert

**The fundamental question isn't "how to fix these bugs" but:**

**"Should we be doing preview editing this way at all?"**

Maybe the industry has better patterns for:
- Real-time preview systems
- Cross-frame communication
- State management for editing
- Undo/redo in preview contexts
- Layout switching with preservation

**Our current approach might be fundamentally flawed rather than just buggy.**

### 7.2 State Synchronization Issues

**Multiple Truth Sources:**
- `QuestionFlowStore`: Business context and answers
- `PerSectionHistoryStore`: Edit history per layout
- `LivePreviewEngine`: Current preview state
- Iframe DOM: Actual rendered content

**Synchronization Challenges:**
- Button states between parent and iframe
- Content state vs stored history
- Layout switching state preservation

### 7.3 Message Passing Complexity

**Bidirectional Communication:**
- 8+ message types between parent and iframe
- Error handling for failed messages
- Fallback mechanisms for communication failures

**Race Conditions:**
- Messages sent before iframe ready
- Multiple messages in flight
- State updates out of order

### 7.4 Direct DOM Manipulation

**Fragile Coupling:**
- Direct access to iframe DOM
- CSS selector dependencies
- Element ID pattern matching
- Manual event binding

**Maintenance Issues:**
- Changes require updates in multiple places
- Debugging across iframe boundary
- Error handling complexity

### 7.5 Button State Management

**Complex Logic:**
- Different visibility rules for different contexts
- State persistence across layout switches
- Iframe vs parent button synchronization
- Restored section special handling

---

## 8. Performance Considerations

### 8.1 Current Performance Issues

**Bundle Size:**
- Large iframe HTML strings embedded in JavaScript
- Multiple preview engine instances
- Complex state management overhead

**Runtime Performance:**
- Frequent DOM queries across iframe boundary
- Message passing overhead
- Multiple timeout/interval handlers
- Deep object copying for history

**Memory Usage:**
- History entries stored indefinitely
- Cached component data
- Multiple event listeners
- Large DOM structures in iframe

### 8.2 Optimization Opportunities

**State Management:**
- Consolidate overlapping stores
- Implement proper cache invalidation
- Reduce deep copying

**Communication:**
- Batch message operations
- Implement message queuing
- Reduce postMessage frequency

**DOM Operations:**
- Minimize cross-iframe DOM access
- Implement virtual DOM for preview
- Cache DOM queries

---

## 9. Alternative Architecture Approaches

### 9.1 State-Driven Architecture

**Concept**: Single source of truth with reactive updates
- Central state store for entire builder
- Preview as pure view of state
- No direct DOM manipulation
- Event-driven updates

**Benefits:**
- Predictable state flow
- Easier debugging
- Better testability
- Simplified synchronization

### 9.2 Server-Side Rendering

**Concept**: Generate preview HTML on server
- Server-side template rendering
- Client receives complete HTML
- Minimal client-side state
- Traditional form submissions

**Benefits:**
- Simpler client architecture
- Better SEO/accessibility
- Reduced JavaScript complexity
- Server-side caching

### 9.3 Virtual DOM Approach

**Concept**: Virtual representation of preview content
- In-memory DOM representation
- Diff-based updates
- Framework-agnostic rendering
- Serializable state

**Benefits:**
- Predictable updates
- Better performance
- Easier testing
- State time-travel

### 9.4 Web Components

**Concept**: Encapsulated preview components
- Custom elements for sections
- Shadow DOM isolation
- Standard web APIs
- Framework independence

**Benefits:**
- Better encapsulation
- Reduced complexity
- Standard compliance
- Reusable components

---

## 10. Migration Considerations

### 10.1 Data Migration

**Current State Format:**
```typescript
// Per-section history entries
histories: Record<string, SectionHistory>

// Business context
businessContext: BusinessContext

// Cached components
cachedComponents: Map<string, Map<string, any>>
```

**Migration Requirements:**
- Preserve existing user projects
- Convert history format
- Maintain backward compatibility

### 10.2 API Compatibility

**Current AI Integration:**
- OpenAI GPT-4 for question generation
- Content generation APIs
- Image generation endpoints

**Migration Needs:**
- Maintain AI integration patterns
- Preserve generation quality
- Handle API rate limits

### 10.3 User Experience

**Current UX Patterns:**
- Real-time preview updates
- Undo/redo functionality
- Layout switching
- Section editing

**Migration Goals:**
- Maintain UX quality
- Improve performance
- Reduce bugs/edge cases
- Enhance reliability

---

## 11. Technical Debt Analysis

### 11.1 Code Quality Issues

**Complex Functions:**
- `restoreEditsForCurrentLayout()`: 200+ lines
- `updateUndoRedoButtons()`: Complex conditional logic
- `applyPreviewImpact()`: Multiple responsibility areas

**Coupling Issues:**
- Tight coupling between iframe and parent
- Direct DOM dependencies
- Hard-coded selector strings
- Message type string literals

**Error Handling:**
- Inconsistent error boundaries
- Silent failures in async operations
- Limited retry mechanisms
- Poor error user feedback

### 11.2 Testing Challenges

**Current Test Coverage:**
- Limited integration tests
- Mock-heavy unit tests
- No end-to-end preview testing
- Iframe testing complexity

**Testing Gaps:**
- Layout switching scenarios
- Message passing edge cases
- Performance under load
- Cross-browser compatibility

### 11.3 Documentation Debt

**Missing Documentation:**
- Message passing protocols
- State synchronization rules
- Performance optimization guides
- Debugging procedures

**Outdated Documentation:**
- Architecture diagrams
- API documentation
- Development setup guides

---

## 12. Recommendations for Expert Consultation

### 12.1 Key Questions for Expert

1. **Architecture Pattern**: What's the best pattern for preview systems with real-time editing?
2. **State Management**: How to handle complex state synchronization across iframe boundaries?
3. **Performance**: What are industry best practices for preview performance?
4. **Testing Strategy**: How to effectively test iframe-based preview systems?
5. **Scalability**: How to design for multiple concurrent users and projects?

### 12.2 Specific Technical Decisions

1. **Iframe vs Alternatives**: Keep iframe or move to different isolation method?
2. **State Architecture**: Single store vs multiple specialized stores?
3. **Communication**: PostMessage vs other parent-child communication?
4. **Rendering**: Client-side vs server-side preview generation?
5. **History Management**: Current approach vs event sourcing vs other patterns?

### 12.3 Success Criteria for New Architecture

**Reliability:**
- 99%+ uptime for preview updates
- No silent failures
- Consistent state synchronization

**Performance:**
- <500ms for layout switches
- <200ms for section edits
- <100ms for undo/redo operations

**Maintainability:**
- Clear separation of concerns
- Comprehensive test coverage
- Minimal technical debt

**Developer Experience:**
- Easy to debug
- Clear error messages
- Simple mental model

---

## 13. Current File Structure Reference

### 13.1 Core Components
```
src/
├── components/builder/
│   ├── workspace/
│   │   ├── workspace-core.tsx              # Main orchestration
│   │   ├── workspace-canvas.tsx            # Preview container
│   │   └── adaptive-workspace-layout.tsx   # Responsive layouts
│   ├── section-edit/
│   │   ├── section-edit-modal.tsx          # Edit interface
│   │   └── section-edit-form.tsx           # Edit form
│   └── question-flow/
│       └── question-interface.tsx          # Question UI
```

### 13.2 State Management
```
src/
├── store/
│   └── question-flow-store.ts              # Questions & business context
├── stores/
│   └── per-section-history-store.ts        # Edit history
└── services/
    ├── preview/
    │   ├── live-preview-engine.ts           # Main preview engine
    │   ├── impact-processor.ts              # Change processing
    │   └── component-renderer.ts            # HTML generation
    └── undo-redo/
        └── UndoRedoButtonManager.ts         # Button management
```

### 13.3 Configuration & Utils
```
src/
├── config/
│   ├── ui-constants.ts                     # UI constants
│   └── business-mappings.ts                # Business logic
├── hooks/
│   └── useUndoRedoManager.ts               # Undo/redo hook
└── types/
    └── question-flow.ts                    # Type definitions
```

---

This documentation provides a complete technical overview of the current builder architecture. The system has grown complex with multiple interdependent layers, timing dependencies, and state synchronization challenges. An expert review could help determine whether to refactor the current system or adopt a fundamentally different architectural approach.

---

## Expert Implementation Plan - Enhanced Recommendations

### Week 1 Must-Dos: Stop the Bleeding

1. **Lock Store Initialization** (Critical - Data Loss Prevention)
   ```typescript
   // Add to builder-store.ts
   const initLock = new Map<string, Promise<void>>()
   
   export const initializeProject = async (projectId: string) => {
     if (!initLock.has(projectId)) {
       initLock.set(projectId, performInitialization(projectId))
     }
     return initLock.get(projectId)!
   }
   ```

2. **Global Error Boundary + Sentry** (Production Stability)
   ```typescript
   // app/[locale]/layout.tsx
   export default function RootLayout({ children }) {
     return (
       <html>
         <body>
           <ErrorBoundary
             fallback={<BuilderRecoveryUI />}
             onError={captureException}
           >
             {children}
           </ErrorBoundary>
         </body>
       </html>
     )
   }
   ```

3. **Cap Section History** (Memory Management)
   ```typescript
   // In store reducer
   const MAX_SNAPSHOTS = 50
   
   if (sectionHistory[sectionId].undoStack.length > MAX_SNAPSHOTS) {
     // Clean up in requestIdleCallback
     requestIdleCallback(() => {
       sectionHistory[sectionId].undoStack = 
         sectionHistory[sectionId].undoStack.slice(-MAX_SNAPSHOTS)
     })
   }
   ```

4. **Enable noImplicitAny** (Type Safety)
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "noImplicitAny": true,
       "strict": true
     }
   }
   ```
   - Fix hottest files first: builder-store.ts, workspace-core.tsx, preview-renderer.tsx

### Weeks 3-6: Architecture Refactor

1. **Flatten Builder to ≤3 Layers**
   ```
   Current (5+ layers):
   EnhancedWorkspacePage → WorkspaceCore → WorkspaceCanvas → PreviewRenderer → SectionWrapper
   
   Target (3 layers):
   WorkspacePage → PreviewCanvas → SectionRenderers
   ```

2. **Merge All Stores into One**
   ```typescript
   // unified-store.ts
   interface UnifiedStore {
     // Project & layouts
     project: ProjectState
     
     // Questions & flow
     questionFlow: QuestionFlowState
     
     // History (single stack)
     history: {
       stack: Array<{
         snapshot: Snapshot
         sectionId?: string
         layoutId: string
         timestamp: number
       }>
       index: number
     }
     
     // UI state
     ui: UIState
   }
   ```

3. **Collapse Dual Histories**
   ```typescript
   // Single history tagged by section
   interface HistoryEntry {
     id: string
     timestamp: number
     snapshot: StateSnapshot
     metadata: {
       sectionId?: string
       layoutId: string
       userAction: string
       type: 'global' | 'section'
     }
   }
   ```

### Weeks 7-12: Scale & Future

1. **CRDT Prototype for Collaboration**
   ```typescript
   // Research Yjs or Automerge
   import * as Y from 'yjs'
   
   const ydoc = new Y.Doc()
   const ymap = ydoc.getMap('sections')
   
   // Sync across users
   const provider = new WebrtcProvider('room-id', ydoc)
   ```

2. **Edge Functions for AI**
   ```typescript
   // app/api/ai/generate/route.ts
   export const runtime = 'edge' // Vercel Edge Runtime
   
   export async function POST(request: Request) {
     // Stream responses for better UX
     return new Response(stream, {
       headers: { 'Content-Type': 'text/event-stream' }
     })
   }
   ```

3. **Micro-frontends Decision**
   - Evaluate after preview system parity
   - Consider Module Federation or single-spa
   - Measure bundle impact first

### Extra Safeguards

1. **Memory Leak Prevention**
   ```typescript
   // Auto-cleanup on unmount
   useEffect(() => {
     const cleanup = store.subscribe(state => {
       // Monitor memory growth
       if (state.history.stack.length > 100) {
         console.warn('History growing large')
       }
     })
     
     return () => {
       cleanup()
       store.getState().clearSectionHistory(sectionId)
     }
   }, [sectionId])
   ```

2. **Performance Monitoring**
   ```typescript
   // Add to critical operations
   const measure = (name: string, fn: () => void) => {
     performance.mark(`${name}-start`)
     fn()
     performance.mark(`${name}-end`)
     performance.measure(name, `${name}-start`, `${name}-end`)
     
     const entry = performance.getEntriesByName(name)[0]
     if (entry.duration > 100) {
       console.warn(`Slow operation: ${name} took ${entry.duration}ms`)
     }
   }
   ```

3. **State Validation**
   ```typescript
   // Add state validators
   const validateState = (state: BuilderState): boolean => {
     if (!state.projectId) return false
     if (!state.layouts[state.ui.currentLayoutId]) return false
     if (state.history.index >= state.history.stack.length) return false
     return true
   }
   ```

### Questions to Settle Upfront

1. **Preview Architecture**
   - Keep React preview as primary? (currently 2-5x faster)
   - Remove iframe fallback? (maintenance burden)
   - How to ensure production parity?

2. **State Management**
   - Zustand vs Redux Toolkit? (current: Zustand)
   - Event sourcing for history? (better debugging)
   - Optimistic updates pattern?

3. **Collaboration Features**
   - Real-time priority? (affects architecture)
   - Conflict resolution strategy?
   - Offline support requirements?

4. **Performance Targets**
   - Max bundle size? (current: 257KB builder)
   - Time to Interactive goal? (<1.5s?)
   - Memory growth limit? (<1MB per 100 ops?)

### Implementation Priority Matrix

| Task | Impact | Effort | Priority | Timeline |
|------|--------|--------|----------|----------|
| Fix store race condition | High | Low | P0 | Week 1 |
| Add error boundaries | High | Low | P0 | Week 1 |
| Cap history memory | High | Medium | P0 | Week 1 |
| Enable strict types | Medium | High | P1 | Week 1-2 |
| Flatten architecture | High | High | P1 | Weeks 3-6 |
| Merge stores | High | High | P1 | Weeks 3-6 |
| CRDT collaboration | Medium | High | P2 | Weeks 7-12 |
| Edge functions | Medium | Medium | P2 | Weeks 7-12 |

### Success Metrics Update

- **Stability**: <0.1% crash rate (from current ~2%)
- **Performance**: <100ms for all user interactions
- **Memory**: <500KB growth per session
- **Developer Velocity**: 50% faster feature development
- **Type Coverage**: 100% (from current ~60%)

This enhanced plan incorporates battle-tested patterns and provides clear, actionable steps with code examples for immediate implementation.
