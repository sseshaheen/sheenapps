# Current Build Pipeline Flow: Pre/Post AI Scripts and Commands

## Overview

This document maps out all the scripts, commands, and validation steps that run before and after Claude/AI generation in our platform. The goal is to identify hardcoded tech stack assumptions and create opportunities for AI-driven dynamic flow organization.

## 🔍 **Pre-AI Generation Flow**

### 1. **Request Validation & Rate Limiting**
**Location**: `src/routes/createPreview.ts:42-93`

```typescript
// IP-based rate limiting (100 requests/hour per IP)
checkIPRateLimit(clientIP) 

// User-based build limiting (100 builds/hour per user)  
checkUserBuildLimit(userId)

// HMAC signature verification for API security
verifySignature(body, path, signature, secret)
```

**Commands Executed**: None (pure validation logic)

### 2. **AI Time Balance Check**
**Location**: `src/routes/createPreview.ts:268-293`

```typescript
// Check if user has sufficient AI time credits
const balanceCheck = await checkSufficientBalance(userId, 'main_build', 160)
```

**External API Call**: `/v1/billing/check-sufficient` (to billing service)

### 3. **System Configuration Validation**  
**Location**: `src/routes/createPreview.ts:304-322` & `src/workers/streamWorker.ts:308-326`

```bash
# SystemValidationService executes these commands:
cd "${projectPath}" && "${claudeBinary}" --version

# With fallback binary detection:
/usr/local/bin/claude --version
/opt/homebrew/bin/claude --version  
/usr/bin/claude --version
claude --version
```

**Purpose**: Verify Claude CLI is available and functional before wasting resources

### 4. **Usage Limit State Check**
**Location**: `src/routes/createPreview.ts:323-346` & `src/workers/streamWorker.ts:327-354`

```typescript
// Redis query to check if Claude CLI hit usage limits recently
const isLimitActive = await usageLimitService.isLimitActive()
```

**Redis Commands**: `GET claude_usage_limit_state`

### 5. **Project Path Security Validation**
**Location**: `src/workers/streamWorker.ts:468-492`

```typescript
// Validate project files are in correct user/project directory structure
const validation = await FileLocationValidator.validateProjectStructure(projectPath, userId, projectId)
```

**File System Operations**: Directory traversal and permission checks

### 6. **Package Manager Detection**  
**Location**: `src/workers/streamWorker.ts:21-55`

```typescript
// Check for lock files to detect package manager
const lockFiles = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' }, 
  { file: 'package-lock.json', manager: 'npm' }
]

// Fallback: check package.json for packageManager field
const packageContent = JSON.parse(await fs.readFile('package.json'))
const manager = packageContent.packageManager?.split('@')[0]
```

**File System Operations**: 
- `fs.access()` calls for each lock file
- `fs.readFile('package.json')` for packageManager field

---

## 🤖 **Claude/AI Generation Phase**

### AI Prompt Construction
**Location**: `src/workers/streamWorker.ts:832-979`

The prompts include **hardcoded tech stack assumptions**:

```typescript
// HARDCODED: Vite as default framework preference
`If building a web application, prefer using Vite as the build tool when possible`

// HARDCODED: TypeScript preference  
`Use TypeScript for better type safety and development experience`

// HARDCODED: NPM ecosystem assumption
`Just make it run with 'npm install && npm run dev'`

// HARDCODED: Specific validation commands
`To verify your changes work correctly, use: 'npx tsc --noEmit' or 'npm run build'`

// HARDCODED: Build output expectations
`Include package.json, tsconfig.json, and all config files`
```

### Claude CLI Execution
**Command**: 
```bash
cd "${projectPath}" && "${claudeBinary}" --output-format stream-json --verbose --dangerously-skip-permissions
```

**Input**: User prompt + technical requirements + project context
**Output**: Stream of JSON messages with file operations and build instructions

---

## 🚀 **Post-AI Generation Flow (Deployment Pipeline)**

