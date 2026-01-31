# Visual Editing MVP - Final Implementation Plan
*Incorporating expert chat integration insights with deep system integration*

## Executive Summary

This final implementation plan incorporates expert insights about chat UI flow and UX transitions while maintaining deep integration with our existing builder systems. We focus on the essential visual editing capabilities that enhance our proven chat interface without over-engineering.

## UX Flow & Chat Integration (Expert Insights Adopted)

### 1. User Experience Flow
```
[CHAT MODE] <—toggle—> [VISUAL EDIT MODE]
     ^                         |
     | (exit with summary)     | (apply/cancel)
     +-------------------------+
```

**Primary User Journey**:
1. User clicks "Visual Edit" in chat header or presses Alt+S
2. Preview switches to same-origin mode (`/preview/:projectId?visual=1`)
3. Blue banner shows "Visual Edit ON - Click elements to edit"
4. User selects element → shows inline controls
5. Apply change → optimistic preview + chat confirmation
6. Exit → returns to chat with visual edit summary card

### 2. Enhanced BuilderChatInterface Integration

```typescript
// Enhanced existing BuilderChatInterface component
interface VisualEditingProps {
  visualEditingEnabled?: boolean
  visualEditingState?: {
    selectedElement?: SelectedElement
    mode: 'select' | 'editing' | 'prompting'
  }
  onToggleVisualEditing?: (enabled: boolean) => void
}

export function BuilderChatInterface({
  buildId,
  projectId,
  businessIdea,
  onPromptSubmit,
  translations,
  // New visual editing props
  visualEditingEnabled = false,
  visualEditingState,
  onToggleVisualEditing,
  ...existingProps
}: BuilderChatInterfaceProps & VisualEditingProps) {
  // Extend existing mode state
  const [mode, setMode] = useState<'build' | 'plan' | 'visual-edit'>('build')
  
  // Enhanced mode switching with visual editing integration
  const handleModeChange = (newMode: typeof mode) => {
    if (newMode === 'visual-edit') {
      onToggleVisualEditing?.(true)
      setMode('visual-edit')
    } else {
      if (mode === 'visual-edit') {
        onToggleVisualEditing?.(false)
        addVisualEditSummary() // Add summary card to chat
      }
      setMode(newMode)
    }
  }

  return (
    <div className={cn(
      "h-full flex flex-col",
      isCollapsed ? "w-12" : "w-full"
    )}>
      {/* Enhanced chat header with visual editing toggle */}
      <ChatHeader 
        mode={mode}
        onModeChange={handleModeChange}
        selectedElement={visualEditingState?.selectedElement}
        translations={translations.chat}
      />
      
      {/* Visual editing banner when active */}
      {visualEditingEnabled && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm">
          <div className="flex items-center gap-2 text-blue-700">
            ✏️ Visual Edit ON - Click elements to edit
            <kbd className="px-2 py-1 bg-blue-100 rounded text-xs">Esc to exit</kbd>
          </div>
          {visualEditingState?.selectedElement && (
            <div className="mt-1 text-blue-600">
              Selected: {visualEditingState.selectedElement.elementType} • 
              {visualEditingState.selectedElement.isLiteral ? 'Direct edit available' : 'Use AI prompt'}
            </div>
          )}
        </div>
      )}
      
      {/* Enhanced messages with visual edit context */}
      <ChatMessages 
        messages={messages}
        renderMessage={renderMessageWithVisualContext}
      />
      
      {/* Enhanced input with visual editing context */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        mode={mode}
        placeholder={getPlaceholder(mode, visualEditingState)}
        visualContext={visualEditingState?.selectedElement}
      />
    </div>
  )
}
```

### 3. Enhanced Message Types

