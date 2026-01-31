# Granular Streaming Feedback Implementation Plan

## Current State Analysis

### ✅ What's Working Well
- **Event Infrastructure**: Robust `emitBuildEvent()` system with DB storage, EventEmitter, and webhook support
- **Basic AI Progress**: `ai_progress` events during Claude sessions with tool-based updates
- **Build Progress**: Some `build_progress` events during deployment (dependency fixes, validation skips)
- **Tool Awareness**: `extractUserUpdate()` intelligently converts Claude tool calls to user-friendly messages
- **Activity Metrics**: Tracking files created/modified, errors, tool calls

### 🔍 Current Event Types
```typescript
// AI Session Events
'ai_started' | 'ai_progress' | 'ai_time_tracking_started' | 'ai_time_consumed'

// Build/Deploy Events  
'build_started' | 'build_progress' | 'deploy_started' | 'deploy_progress' | 'deploy_completed'

// Task Events
'tasks_completed' | 'validation_skipped'

// Session Events
'session_stats' | 'metadata_generation_started'
```

### 📊 Current Granularity Gaps

#### 1. **AI Session Phase Tracking**
- Missing: Planning phase, execution phase, validation phase
- Missing: Progress percentage (X of Y tasks completed)
- Missing: Sub-task breakdowns (e.g., "Setting up TypeScript config", "Installing dependencies")

#### 2. **Build Pipeline Visibility**
- Missing: Package manager detection feedback
- Missing: Dependency installation progress (pnpm/npm stages)
- Missing: TypeScript compilation progress  
- Missing: Bundler-specific progress (Vite/Webpack/Next.js build stages)
- Missing: Asset optimization feedback

#### 3. **File Operation Details**
- Current: Basic "Creating package.json..." messages
- Missing: File size, complexity estimates, impact assessment
- Missing: Directory structure changes
- Missing: Configuration file relationships

#### 4. **Error Context & Recovery**
- Missing: Error severity levels
- Missing: Recovery attempt progress
- Missing: Impact assessment ("This error affects 3 components")

## 🎯 Implementation Plan

### Phase 1: Enhanced AI Session Tracking (Week 1)

#### 1.1 Session Phase Events
```typescript
// Add to eventService.ts
export type SessionPhase = 
  | 'initializing' 
  | 'planning' 
  | 'executing' 
  | 'validating' 
  | 'finalizing';

interface SessionPhaseEvent {
  phase: SessionPhase;
  progress: number; // 0-100
  estimatedDuration?: number;
  currentTask?: string;
  completedTasks: number;
  totalTasks: number;
}
```

**Implementation:**
- Modify `ClaudeSession.extractUserUpdate()` to detect phase transitions
- Add session phase tracking to `streamWorker.ts`
- Emit `ai_session_phase` events with progress details

#### 1.2 Enhanced Todo Progress Tracking
```typescript
interface TodoProgressEvent {
  activeTask: string;
  completedTasks: string[];
  remainingTasks: string[];
  progress: number; // 0-100
  estimatedTimeRemaining?: number;
  complexity: 'low' | 'medium' | 'high';
}
```

**Implementation:**
- Enhance `TodoWrite` tool detection in `extractUserUpdate()`
- Track task complexity based on tool usage patterns
- Provide time estimates based on historical data

#### 1.3 Tool Operation Details
```typescript
interface ToolOperationEvent {
  tool: string;
  operation: string; // 'create', 'modify', 'read', 'execute'
  target: string; // file name, command, etc.
  impact: 'low' | 'medium' | 'high';
  fileSize?: number;
  linesChanged?: number;
  dependencies?: string[]; // files that depend on this change
}
```

**Implementation:**
- Extend `extractUserUpdate()` with file analysis
- Add file dependency tracking
- Include impact assessment for changes

### Phase 2: Build Pipeline Granularity (Week 2)

#### 2.1 Package Manager Operations
```typescript
interface PackageManagerEvent {
  manager: 'npm' | 'pnpm' | 'yarn';
  operation: 'install' | 'update' | 'audit';
  stage: 'resolving' | 'fetching' | 'linking' | 'building';
  packagesTotal: number;
  packagesCompleted: number;
  currentPackage?: string;
  downloadProgress?: number; // MB downloaded
}
```

**Implementation:**
- Parse package manager output in real-time during deployment
- Add progress tracking to `deployWorker.ts`
- Emit `package_manager_progress` events

#### 2.2 Build System Integration
```typescript
interface BuildSystemEvent {
  system: 'vite' | 'webpack' | 'next' | 'parcel';
  stage: 'analyzing' | 'compiling' | 'bundling' | 'optimizing' | 'emitting';
  progress: number;
  modulesTotal?: number;
  modulesCompiled?: number;
  currentModule?: string;
  outputSize?: number; // bytes
  warnings: number;
  errors: number;
}
```

**Implementation:**
- Parse build tool output (Vite, Webpack, etc.) 
- Extract compilation progress metrics
- Add build system detection to `deployWorker.ts`

#### 2.3 TypeScript Compilation Tracking
```typescript
interface TypeScriptEvent {
  stage: 'parsing' | 'type-checking' | 'emitting';
  filesTotal: number;
  filesProcessed: number;
  currentFile?: string;
  errorsFound: number;
  warningsFound: number;
  diagnostics?: string[];
}
```

**Implementation:**
- Parse `tsc` output during builds
- Track TypeScript compilation separately from bundling
- Provide early error detection

### Phase 3: Error Context & Recovery (Week 3)

