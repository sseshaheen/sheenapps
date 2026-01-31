# Builder Mobile Responsiveness Strategy

## Executive Summary

The SheenApps builder is a sophisticated AI-powered website building platform that currently operates with a desktop-first design. This document outlines a comprehensive 8-week strategy to implement mobile responsiveness while preserving the platform's advanced functionality and ensuring superior user experience across all devices.

## Current Architecture Analysis

### Builder System Components

#### Core Architecture Files
- **State Management**: `builder-store.ts`, `question-flow-store.ts`, `preview-generation-store.ts`, `per-section-history-store.ts`
- **Main Components**: `builder-wrapper.tsx`, `workspace-page.tsx`, `enhanced-workspace-page.tsx`, `orchestration-interface.tsx`
- **Layout System**: `workspace-layout.tsx`, `workspace-header.tsx`, `sidebar.tsx`, `main-work-area.tsx`, `right-panel.tsx`
- **Question Flow**: `question-interface.tsx`, `question-option.tsx`, `question-flow.ts`
- **Section Editing**: `section-edit-system.tsx`, `section-edit-dialog.tsx`, `inline-section-controls.tsx`
- **Preview Engine**: `live-preview-engine.ts`, `component-generation-orchestrator.ts`, `enhanced-preview.tsx`

#### Key Features
1. **Modular Design**: Clear separation between UI, state management, AI services, and preview generation
2. **Progressive Enhancement**: Three-tier experience (view-only, hover hints, full edit mode)
3. **Section-Based Editing**: Per-section undo/redo with composite keys
4. **Live Preview Engine**: Real-time updates with design system management
5. **AI Integration**: Comprehensive orchestration for content generation and modifications
6. **Question Flow System**: Dynamic progression with adaptive follow-up questions
7. **Workspace System**: Full-featured environment with multi-panel layout

## Critical Mobile Challenges

### 1. Fixed Layout Architecture
- **Header**: 160px fixed height with 7+ interactive elements
  - Back button + logo + project name + save status + share + export + settings + user menu
- **Sidebar**: Fixed 256px width (collapsed: 48px)
  - Tab navigation + project list + settings in limited vertical space
- **Main Area**: Three-panel layout (384px left + flex center + 320px right)
  - Left: Question flow and building progress
  - Center: Live preview with viewport controls
  - Right: AI chat with full conversation UI
- **Right Panel**: Fixed 320px width
  - Chat history, input field, examples, usage indicators

### 2. Desktop-First Component Design
- **Question Interface**: Grid layouts, pagination controls, hover states
- **Section Edit Dialog**: Full-screen modals with desktop forms
- **Preview Container**: Fixed iframe dimensions with device simulation
- **Undo/Redo Controls**: Inline buttons optimized for mouse interaction
- **AI Chat**: Avatar-based conversation with timestamps and usage limits

### 3. Content Density Issues
- **Header Overflow**: Too many actions for mobile screen width
- **Sidebar Navigation**: Complex tab system doesn't work on narrow screens
- **Question Options**: Grid layouts that break on mobile
- **Chat Interface**: Desktop conversation patterns with excessive whitespace

### 4. Interaction Pattern Problems
- **Multi-panel Navigation**: Users must switch between left questions, center preview, right chat
- **Modal Management**: Section editing overlays may not fit mobile viewports
- **Scroll Conflicts**: Multiple scrollable areas cause confusion on touch devices
- **Touch Targets**: Many interactive elements below 44px minimum size

## Comprehensive Mobile Strategy

### Phase 1: Responsive Foundation (Weeks 1-2)