```typescript
// Extend existing message types with visual editing context
interface VisualEditMessage extends Message {
  type: 'visual-edit-summary'
  visualContext: {
    sheenId: string
    elementType: string
    action: 'text-change' | 'class-toggle' | 'ai-edit'
    billing: 'free' | 'credits'
    beforeValue?: string
    afterValue?: string
    diffSummary?: string
  }
}

// Enhanced message renderer
const renderMessageWithVisualContext = (message: Message) => {
  if (message.type === 'visual-edit-summary') {
    return (
      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
            ✏️ Visual Edit: {message.visualContext.elementType}
          </div>
          <div className={cn(
            "text-xs px-2 py-1 rounded",
            message.visualContext.billing === 'free' 
              ? "bg-green-100 text-green-700" 
              : "bg-orange-100 text-orange-700"
          )}>
            {message.visualContext.billing === 'free' ? 'Free' : 'Credits Used'}
          </div>
        </div>
        
        <div className="text-gray-800 text-sm mb-2">
          {formatVisualEditAction(message.visualContext)}
        </div>
        
        {message.visualContext.diffSummary && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-800">
              View code changes
            </summary>
            <pre className="mt-2 bg-white p-2 rounded text-xs overflow-auto max-h-32 border">
              {message.visualContext.diffSummary}
            </pre>
          </details>
        )}
        
        <div className="flex gap-2 mt-3">
          <button 
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() => revertVisualEdit(message.visualContext.sheenId)}
          >
            Revert
          </button>
          <button 
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() => reopenVisualEdit(message.visualContext.sheenId)}
          >
            Edit Again
          </button>
        </div>
      </div>
    )
  }
  
  // Use existing message rendering for other types
  return <StandardChatMessage message={message} />
}
```

## Build Events Integration (Focused Approach)

### 1. Minimal Event Set (Expert's 5 Events)
```typescript
// Add to existing build events system
interface VisualEditEvent extends BuildEvent {
  type: 'VISUAL_EDIT'
  subType: 'TOGGLED' | 'SELECTED' | 'DIRECT_APPLY' | 'AI_REQUESTED' | 'ERROR'
  data: {
    sheenId?: string
    elementType?: string
    action?: string
    billing?: 'free' | 'credits'
    filesChanged?: string[]
    error?: string
  }
}

// Integration with existing clean build events
const emitVisualEditEvent = (event: Omit<VisualEditEvent, 'timestamp'>) => {
  const buildEvent: BuildEvent = {
    ...event,
    timestamp: Date.now(),
    buildId: currentBuildId
  }
  
  // Use existing build events emission
  emitBuildEvent(buildId, buildEvent)
  
  // Update chat with visual context
  if (event.subType === 'DIRECT_APPLY') {
    addMessage({
      type: 'visual-edit-summary',
      content: `Applied ${event.data.action}`,
      visualContext: {
        sheenId: event.data.sheenId!,
        elementType: event.data.elementType!,
        action: event.data.action as any,
        billing: event.data.billing!,
        diffSummary: generateDiffSummary(event.data.filesChanged)
      },
      timestamp: Date.now()
    })
  }
}
```

### 2. React Query Integration (Focused Cache Management)
```typescript
// Enhanced project data management with visual editing
const useVisualEditingMutations = (projectId: string) => {
  const queryClient = useQueryClient()
  
  const applyDirectEdit = useMutation({
    mutationFn: async (edit: DirectEdit) => {
      // Optimistic local update (no server data change)
      updateLocalPreviewState(edit)
      
      // Apply codemod
      const result = await applyCodemod(projectId, edit)
      
      // Trigger HMR via existing system
      await triggerPreviewRebuild(projectId, result.filesChanged)
      
      return result
    },
    onSuccess: (result, edit) => {
      // Narrow invalidation (expert's approach)
      queryClient.invalidateQueries(['project', 'fileTree', projectId])
      queryClient.invalidateQueries(['project', 'previewStatus', projectId])
      
      // Emit visual edit event
      emitVisualEditEvent({
        type: 'VISUAL_EDIT',
        subType: 'DIRECT_APPLY',
        data: {
          sheenId: edit.sheenId,
          elementType: edit.elementType,
          action: edit.action,
          billing: 'free',
          filesChanged: result.filesChanged
        }
      })
    },
    onError: (error, edit) => {
      // Rollback optimistic update
      rollbackLocalPreviewState(edit)
      
      // Show error in chat
      addMessage({
        type: 'assistant',
        content: `❌ Failed to apply ${edit.action}: ${error.message}`,
        timestamp: Date.now()
      })
    }
  })
  
  return { applyDirectEdit }
}
```

## Mobile Integration (Our Responsive Patterns)

