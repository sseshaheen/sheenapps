# Project Name Suggestion Feature - Analysis & Implementation Plan

## Current State Analysis

### Problem
- New projects get "Untitled Project" as their default name
- Users have to manually rename projects later
- AI has context about the project during initial build but doesn't suggest a name

### Current Flow
1. Project creation in `database.ts` (line 498) and `createPreview.ts` (line 481)
   - Default: `name = 'Untitled Project'`
2. Initial build detection via `isInitialBuild` flag
3. Recommendations generated with project info but no name suggestion

## Proposed Solution

### Add `suggestedProjectName` to recommendations.json

**Location**: `project_info.suggestedProjectName`

**When**: Only on initial builds (`isInitialBuild === true`)

**Format**:
```json
{
  "project_info": {
    "type": "web_app",
    "framework": "react",
    "version": "1.0.0",
    "suggestedProjectName": "Task Tracker Pro",  // NEW - only on initial build
    "version_description": "Initial project setup",
    "change_type": "major",
    "breaking_risk": "none"
  }
}
```

## Implementation Plan

### Step 1: Update Schema & Types

**File**: `src/services/recommendationsPrompt.ts`

1. Update Zod schema to include optional `suggestedProjectName`
2. Update TypeScript types
3. Update JSON example generation

### Step 2: Modify Prompt Generation

**File**: `src/services/recommendationsPrompt.ts`

1. Add conditional logic in `buildRecommendationsPrompt()`
2. Include project name suggestion instruction for initial builds only
3. Add validation rules for project names (e.g., 2-4 words, descriptive)

### Step 3: Process Suggested Name

**File**: `src/workers/streamWorker.ts`

1. Extract `suggestedProjectName` from recommendations
2. Update project name in database (only if still "Untitled Project")
3. Log the name suggestion

### Step 4: Update Project Name

**Options**:

#### Option A: Automatic Update (Recommended)
- If project name is still "Untitled Project", automatically apply suggestion
- Pros: Seamless UX, immediate value
- Cons: User might not notice the change

#### Option B: Store for User Confirmation
- Store suggestion, let frontend prompt user
- Pros: User control, explicit consent
- Cons: Extra step, might be ignored

#### Option C: Conditional Auto-Update
- Auto-update only if suggestion confidence is high
- Include name quality check (not generic, meaningful)

## Benefits

1. **Better UX**: Projects get meaningful names immediately
2. **Context-Aware**: AI understands project purpose from initial prompt
3. **Time-Saving**: No manual renaming needed
4. **Discoverable**: Easier to identify projects in lists

## Example Names AI Might Suggest

Based on prompt context:
- "Create a todo app" → "Task Manager Pro"
- "Build an e-commerce site" → "Shop Hub"
- "Make a blog platform" → "Content Studio"
- "Create a dashboard" → "Analytics Dashboard"

## Edge Cases to Handle

1. **Name Already Changed**: Don't overwrite if user already renamed
2. **Generic Suggestions**: Validate name isn't too generic ("My App", "Website")
3. **Length Limits**: Ensure name fits database constraints
4. **Special Characters**: Sanitize for security/compatibility
5. **Uniqueness**: Consider adding suffix if name exists

## Implementation Priority

1. **Phase 1**: Basic implementation
   - Add field to schema
   - Generate suggestion on initial build
   - Log suggestion (don't apply yet)

2. **Phase 2**: Auto-update
   - Update project name if still "Untitled Project"
   - Add safeguards and validation

3. **Phase 3**: Enhancement
   - Quality scoring for suggestions
   - User preferences/patterns learning
   - Frontend integration for confirmation

## Success Metrics

- % of projects with meaningful names vs "Untitled Project"
- User satisfaction with suggested names
- Reduction in manual renames
- Time saved in project management

## Implementation Status

### ✅ Completed (2025-08-13)

1. **Schema Changes** (`src/services/recommendationsPrompt.ts`)
   - Added `suggestedProjectName` as optional field in Zod schema
   - Updated TypeScript types

2. **Prompt Generation** (`src/services/recommendationsPrompt.ts`)
   - Added conditional suggestedProjectName in JSON example for initial builds
   - Added instruction in rules for project name suggestion

3. **Processing Logic** (`src/workers/streamWorker.ts`)
   - Extracts `suggestedProjectName` from recommendations
   - Updates project name in database if still "Untitled Project"
   - Added in both main flow and fallback flow
   - Safe: Only updates if initial build AND name is still default

4. **Database Update**
   - Uses SQL UPDATE with WHERE clause to ensure only default names are changed
   - Returns updated name for confirmation
   - Handles errors gracefully without failing build

## How It Works

1. **Initial Build Detection**: `isInitialBuild` flag determines if this is a new project
2. **AI Suggestion**: Claude suggests a name based on project context
3. **Automatic Update**: Name is updated from "Untitled Project" to suggested name
4. **Safety Check**: Only updates if name hasn't been manually changed

## Example Flow

```
User: "Create a todo app with authentication"
AI Creates: Todo app project
AI Suggests: "Task Manager Pro" 
Database: Updates from "Untitled Project" → "Task Manager Pro"
Result: User sees meaningful project name immediately
```

## Next Steps

1. ✅ Analysis complete
2. ✅ Implement schema changes
3. ✅ Update prompt generation
4. ✅ Add name processing logic
5. ⏳ Test with various project types
6. ⏳ Monitor suggestion quality
7. ⏳ Consider user preferences for naming patterns