### 1. **Package.json Validation & Creation**
**Location**: `src/workers/deployWorker.ts:354-373`

```typescript
// Check if package.json exists
await fs.access(path.join(projectPath, 'package.json'))

// If missing, create minimal package.json for static sites
const minimalPackageJson = {
  name: projectId,
  version: "1.0.0", 
  scripts: {
    build: "mkdir -p dist && cp -r *.html *.css *.js dist/ 2>/dev/null || echo 'Copied static files'"
  }
}
```

**Commands**: 
- `fs.access()` for existence check
- `fs.writeFile()` for minimal package.json creation

### 2. **Dependency Conflict Resolution**
**Location**: `src/workers/deployWorker.ts:426-434`

```typescript
// Apply known dependency fixes BEFORE installation
const fixResult = await fixDependencyConflicts(packageJsonPath)
```

**File Operations**: JSON parsing, conflict detection, automated fixes writing back to package.json

### 3. **Package Verification** 
**Location**: `src/workers/deployWorker.ts:466-492`

```typescript
// Verify packages exist in npm registry before attempting install
const verification = await verifyPackagesExist(packageJsonPath) 
```

**Network Operations**: HTTP requests to npm registry API for each dependency

### 4. **Dependency Installation Strategies**
**Location**: `src/workers/deployWorker.ts:504-594`

**HARDCODED Commands Executed in Sequence**:
```bash
# Strategy 1: Detected package manager
pnpm install --no-frozen-lockfile
pnpm install --force

# OR for yarn:
yarn install  
yarn install --force

# Strategy 2: Always include npm fallbacks
npm install
npm install --legacy-peer-deps  
npm install --force
```

**Exit Strategy**: First successful command stops the sequence

### 5. **TypeScript Validation (HARDCODED)**
**Location**: `src/workers/deployWorker.ts:607-688`

```bash
# HARDCODED: Always runs if tsconfig.json exists
npx tsc --noEmit
```

**Failure Handling**:
- Auto-fix attempts for common TypeScript errors
- Claude resume session for complex errors  
- **CRITICAL ASSUMPTION**: TypeScript tools are always available after npm install

### 6. **Framework Detection & Build Process**
**Location**: `src/workers/deployWorker.ts:193-246` & `src/workers/deployWorker.ts:724-764`

**HARDCODED Framework Detection**:
```typescript
// Framework detection with rigid if/else logic
if (packageContent.dependencies?.next || packageContent.devDependencies?.next) {
  return 'nextjs';
}

if (hasViteDependency || viteConfigExists) {
  if (packageContent.dependencies?.react) return 'react+vite';
  if (packageContent.dependencies?.vue) return 'vue+vite'; 
  if (packageContent.dependencies?.svelte) return 'svelte+vite';
  return 'vite';
}

if (packageContent.dependencies?.react) return 'react';
// ... more hardcoded checks
```

**HARDCODED Build Commands**:
```bash
# Primary build attempt
npm run build

# HARDCODED build output directory detection
possibleBuildDirs = ['dist', 'build', 'out', '.next']
```

### 7. **Build Output Resolution**
**Location**: `src/workers/deployWorker.ts:767-783`

```typescript
// HARDCODED: Check for build directories in specific order
const possibleBuildDirs = ['dist', 'build', 'out', '.next'];
for (const dir of possibleBuildDirs) {
  // Use first directory that exists
}
```

**File System Operations**:
- `fs.access()` and `fs.stat()` for each possible build directory
- Defaults to project root if no build directory found

### 8. **Cloudflare Pages Deployment**
**Location**: `src/workers/deployWorker.ts:804-813`

```bash
# Deploy to Cloudflare Pages with hardcoded project structure
# projectName = 'sheenapps-preview' (shared project)
# branchName = `build-${buildId}` (predictable naming)
```

**API Calls**: Cloudflare Pages API for deployment upload

### 9. **Artifact Storage & Cleanup**
**Location**: `src/workers/deployWorker.ts:826-937`