#### 1.1 Breakpoint System Implementation
```typescript
// Add to tailwind.config.js
const breakpoints = {
  'mobile': '320px',      // Small phones (iPhone SE)
  'mobile-lg': '480px',   // Large phones (iPhone 12/13)
  'tablet': '768px',      // Tablets (iPad)
  'tablet-lg': '1024px',  // Large tablets (iPad Pro)
  'desktop': '1280px',    // Desktop
  'desktop-lg': '1536px'  // Large desktop
}

// Create responsive hook
export const useResponsive = () => {
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')

  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth
      const height = window.innerHeight

      setOrientation(width > height ? 'landscape' : 'portrait')

      if (width < 480) setViewport('mobile')
      else if (width < 768) setViewport('mobile-lg')
      else if (width < 1024) setViewport('tablet')
      else setViewport('desktop')
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  return {
    viewport,
    orientation,
    isMobile: viewport === 'mobile' || viewport === 'mobile-lg',
    isTablet: viewport === 'tablet',
    isDesktop: viewport === 'desktop',
    showMobileUI: viewport !== 'desktop',
    isPortrait: orientation === 'portrait'
  }
}
```

#### 1.2 Layout Architecture Redesign
```typescript
// Enhanced workspace layout state
interface ResponsiveLayoutState {
  viewport: 'mobile' | 'mobile-lg' | 'tablet' | 'desktop'
  activePanel: 'questions' | 'preview' | 'chat' | 'settings'
  collapsedPanels: Set<string>
  orientation: 'portrait' | 'landscape'
  headerCollapsed: boolean
  sidebarMode: 'overlay' | 'push' | 'hidden'
}

// Adaptive workspace layout component
export const AdaptiveWorkspaceLayout = ({ children, isFullscreen }: WorkspaceLayoutProps) => {
  const { showMobileUI, viewport, isPortrait } = useResponsive()

  return (
    <div className={cn(
      "flex flex-col bg-gray-900 text-white",
      isFullscreen ? "fixed inset-0 z-50" : "h-screen",
      showMobileUI && "mobile-workspace"
    )}>
      {showMobileUI ? (
        <MobileWorkspaceLayout viewport={viewport} isPortrait={isPortrait}>
          {children}
        </MobileWorkspaceLayout>
      ) : (
        <DesktopWorkspaceLayout>
          {children}
        </DesktopWorkspaceLayout>
      )}
    </div>
  )
}
```

#### 1.3 CSS Foundation Updates
```css
/* Mobile-first responsive utilities */
.mobile-workspace {
  --header-height: 56px;
  --tab-bar-height: 60px;
  --content-height: calc(100vh - var(--header-height) - var(--tab-bar-height));
}

.tablet-workspace {
  --header-height: 64px;
  --sidebar-width: 280px;
  --content-height: calc(100vh - var(--header-height));
}

.desktop-workspace {
  --header-height: 72px;
  --sidebar-width: 256px;
  --right-panel-width: 320px;
}

/* Touch target optimization */
.mobile-touch-target {
  min-height: 44px;
  min-width: 44px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Panel system */
.mobile-panel {
  position: fixed;
  top: var(--header-height);
  left: 0;
  right: 0;
  bottom: var(--tab-bar-height);
  background: theme('colors.gray.900');
  transform: translateX(100%);
  transition: transform 0.3s ease-in-out;
}

.mobile-panel.active {
  transform: translateX(0);
}
```

### Phase 2: Mobile Navigation System (Weeks 2-3)