### 1. Mobile-First Visual Editing
```typescript
// Integration with existing responsive system
export function MobileVisualEditingInterface({ 
  selectedElement, 
  onApplyEdit 
}: Props) {
  const { showMobileUI } = useResponsive() // Use our existing hook
  
  if (!showMobileUI) {
    return <DesktopVisualEditingToolbar />
  }
  
  return (
    <BottomSheet 
      isOpen={!!selectedElement}
      onClose={() => setSelectedElement(null)}
    >
      <div className="p-4 space-y-4 safe-area-pb">
        {/* Grab handle */}
        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto" />
        
        {/* Element info */}
        <div className="text-center">
          <div className="text-lg font-medium">
            Edit {selectedElement?.elementType}
          </div>
          <div className="text-sm text-gray-600">
            {selectedElement?.isLiteral ? 'Direct edit (free)' : 'AI prompt (credits)'}
          </div>
        </div>
        
        {/* Editing controls - 44px minimum touch targets */}
        {selectedElement?.isLiteral ? (
          <DirectEditControls 
            element={selectedElement}
            onTextChange={handleTextChange}
            onClassToggle={handleClassToggle}
            className="space-y-3"
            touchOptimized={true}
          />
        ) : (
          <AIPromptInput
            element={selectedElement}
            onSubmit={handleAIPrompt}
            placeholder="Describe how to modify this element..."
            className="min-h-[48px]"
          />
        )}
        
        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button 
            className="flex-1 h-12 bg-gray-200 text-gray-800 rounded-lg"
            onClick={() => setSelectedElement(null)}
          >
            Cancel
          </button>
          <button 
            className="flex-1 h-12 bg-blue-500 text-white rounded-lg"
            onClick={handleApply}
          >
            Apply
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
```

### 2. Touch Interaction (Simplified)
```typescript
// Mobile selection handling
const useMobileVisualSelection = () => {
  const [touchStart, setTouchStart] = useState<number>(0)
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)
  
  const handleTouchStart = (element: HTMLElement) => {
    setTouchStart(Date.now())
  }
  
  const handleTouchEnd = (element: HTMLElement) => {
    const touchDuration = Date.now() - touchStart
    
    // Simple long-press detection (550ms as expert suggested)
    if (touchDuration >= 550) {
      // Haptic feedback if available
      if ('vibrate' in navigator) {
        navigator.vibrate(50)
      }
      
      selectElement(element)
    }
  }
  
  return { handleTouchStart, handleTouchEnd, selectedElement }
}
```

## Simplified Code Modification (MVP Approach)

### 1. Direct Text Edit (String Manipulation Instead of ts-morph)
```typescript
// Simple string-based text replacement for MVP
const replaceJSXTextLiteral = async (
  filePath: string, 
  sheenId: string, 
  newText: string
): Promise<{ filesChanged: string[] }> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    
    // Find the element with matching data-sheen-id
    const elementRegex = new RegExp(
      `(<[^>]*data-sheen-id="${sheenId}"[^>]*>)([^<]*)(</[^>]*>)`,
      'g'
    )
    
    const newContent = content.replace(elementRegex, (match, opening, oldText, closing) => {
      // Only replace if it's a simple text literal (no {expressions})
      if (oldText.includes('{')) {
        throw new Error('Dynamic text content - use AI prompt instead')
      }
      return `${opening}${newText}${closing}`
    })
    
    if (newContent === content) {
      throw new Error('Element not found or not editable')
    }
    
    await fs.writeFile(filePath, newContent, 'utf-8')
    return { filesChanged: [filePath] }
    
  } catch (error) {
    throw new Error(`Failed to update text: ${error.message}`)
  }
}
```

