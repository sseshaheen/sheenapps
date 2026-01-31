# Metrics System Improvements Plan

## Overview
This plan addresses improvements to the metrics tracking system based on analysis of the test run from 2025-07-25.

## 1. Database Schema Changes

### 1.1 project_ai_session_metrics
- **Add column**: `session_duration_min` (DECIMAL(10,2)) - computed from session_duration_ms

### 1.2 project_build_metrics  
- **Add column**: `total_duration_min` (DECIMAL(10,2)) - computed from total_duration_ms

### 1.3 project_metrics_summary
- **Rename column**: `date` → `project_started` (TIMESTAMP WITH TIME ZONE)
- **Add column**: `project_last_updated` (TIMESTAMP WITH TIME ZONE)
- **Rename column**: `avg_claude_duration_sec` → `avg_ai_duration_sec`
- **Add columns**: 
  - `total_duration_sec` (DECIMAL(10,2))
  - `total_duration_min` (DECIMAL(10,2))

## 2. Data Collection Fixes

### 2.1 Empty Columns in project_ai_session_metrics
**Currently empty**: files_created, files_modified, tool_calls_total, tool_calls_by_type, etc.

**Resource Impact Assessment**:
- ✅ **Low impact**: These values are already being tracked in `claudeSession.ts` but not passed to metrics
- ✅ **Easy fix**: Just need to pass the collected data to the metrics service

**Action**: Fix data passing from claudeSession to metricsService

### 2.2 Package Manager Detection
**Issue**: Shows 'pnpm' but project uses npm (has package-lock.json)

**Resource Impact**: ✅ Low - Just fixing detection logic

**Action**: Fix detectPackageManager() to check for lock files properly

### 2.3 Framework Detection
**Issue**: Shows 'react' but should be 'vite' or 'react+vite'

**Resource Impact**: ✅ Low - Already detecting, just need better classification

**Action**: Improve framework detection to recognize Vite projects

### 2.4 Empty Columns in project_deployment_metrics
**Currently empty**:
- `install_started_at`, `install_completed_at`, `install_strategy` - These should be populated
- `dependencies_count`, `dev_dependencies_count` - Would require parsing package.json
- `build_output_size_bytes`, `deployment_size_bytes`, `files_uploaded` - Would require additional file system operations

**Resource Impact Assessment**:
- ✅ **Low impact**: install timestamps and strategy (already tracking, just not recording)
- ⚠️ **Medium impact**: dependencies count (requires parsing package.json)
- ❌ **High impact**: file sizes and counts (requires directory traversal and size calculations)

**Action**: 
- Fix install timestamps and strategy recording
- Add dependency counting (acceptable overhead)
- Skip file size calculations for now (too expensive)

## 3. Implementation Priority

### Phase 1: Database Schema Changes (Low Risk) ✅ COMPLETED
1. ✅ Create migration to add computed columns (session_duration_min, total_duration_min)
2. ✅ Create migration to restructure project_metrics_summary
3. Update the summary function to handle new columns

### Phase 2: Fix Data Collection (Medium Risk) ✅ COMPLETED
1. ✅ Fix package manager detection (fixed hardcoded 'pnpm' in streamWorker.ts)
2. ✅ Fix framework detection (enhanced to detect vite+react combinations)
3. ✅ Fix MultiEdit file tracking (now correctly detects file creation vs modification)
4. ✅ Pass claudeSession metrics to metricsService (filesCreated, filesModified, toolCallsTotal, etc.)
5. Record install phase timestamps (already working in deployWorker.ts)

### Phase 3: Add New Data Collection (Low Priority)
1. Count dependencies from package.json
2. Consider adding file size tracking in future if needed

## 4. Specific Fixes

### 4.1 Package Manager Detection Fix
The issue is in deployWorker.ts - it's defaulting to 'pnpm' in streamWorker but the detection logic needs fixing:

```typescript
// Current logic has issues with path resolution
// Fix: Check lock files in the project directory
const detectPackageManager = (projectPath: string): 'npm' | 'pnpm' | 'yarn' => {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) return 'npm';
  return 'npm'; // default instead of pnpm
};
```

### 4.2 Framework Detection Enhancement
```typescript
// Check for Vite config
if (fs.existsSync('vite.config.ts') || fs.existsSync('vite.config.js')) {
  // Check if it's a React+Vite project
  const hasReact = packageJson.dependencies?.react;
  return hasReact ? 'react+vite' : 'vite';
}
```

### 4.3 ClaudeSession Metrics Collection
Currently tracking but not passing:
- filesCreated
- filesModified  
- Tool usage counts
- Error counts

Need to include these in the metrics passed to metricsService.recordClaudeSession()

## 5. Resource Impact Summary

### ✅ Low Impact (Implement Now)
- Adding computed columns (calculations done in DB)
- Fixing package manager detection
- Fixing framework detection
- Passing already-collected metrics
- Recording install timestamps

### ⚠️ Medium Impact (Implement with Care)
- Counting dependencies from package.json

### ❌ High Impact (Skip for Now)
- Calculating directory sizes
- Counting uploaded files
- Tracking individual file sizes

## 6. Implementation Summary ✅ COMPLETED

### Code Changes Made:
1. **Database Migrations Created**:
   - `migrations/010_add_duration_columns.sql` - Adds computed duration columns in minutes
   - `migrations/011_restructure_metrics_summary.sql` - Restructures project_metrics_summary table

2. **MultiEdit File Tracking Fixed** (`src/stream/claudeSession.ts`):
   - Now detects file creation when `old_string === ""`
   - Shows "Creating" vs "Updating" correctly in progress messages
   - Properly tracks filesCreated vs filesModified

3. **Package Manager Detection Fixed** (`src/workers/streamWorker.ts`):
   - Removed hardcoded 'pnpm' value
   - Added proper detectPackageManager() function
   - Now correctly detects npm/yarn/pnpm based on lock files

4. **Framework Detection Enhanced** (`src/workers/deployWorker.ts`):
   - Now detects Vite+React as 'react+vite' instead of just 'react'
   - Checks both package.json dependencies and vite.config files
   - Properly prioritizes framework combinations

5. **Claude Session Metrics Passing** (`src/stream/claudeSession.ts` + `src/workers/streamWorker.ts`):
   - Enhanced SessionResult interface with activity metrics
   - Now tracks and passes filesCreated, filesModified, toolCallsTotal, errorsEncountered, errorsFixed
   - Empty columns in project_ai_session_metrics will now be populated

### Migration Execution ✅ COMPLETED

1. **Migrations Successfully Applied**:
   - ✅ 010_add_duration_columns.sql - Added computed duration columns in minutes
   - ✅ 011_restructure_metrics_summary.sql - Restructured project_metrics_summary table

2. **Next Steps**:
   - Test with new builds to verify all metrics are collected properly
   - Verify that empty columns are now populated with correct data
   - Confirm package manager shows 'npm' instead of 'pnpm' for npm projects
   - Confirm framework shows 'react+vite' instead of just 'react' for Vite+React projects

## 7. Rollback Plan

If issues arise:
1. Revert code changes
2. Keep database changes (they're backward compatible)
3. Fix issues and redeploy