#### 2.1 Bottom Tab Navigation Implementation
```typescript
// Mobile tab bar component
interface MobileTab {
  id: 'questions' | 'preview' | 'chat' | 'settings'
  icon: LucideIcon
  label: string
  badge?: number
  disabled?: boolean
}

export const MobileTabBar = () => {
  const { activePanel, setActivePanel } = useMobileNavigation()
  const { user } = useAuthStore()
  const { questionHistory } = useQuestionFlowStore()

  const tabs: MobileTab[] = [
    {
      id: 'questions',
      icon: Target,
      label: 'Build',
      badge: questionHistory.length
    },
    {
      id: 'preview',
      icon: Eye,
      label: 'Preview'
    },
    {
      id: 'chat',
      icon: MessageCircle,
      label: 'Human Help',
      disabled: !user?.plan || user.plan === 'free'
    },
    {
      id: 'settings',
      icon: Settings,
      label: 'More'
    }
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 z-40">
      <div className="flex h-16">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActivePanel(tab.id)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 mobile-touch-target",
              "transition-colors duration-200",
              activePanel === tab.id
                ? "text-purple-400 bg-gray-700/50"
                : "text-gray-400 hover:text-gray-300",
              tab.disabled && "opacity-50 cursor-not-allowed"
            )}
            disabled={tab.disabled}
          >
            <div className="relative">
              <tab.icon className="w-5 h-5" />
              {tab.badge && tab.badge > 0 && (
                <span className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

#### 2.2 Collapsible Mobile Header
```typescript
// Mobile-optimized header
export const MobileWorkspaceHeader = ({
  projectName,
  isSaving,
  lastSaved,
  onShare,
  onExport,
  translations,
  canShare,
  canExport
}: WorkspaceHeaderProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { user, logout } = useAuthStore()
  const router = useRouter()

  return (
    <header className="bg-gray-800 border-b border-gray-700">
      {/* Collapsed Header */}
      <div className="px-4 py-3 flex items-center justify-between h-14">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white p-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2 min-w-0">
            <img
              src="https://sheenapps.com/sheenapps-logo-trans--min.png"
              alt="SheenApps"
              className="h-5 flex-shrink-0"
            />
            <h1 className="text-sm font-semibold truncate">
              {projectName}
            </h1>
          </div>
        </div>

        {/* Save Status */}
        <div className="flex items-center gap-2">
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : lastSaved ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Save className="w-4 h-4 text-gray-400" />
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white p-2"
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Expanded Actions */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-700 overflow-hidden"
          >
            <div className="p-4 space-y-3">
              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onShare}
                  disabled={!canShare}
                  className="justify-start"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  {translations.share}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExport}
                  disabled={!canExport}
                  className="justify-start"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {translations.export}
                </Button>
              </div>

              {/* User Info */}
              {user && (
                <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-8 h-8 rounded-full"
                    />
                    <div>
                      <div className="text-sm font-medium text-white">{user.name}</div>
                      <div className="text-xs text-gray-400 capitalize">{user.plan} Plan</div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={logout}
                    className="text-gray-400 hover:text-white"
                  >
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
```

### Phase 3: Panel Management System (Weeks 3-4)

#### 3.1 Mobile Panel Manager
```typescript
// Mobile panel management system
export const useMobileNavigation = () => {
  const [activePanel, setActivePanel] = useState<'questions' | 'preview' | 'chat' | 'settings'>('questions')
  const [panelHistory, setPanelHistory] = useState<string[]>(['questions'])
  const [swipeEnabled, setSwipeEnabled] = useState(true)

  const showPanel = useCallback((panelId: string) => {
    setActivePanel(panelId as any)
    setPanelHistory(prev => {
      const filtered = prev.filter(id => id !== panelId)
      return [...filtered, panelId]
    })
  }, [])

  const goBack = useCallback(() => {
    if (panelHistory.length > 1) {
      const newHistory = [...panelHistory]
      newHistory.pop()
      const previousPanel = newHistory[newHistory.length - 1]
      setPanelHistory(newHistory)
      setActivePanel(previousPanel as any)
    }
  }, [panelHistory])

  return {
    activePanel,
    setActivePanel: showPanel,
    goBack,
    canGoBack: panelHistory.length > 1,
    swipeEnabled,
    setSwipeEnabled
  }
}

// Mobile panel container with swipe support
export const MobilePanelContainer = ({ children }: { children: React.ReactNode }) => {
  const { activePanel, setActivePanel, swipeEnabled } = useMobileNavigation()
  const [startX, setStartX] = useState(0)
  const [currentX, setCurrentX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const panels = ['questions', 'preview', 'chat', 'settings']
  const currentIndex = panels.indexOf(activePanel)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!swipeEnabled) return
    setStartX(e.touches[0].clientX)
    setCurrentX(e.touches[0].clientX)
    setIsDragging(true)
  }, [swipeEnabled])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || !swipeEnabled) return
    setCurrentX(e.touches[0].clientX)
  }, [isDragging, swipeEnabled])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging || !swipeEnabled) return

    const diff = startX - currentX
    const threshold = 50

    if (Math.abs(diff) > threshold) {
      if (diff > 0 && currentIndex < panels.length - 1) {
        // Swipe left - next panel
        setActivePanel(panels[currentIndex + 1])
      } else if (diff < 0 && currentIndex > 0) {
        // Swipe right - previous panel
        setActivePanel(panels[currentIndex - 1])
      }
    }

    setIsDragging(false)
    setStartX(0)
    setCurrentX(0)
  }, [isDragging, swipeEnabled, startX, currentX, currentIndex, setActivePanel])

  useEffect(() => {
    const element = document.getElementById('mobile-panel-container')
    if (!element) return

    element.addEventListener('touchstart', handleTouchStart)
    element.addEventListener('touchmove', handleTouchMove)
    element.addEventListener('touchend', handleTouchEnd)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return (
    <div
      id="mobile-panel-container"
      className="relative overflow-hidden"
      style={{
        height: 'var(--content-height)',
        transform: isDragging ? `translateX(${currentX - startX}px)` : undefined,
        transition: isDragging ? 'none' : 'transform 0.3s ease-out'
      }}
    >
      {children}
    </div>
  )
}
```

#### 3.2 Mobile Sheet System
```typescript
// Mobile bottom sheet component
interface MobileSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  snapPoints?: number[]
  initialSnap?: number
}