### 2. Simple Class Toggle (Regex-based)
```typescript
// Simple Tailwind class toggling for MVP
const toggleTailwindClasses = async (
  filePath: string,
  sheenId: string,
  add: string[] = [],
  remove: string[] = []
): Promise<{ filesChanged: string[] }> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    
    // Find className attribute for element with matching data-sheen-id
    const classRegex = new RegExp(
      `(<[^>]*data-sheen-id="${sheenId}"[^>]*className=")([^"]*)(")`,
      'g'
    )
    
    const newContent = content.replace(classRegex, (match, before, classes, after) => {
      // Check if className contains template expressions
      if (classes.includes('${') || classes.includes('{')) {
        throw new Error('Dynamic className - use AI prompt instead')
      }
      
      const classSet = new Set(classes.split(/\s+/).filter(Boolean))
      
      // Remove classes
      remove.forEach(cls => classSet.delete(cls))
      
      // Add classes
      add.forEach(cls => classSet.add(cls))
      
      const newClasses = Array.from(classSet).join(' ')
      return `${before}${newClasses}${after}`
    })
    
    if (newContent === content) {
      throw new Error('Element not found or className not editable')
    }
    
    await fs.writeFile(filePath, newContent, 'utf-8')
    return { filesChanged: [filePath] }
    
  } catch (error) {
    throw new Error(`Failed to toggle classes: ${error.message}`)
  }
}
```

## Environment Configuration (Simplified)

### 1. Essential Feature Flags Only
```typescript
// Simplified environment configuration
interface VisualEditingConfig {
  enabled: boolean           // VISUAL_EDITING_ENABLED (global kill switch)
  devOnly: boolean          // VISUAL_EDITING_DEV_ONLY (hide in production)
  taggerEnabled: boolean    // VE_TAGGER_ENABLED (compile-time IDs)
  verbose: boolean          // VE_VERBOSE (debug logging)
}

const getVisualEditingConfig = (): VisualEditingConfig => ({
  enabled: process.env.VISUAL_EDITING_ENABLED !== 'false',
  devOnly: process.env.VISUAL_EDITING_DEV_ONLY === 'true',
  taggerEnabled: process.env.VE_TAGGER_ENABLED === 'true',
  verbose: process.env.VE_VERBOSE === 'true'
})
```

## Implementation Timeline (6 Weeks)

### Week 1: Foundation & Chat Integration
- [ ] Enhanced `BuilderChatInterface` with visual edit mode
- [ ] Basic same-origin preview switching
- [ ] Visual edit toggle and banner UI
- [ ] Element selection system (desktop)

### Week 2: Direct Editing & Mobile
- [ ] Text literal editing with string manipulation
- [ ] Tailwind class toggle functionality
- [ ] Mobile bottom sheet interface
- [ ] Touch selection (long-press)

### Week 3: Visual Feedback & Chat Messages
- [ ] Visual edit summary cards in chat
- [ ] Optimistic preview updates
- [ ] Error handling and user feedback
- [ ] "Why can't I edit this?" explanations

### Week 4: AI Prompt Integration
- [ ] Element-scoped AI prompts
- [ ] Credit consumption via existing balance system
- [ ] AI edit processing through existing pipeline
- [ ] Balance error handling integration

### Week 5: Build Events & Persistence
- [ ] Visual edit events in build events stream
- [ ] HMR trigger after code changes
- [ ] React Query cache invalidation
- [ ] File change validation

### Week 6: Polish & Testing
- [ ] Keyboard shortcuts (Alt+S, Esc)
- [ ] Error recovery and rollback
- [ ] Performance optimization
- [ ] End-to-end testing with Playwright

## Success Metrics

### Technical Success
- Visual editing works in 90%+ of tagged elements
- Direct edits save successfully in <1.5 seconds
- Mobile interface performs smoothly on iOS/Android
- No impact on existing chat functionality

### User Experience Success
- Clear distinction between free and credit-consuming edits
- Intuitive transitions between chat and visual edit modes
- Mobile touch interactions feel natural
- Error messages provide actionable guidance

### Business Success
- Reduced time for simple styling changes (text, colors)
- Increased builder engagement and session length
- Clear monetization path through credit consumption
- Lower support burden for styling questions

## What We're Explicitly NOT Doing

❌ **Heavy AST manipulation libraries** (ts-morph, etc.)  
❌ **Complex proxy infrastructure** (HMAC, health checks)  
❌ **Extensive audit trail persistence**  
❌ **Complex mobile gestures** (two-finger cancel, etc.)  
❌ **Next.js/SWC support** (Vite-only for MVP)  
❌ **Advanced element types** (div, span - keep to 8 element types)  
❌ **Rebind/recovery systems** for missing element IDs  

This plan delivers core visual editing functionality with deep chat integration while avoiding over-engineering that could delay MVP launch.