```bash
# Create deployment artifact zip
zip -r "${versionId}-artifact.zip" "${buildDir}"

# Upload to R2 storage for rollbacks
# Calculate SHA256 checksum for integrity
```

**Commands**:
- `zip` command for artifact creation
- SHA256 checksum calculation
- R2 API upload
- File cleanup (`rm` for temporary files)

---

## 🔒 **Hardcoded Tech Stack Assumptions Identified**

### 1. **Package Manager Ecosystem**
```typescript
// ASSUMES: npm/pnpm/yarn ecosystem only
// MISSING: Support for other ecosystems (go.mod, cargo.toml, requirements.txt, etc.)
const installStrategies = [
  'pnpm install --no-frozen-lockfile',
  'npm install', 
  'yarn install'
]
```

### 2. **Build Tool Assumptions**
```typescript
// ASSUMES: Node.js build tools are always available after npm install
// MISSING: Verification that tools actually exist
await execCommand('npx tsc --noEmit', projectPath);  // May fail
await execCommand('npm run build', projectPath);     // May fail
```

### 3. **Framework Detection Logic**
```typescript
// RIGID: Hardcoded if/else chains for framework detection
// BRITTLE: Breaks when new frameworks emerge or detection patterns change
if (hasViteDependency) {
  if (hasReact) return 'react+vite';
  if (hasVue) return 'vue+vite';
  // ... more hardcoded combinations
}
```

### 4. **Build Output Directory Assumptions**
```typescript
// ASSUMES: Standard Node.js build output directories
// MISSING: Framework-specific or custom output directories
const possibleBuildDirs = ['dist', 'build', 'out', '.next'];
```

### 5. **Command Execution Patterns**
```bash
# ASSUMES: Unix-like shell environment
# ASSUMES: Specific binary locations and naming
# MISSING: Windows support, alternative binary names
cd "${projectPath}" && "${claudeBinary}" --version
npx tsc --noEmit
npm run build
```

---

## 🚨 **Critical Failure Points**

### 1. **Tool Availability Assumption**
**Problem**: Code assumes build tools exist after `npm install` succeeds
**Failure**: `npx tsc --noEmit` fails with "command not found"
**Impact**: Deployment fails in TypeScript validation phase

### 2. **Framework Detection Brittleness** 
**Problem**: Hardcoded detection misses edge cases or new frameworks
**Failure**: Framework detected as 'unknown', wrong build commands used
**Impact**: Build process uses incorrect tools or output directories

### 3. **Build Command Rigidity**
**Problem**: Always runs `npm run build` regardless of project type
**Failure**: Static HTML projects don't need build, custom build tools ignored
**Impact**: Unnecessary failures for non-Node.js projects

### 4. **No Graceful Degradation**
**Problem**: Missing tools cause hard failures instead of fallbacks
**Failure**: TypeScript validation fails → entire deployment fails
**Impact**: Working projects can't deploy due to tooling issues

---

## 💡 **AI-Driven Dynamic Flow Opportunities**

### 1. **AI Project Analysis Phase**
Instead of hardcoded framework detection, use Claude to analyze the project:

```typescript
const projectAnalysis = await claudeAnalyze(`
Analyze this project structure and determine:
1. Primary technology stack
2. Required build tools  
3. Build command strategy
4. Output directory expectations
5. Validation requirements

Project files: ${fileList}
Package.json: ${packageContent}
`);
```

### 2. **Dynamic Command Generation**
Let Claude generate appropriate commands based on project analysis:

```typescript
const buildStrategy = await claudeGenerate(`
Based on this project analysis: ${projectAnalysis}
Generate the exact shell commands needed to:
1. Install dependencies
2. Validate the build
3. Execute the build process
4. Locate the build output

Provide fallback commands for each step if primary commands fail.
`);
```

### 3. **Adaptive Validation Strategy**
Replace hardcoded validation with AI-driven validation logic:

```typescript
const validationStrategy = await claudeValidation(`
For this project type: ${projectAnalysis.techStack}
Determine what validation steps are:
1. Required (will fail deployment if missing)
2. Optional (will warn but continue)
3. Not applicable (skip entirely)