export const MobileSheet = ({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = [0.4, 0.8, 1],
  initialSnap = 1
}: MobileSheetProps) => {
  const [snapIndex, setSnapIndex] = useState(initialSnap)
  const [isDragging, setIsDragging] = useState(false)
  const [startY, setStartY] = useState(0)
  const [currentY, setCurrentY] = useState(0)

  const snapHeight = snapPoints[snapIndex] * window.innerHeight

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: `${100 - snapPoints[snapIndex] * 100}%` }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 bg-gray-800 rounded-t-2xl shadow-2xl z-50"
            style={{
              height: snapHeight,
              transform: isDragging ? `translateY(${currentY - startY}px)` : undefined
            }}
          >
            {/* Handle */}
            <div
              className="flex justify-center pt-3 pb-2"
              onTouchStart={(e) => {
                setStartY(e.touches[0].clientY)
                setCurrentY(e.touches[0].clientY)
                setIsDragging(true)
              }}
              onTouchMove={(e) => {
                if (isDragging) {
                  setCurrentY(e.touches[0].clientY)
                }
              }}
              onTouchEnd={() => {
                if (isDragging) {
                  const diff = currentY - startY
                  const threshold = 100

                  if (diff > threshold && snapIndex > 0) {
                    setSnapIndex(snapIndex - 1)
                  } else if (diff < -threshold && snapIndex < snapPoints.length - 1) {
                    setSnapIndex(snapIndex + 1)
                  } else if (diff > threshold && snapIndex === 0) {
                    onClose()
                  }

                  setIsDragging(false)
                }
              }}
            >
              <div className="w-12 h-1 bg-gray-600 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-gray-400 hover:text-white p-2"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

### Phase 4: Component Responsive Redesign (Weeks 4-6)