#### 3.1 Enhanced Error Events
```typescript
interface ErrorContextEvent {
  errorId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'dependency' | 'typescript' | 'build' | 'runtime' | 'configuration';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  affectedFiles: string[];
  suggestedFixes: string[];
  recoveryAttempts: number;
  isRecoverable: boolean;
}
```

#### 3.2 Recovery Progress Tracking
```typescript
interface RecoveryProgressEvent {
  errorId: string;
  attempt: number;
  strategy: string;
  stage: 'analyzing' | 'attempting' | 'validating' | 'completed' | 'failed';
  confidence: number; // 0-100
  estimatedDuration?: number;
}
```

### Phase 4: Real-time Metrics Dashboard (Week 4)

#### 4.1 Performance Metrics
```typescript
interface PerformanceMetricsEvent {
  memory: {
    used: number;
    available: number;
    peak: number;
  };
  cpu: {
    usage: number;
    cores: number;
  };
  disk: {
    used: number;
    available: number;
    io: number;
  };
  network: {
    bytesDownloaded: number;
    requestsCount: number;
  };
}
```

#### 4.2 Quality Metrics
```typescript
interface QualityMetricsEvent {
  codeQuality: {
    lintErrors: number;
    lintWarnings: number;
    complexity: number; // cyclomatic complexity
    coverage?: number; // test coverage if available
  };
  dependencies: {
    total: number;
    outdated: number;
    vulnerable: number;
    unused: number;
  };
  bundleAnalysis: {
    size: number;
    gzipSize: number;
    chunkCount: number;
    largestChunks: Array<{name: string; size: number}>;
  };
}
```

## 🔧 Technical Implementation Details

### 1. Event Stream Architecture

```typescript
// Enhanced event service
export class GranularEventService {
  private phases: Map<string, SessionPhase> = new Map();
  private metrics: Map<string, any> = new Map();
  
  async emitPhaseEvent(buildId: string, phase: SessionPhase, data: any) {
    this.phases.set(buildId, phase);
    await emitBuildEvent(buildId, 'session_phase', {
      phase,
      timestamp: Date.now(),
      ...data
    });
  }
  
  async emitProgressUpdate(buildId: string, progress: number, details: any) {
    await emitBuildEvent(buildId, 'progress_update', {
      progress,
      phase: this.phases.get(buildId),
      timestamp: Date.now(),
      ...details
    });
  }
}
```

### 2. Output Parsing Utilities

```typescript
// Build output parsers
export class BuildOutputParser {
  static parseViteOutput(line: string): BuildSystemEvent | null {
    // Parse Vite build output
    if (line.includes('transforming')) {
      return {
        system: 'vite',
        stage: 'compiling',
        // ... extract details
      };
    }
    return null;
  }
  
  static parsePnpmOutput(line: string): PackageManagerEvent | null {
    // Parse pnpm install progress
    if (line.includes('Progress:')) {
      // Extract progress details
    }
    return null;
  }
}
```

### 3. Client-Side Integration

```typescript
// Frontend streaming client
class GranularProgressClient {
  private eventSource: EventSource;
  private callbacks: Map<string, Function[]> = new Map();
  
  constructor(buildId: string) {
    this.eventSource = new EventSource(`/v1/builds/${buildId}/stream`);
    this.setupEventHandlers();
  }
  
  onPhaseChange(callback: (event: SessionPhaseEvent) => void) {
    this.subscribe('session_phase', callback);
  }
  
  onToolUsage(callback: (event: ToolOperationEvent) => void) {
    this.subscribe('tool_operation', callback);
  }
  
  onBuildProgress(callback: (event: BuildSystemEvent) => void) {
    this.subscribe('build_system_progress', callback);
  }
}
```

## 📈 Expected Benefits

### For Users
- **Better Expectations**: Clear phase indicators and time estimates
- **Reduced Anxiety**: Detailed progress prevents "is it stuck?" concerns  
- **Educational Value**: Understanding what's happening builds confidence
- **Problem Awareness**: Early error detection with clear explanations

### For Debugging
- **Granular Logs**: Pinpoint exactly where issues occur
- **Performance Analysis**: Identify bottlenecks in real-time
- **User Behavior**: Understand where users drop off or get confused
- **Quality Metrics**: Track success rates and improvement areas

### For Product Development
- **Usage Analytics**: Which build stages take longest?
- **Error Patterns**: Most common failure points
- **Feature Impact**: How do new features affect build times?
- **Optimization Opportunities**: Data-driven performance improvements

## 🚀 Implementation Priority

### Immediate (This Week)
1. Enhanced AI session phase tracking
2. Improved todo progress with complexity estimates
3. File operation details and impact assessment

### Next Week  
1. Package manager progress parsing
2. Build system integration (Vite/Next.js focus)
3. TypeScript compilation tracking

### Following Weeks
1. Error context and recovery progress
2. Performance and quality metrics
3. Client-side dashboard integration

## 🧪 Testing Strategy

### Unit Tests
- Event emission correctness
- Output parsing accuracy  
- Progress calculation logic

### Integration Tests
- End-to-end build tracking
- Real package manager outputs
- Various build system scenarios

### User Experience Tests
- Progress accuracy perception
- Timeout handling during long operations
- Error message clarity

## 📝 Success Metrics

### Technical
- Event emission latency < 100ms
- Progress accuracy > 95%
- Zero missed phase transitions
- Memory overhead < 50MB per build

### User Experience  
- Reduced support tickets about "stuck" builds
- Increased user retention during long builds
- Positive feedback on progress clarity
- Faster problem resolution times

---

This plan transforms the current basic progress tracking into a comprehensive, real-time visibility system that provides users with confidence and developers with debugging superpowers.