Consider: TypeScript checking, linting, testing, security scans
`);
```

### 4. **Intelligent Error Recovery**
Use Claude to diagnose and fix build failures in real-time:

```typescript
const recoveryPlan = await claudeRecover(`
Build failed with error: ${buildError}
Project type: ${projectAnalysis.techStack}
Available tools: ${availableTools}

Provide specific steps to:
1. Diagnose the root cause
2. Fix the immediate issue  
3. Prevent future occurrences
4. Alternative approaches if primary fix fails
`);
```

---

## 🎯 **Proposed AI-Driven Architecture**

### Phase 1: Replace Hardcoded Detection
```typescript
interface ProjectAnalysis {
  techStack: string[];           // ['typescript', 'vite', 'react']
  buildTools: BuildTool[];       // Required vs optional tools
  buildStrategy: BuildStrategy;  // Commands, output dirs, validation
  fallbacks: FallbackStrategy;   // What to do when tools missing
}

const analysis = await AIProjectAnalyzer.analyze(projectPath, fileList);
```

### Phase 2: Dynamic Command Generation  
```typescript
interface BuildPipeline {
  preInstall: Command[];     // Package manager detection, conflict resolution
  install: Command[];        // Dependency installation with fallbacks
  validate: Command[];       // Project-specific validation (optional)
  build: Command[];          // Build execution with alternatives
  postBuild: Command[];      // Asset optimization, cleanup
}

const pipeline = await AICommandGenerator.generatePipeline(analysis);
```

### Phase 3: Intelligent Execution Engine
```typescript
class AdaptiveBuildExecutor {
  async execute(pipeline: BuildPipeline): Promise<BuildResult> {
    for (const stage of pipeline.stages) {
      const result = await this.executeStageWithFallbacks(stage);
      if (result.failed && result.critical) {
        return await this.aiRecovery(result.error, pipeline);
      }
    }
  }
  
  async aiRecovery(error: Error, context: BuildContext): Promise<BuildResult> {
    const recoveryPlan = await claudeRecover(error, context);
    return await this.executeRecoveryPlan(recoveryPlan);
  }
}
```

---

## 📋 **Implementation Roadmap**

### Week 1: Immediate Fixes (Current Hardcoded Logic)
- Make TypeScript validation optional with tool verification
- Add graceful fallbacks for missing build tools  
- Implement build command alternatives

### Week 2-3: AI Project Analysis Integration
- Replace framework detection with Claude-based project analysis
- Generate dynamic build strategies based on project structure
- Implement adaptive validation logic

### Week 4-5: Dynamic Command Pipeline
- Build AI-driven command generation system
- Replace hardcoded command sequences with generated pipelines
- Add intelligent error recovery with Claude integration

### Week 6+: Full AI-Driven Pipeline
- Complete migration from hardcoded assumptions to AI analysis
- Add support for non-Node.js projects (Go, Python, Rust, static HTML)
- Implement continuous learning from build success/failure patterns

---

## 🎯 **Success Metrics**

### Technical Metrics
- **Build Success Rate**: >95% across all project types
- **Tool Availability Detection**: 100% accuracy before execution
- **Framework Detection**: Support for 10+ different tech stacks
- **Graceful Degradation**: 0% hard failures for missing non-critical tools

### User Experience Metrics  
- **Deployment Time**: <2 minutes for 90% of projects
- **Error Recovery**: Automatic fix rate >80% for common build issues
- **Platform Flexibility**: Support projects beyond Node.js ecosystem

### Business Metrics
- **Platform Reliability**: 99.9% uptime for deployment pipeline
- **Customer Satisfaction**: Reduced support tickets for build failures
- **Developer Adoption**: Higher success rate for diverse project types

The current pipeline has significant hardcoded assumptions that make it brittle. By replacing these with AI-driven analysis and dynamic command generation, we can create a truly universal deployment platform that adapts to any project structure or technology stack.