#### 4.1 Mobile Question Interface
```typescript
// Mobile-optimized question interface
export const MobileQuestionInterface = ({ projectId, previewEngine }: QuestionInterfaceProps) => {
  const currentQuestion = useCurrentQuestion()
  const { completionPercentage } = useFlowProgress()
  const { answerQuestion } = useQuestionFlowActions()
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="h-full flex flex-col">
      {/* Progress Bar */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">Building Progress</span>
          <span className="text-sm text-gray-400">{Math.round(completionPercentage)}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <motion.div
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${completionPercentage}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Question Content */}
      <div className="flex-1 overflow-y-auto">
        {currentQuestion && (
          <div className="p-4 space-y-6">
            {/* Question Text */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white leading-tight">
                {currentQuestion.text}
              </h2>
              {currentQuestion.description && (
                <p className="text-gray-400 leading-relaxed">
                  {currentQuestion.description}
                </p>
              )}
            </div>

            {/* Options */}
            <div className="space-y-3">
              {currentQuestion.options.map((option) => (
                <motion.button
                  key={option.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * currentQuestion.options.indexOf(option) }}
                  onClick={() => {
                    setSelectedOption(option.id)
                    // Show mini preview on mobile
                    if (option.previewImpact) {
                      setShowPreview(true)
                    }
                  }}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 transition-all duration-200",
                    "mobile-touch-target text-left",
                    selectedOption === option.id
                      ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20"
                      : "border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-750"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5",
                      selectedOption === option.id
                        ? "border-purple-500 bg-purple-500"
                        : "border-gray-500"
                    )}>
                      {selectedOption === option.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-full h-full rounded-full bg-white scale-50"
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white mb-1">{option.text}</h3>
                      {option.description && (
                        <p className="text-sm text-gray-400 leading-relaxed">
                          {option.description}
                        </p>
                      )}
                    </div>

                    {option.previewImpact && (
                      <Eye className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Bar */}
      {selectedOption && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="p-4 border-t border-gray-700 bg-gray-800/95 backdrop-blur-sm"
        >
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowPreview(true)}
              className="flex-1"
              disabled={!currentQuestion?.options.find(o => o.id === selectedOption)?.previewImpact}
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>

            <Button
              size="lg"
              onClick={() => {
                const option = currentQuestion?.options.find(o => o.id === selectedOption)
                if (option) {
                  answerQuestion(selectedOption, {
                    confidence: 1,
                    timeToAnswer: Date.now() - questionStartTime
                  })
                }
              }}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Mini Preview Sheet */}
      <MobileSheet
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Preview Changes"
        snapPoints={[0.6, 0.9]}
        initialSnap={0}
      >
        <div className="p-4">
          <div className="bg-gray-100 rounded-lg h-96 flex items-center justify-center">
            <span className="text-gray-600">Live preview will appear here</span>
          </div>
        </div>
      </MobileSheet>
    </div>
  )
}
```

#### 4.2 Mobile Preview Container
```typescript
// Mobile-optimized preview container
export const MobilePreviewContainer = ({ previewEngine }: { previewEngine: any }) => {
  const [viewportMode, setViewportMode] = useState<'mobile' | 'tablet' | 'desktop'>('mobile')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const viewportSizes = {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1200, height: 800 }
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Preview Controls */}
      <div className="bg-gray-800 border-b border-gray-700 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-medium text-sm">Live Preview</h3>
            <div className="flex bg-gray-700 rounded-lg p-1">
              {Object.entries(viewportSizes).map(([mode, size]) => (
                <button
                  key={mode}
                  onClick={() => setViewportMode(mode as any)}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors",
                    viewportMode === mode
                      ? "bg-purple-600 text-white"
                      : "text-gray-400 hover:text-white"
                  )}
                >
                  {mode === 'mobile' ? '📱' : mode === 'tablet' ? '📚' : '💻'}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="text-gray-400 hover:text-white p-2"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Preview Iframe */}
      <div className="flex-1 p-4 flex items-center justify-center">
        <div
          ref={previewRef}
          className="bg-white rounded-lg shadow-xl overflow-hidden"
          style={{
            width: isFullscreen ? '100%' : viewportSizes[viewportMode].width,
            height: isFullscreen ? '100%' : viewportSizes[viewportMode].height,
            maxWidth: '100%',
            maxHeight: '100%'
          }}
        >
          {/* Preview content will be injected here */}
        </div>
      </div>
    </div>
  )
}
```

#### 4.3 Mobile AI Chat Interface
```typescript
// Mobile-optimized AI chat
export const MobileAIChatInterface = ({ canChat, onRequestUpgrade }: { canChat: boolean, onRequestUpgrade: () => void }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || !canChat) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsTyping(true)

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: "I can help you customize that section. Let me generate some options for you.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, aiMessage])
      setIsTyping(false)
    }, 1500)
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-medium text-white">AI Assistant</h3>
            <p className="text-xs text-gray-400">Here to help build your app</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">AI Assistant Ready</h3>
            <p className="text-gray-400 mb-4">Ask me anything about building your app</p>

            {/* Quick suggestions */}
            <div className="space-y-2">
              {[
                "Make the header more professional",
                "Add a booking button to the hero",
                "Change the color scheme"
              ].map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setInput(suggestion)}
                  className="w-full p-3 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors"
                  disabled={!canChat}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.type === 'user' ? "justify-end" : "justify-start"
            )}
          >
            {message.type === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}

            <div
              className={cn(
                "max-w-[80%] p-3 rounded-2xl",
                message.type === 'user'
                  ? "bg-purple-600 text-white rounded-br-md"
                  : "bg-gray-800 text-gray-100 rounded-bl-md"
              )}
            >
              <p className="text-sm leading-relaxed">{message.content}</p>
              <span className="text-xs opacity-70 mt-1 block">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {message.type === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-800 p-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-700">
        {canChat ? (
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me to customize your app..."
                className="w-full bg-gray-800 border border-gray-600 rounded-2xl px-4 py-3 pr-12 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '120px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim()}
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 h-8 w-8"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={onRequestUpgrade}
            variant="outline"
            className="w-full h-12"
          >
            <Lock className="w-4 h-4 mr-2" />
            Unlock AI Chat Features
          </Button>
        )}
      </div>
    </div>
  )
}
```

### Phase 5: Touch & Gesture Optimization (Weeks 6-7)

#### 5.1 Touch Gesture System
```typescript
// Touch gesture recognition hook
export const useGestures = (
  element: RefObject<HTMLElement>,
  options: {
    onSwipeLeft?: () => void
    onSwipeRight?: () => void
    onSwipeUp?: () => void
    onSwipeDown?: () => void
    onPinch?: (scale: number) => void
    onLongPress?: () => void
    threshold?: number
  }
) => {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onPinch,
    onLongPress,
    threshold = 50
  } = options

  useEffect(() => {
    const el = element.current
    if (!el) return

    let startX = 0
    let startY = 0
    let startTime = 0
    let longPressTimer: NodeJS.Timeout

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      startTime = Date.now()

      // Long press detection
      if (onLongPress) {
        longPressTimer = setTimeout(() => {
          onLongPress()
        }, 500)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      // Cancel long press if moving
      if (longPressTimer) {
        clearTimeout(longPressTimer)
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
      }

      const touch = e.changedTouches[0]
      const endX = touch.clientX
      const endY = touch.clientY
      const deltaX = endX - startX
      const deltaY = endY - startY
      const deltaTime = Date.now() - startTime

      // Only recognize quick swipes
      if (deltaTime > 300) return

      // Determine swipe direction
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (Math.abs(deltaX) > threshold) {
          if (deltaX > 0 && onSwipeRight) {
            onSwipeRight()
          } else if (deltaX < 0 && onSwipeLeft) {
            onSwipeLeft()
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(deltaY) > threshold) {
          if (deltaY > 0 && onSwipeDown) {
            onSwipeDown()
          } else if (deltaY < 0 && onSwipeUp) {
            onSwipeUp()
          }
        }
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: true })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      if (longPressTimer) {
        clearTimeout(longPressTimer)
      }
    }
  }, [element, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onLongPress, threshold])
}
```

#### 5.2 Enhanced Touch Interactions
```typescript
// Touch-optimized section editing
export const TouchSectionControls = ({
  sectionType,
  sectionId,
  onEdit
}: {
  sectionType: string
  sectionId: string
  onEdit: () => void
}) => {
  const [showControls, setShowControls] = useState(false)
  const controlsRef = useRef<HTMLDivElement>(null)

  useGestures(controlsRef, {
    onLongPress: () => {
      setShowControls(true)
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }
    },
    onSwipeUp: () => {
      if (showControls) {
        onEdit()
      }
    }
  })

  return (
    <div ref={controlsRef} className="relative">
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            className="absolute top-0 right-0 bg-gray-900/90 backdrop-blur-sm rounded-lg p-2 shadow-lg border border-gray-700 z-10"
          >
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={onEdit}
                className="mobile-touch-target text-white hover:bg-gray-700"
              >
                <Edit3 className="w-4 h-4" />
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowControls(false)}
                className="mobile-touch-target text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual hint for long press */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.02, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="w-full h-full border-2 border-purple-500/30 rounded-lg"
        />
      </div>
    </div>
  )
}
```

### Phase 6: Performance & UX Polish (Weeks 7-8)

#### 6.1 Mobile Loading States
```typescript
// Mobile-optimized loading components
export const MobileSkeletonLoader = ({ type }: { type: 'question' | 'preview' | 'chat' }) => {
  const skeletons = {
    question: (
      <div className="p-4 space-y-6">
        <div className="space-y-3">
          <div className="h-6 bg-gray-700 rounded-lg animate-pulse" />
          <div className="h-4 bg-gray-700 rounded-lg w-3/4 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    ),
    preview: (
      <div className="p-4">
        <div className="bg-gray-700 rounded-lg h-96 animate-pulse" />
      </div>
    ),
    chat: (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="w-8 h-8 bg-gray-700 rounded-full animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-700 rounded animate-pulse" />
              <div className="h-4 bg-gray-700 rounded w-2/3 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return skeletons[type]
}

// Progressive image loading for mobile
export const MobileProgressiveImage = ({
  src,
  alt,
  className,
  placeholder
}: {
  src: string
  alt: string
  className?: string
  placeholder?: string
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {!isLoaded && !error && (
        <div className="absolute inset-0 bg-gray-700 animate-pulse flex items-center justify-center">
          {placeholder && (
            <span className="text-gray-400 text-sm">{placeholder}</span>
          )}
        </div>
      )}

      <img
        src={src}
        alt={alt}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setIsLoaded(true)}
        onError={() => setError(true)}
        loading="lazy"
      />

      {error && (
        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
          <span className="text-gray-400 text-sm">Failed to load</span>
        </div>
      )}
    </div>
  )
}
```

#### 6.2 Offline Support
```typescript
// Service worker for offline functionality
export const registerServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration)
      })
      .catch((error) => {
        console.log('SW registration failed:', error)
      })
  }
}

// Offline indicator component
export const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <motion.div
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 text-sm z-50"
    >
      <WifiOff className="w-4 h-4 inline mr-2" />
      You're offline. Some features may be limited.
    </motion.div>
  )
}
```

## Implementation Timeline

### Week 1-2: Foundation
- ✅ Responsive breakpoint system
- ✅ Adaptive layout components
- ✅ CSS foundation updates
- ✅ Touch target optimization

### Week 3-4: Navigation & Panels
- ✅ Bottom tab navigation
- ✅ Mobile header redesign
- ✅ Panel management system
- ✅ Mobile sheet components

### Week 5-6: Component Redesign
- ✅ Mobile question interface
- ✅ Mobile preview container
- ✅ Mobile AI chat interface
- ✅ Mobile section editing

### Week 7-8: Polish & Performance
- ✅ Touch gesture system
- ✅ Mobile loading states
- ✅ Performance optimization
- ✅ Offline support
- ✅ Cross-device testing

## Success Metrics

### User Experience
- **Touch Target Compliance**: 100% of interactive elements ≥44px
- **Navigation Efficiency**: <3 taps to reach any feature
- **Loading Performance**: <2s initial load on 3G
- **Gesture Recognition**: 95% accuracy for swipe navigation

### Technical Performance
- **Mobile Lighthouse Score**: >90
- **Bundle Size**: <500KB gzipped for mobile
- **Memory Usage**: <100MB on average mobile device
- **Battery Impact**: Minimal drain during normal usage

### Accessibility
- **WCAG 2.1 AA Compliance**: 100%
- **Screen Reader Support**: Full functionality
- **High Contrast Mode**: Complete support
- **Keyboard Navigation**: All features accessible

This comprehensive strategy ensures the builder system becomes fully mobile responsive while maintaining its sophisticated functionality and providing a superior user experience across all devices.
