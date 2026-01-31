# Smart Integration Suggestions: Backend Requirements

## Overview
Backend support for intelligent integration suggestions and contextual prompts (Phase 2 & 4 of Workspace Integration UX Enhancement). Enables data-driven recommendations based on user behavior and project characteristics.

## Core Concept
Track user project interactions to intelligently suggest relevant integrations at optimal moments without being intrusive. Examples:
- After 3+ significant iterations → Suggest GitHub sync
- Content-heavy project → Suggest Sanity CMS
- High satisfaction project → Suggest Vercel deployment

## Required API Endpoints

### 1. POST /api/projects/{projectId}/metrics
**Purpose**: Track user project interactions and significant events

**Request**:
```typescript
{
  event: 'iteration' | 'content_change' | 'export_attempt' | 'preview_view' | 'satisfaction_score' | 'session_start' | 'session_end';
  timestamp: string;              // ISO timestamp
  userId: string;
  metadata?: {
    changeType?: 'layout' | 'content' | 'style' | 'component';
    contentBlockCount?: number;   // Current number of content blocks
    sessionDuration?: number;     // For session_end events (ms)
    satisfactionScore?: number;   // 1-10 rating
    exportType?: 'code' | 'assets' | 'full';
    changeSignificance?: 'minor' | 'major';  // Based on change size
  };
}
```

**Response**:
```typescript
{
  success: boolean;
  metricsId?: string;             // For tracking
  currentMetrics?: {              // Optional: return current aggregated metrics
    totalIterations: number;
    contentBlocks: number;
    timeSpent: number;            // Total time spent on project (ms)
    lastActivity: string;
    exportAttempts: number;
    avgSatisfactionScore?: number;
  };
}
```

### 2. GET /api/projects/{projectId}/suggestion-context
**Purpose**: Get current project metrics for suggestion engine

**Request**:
```
GET /api/projects/{projectId}/suggestion-context?userId={userId}
```

**Response**:
```typescript
{
  projectId: string;
  userId: string;
  metrics: {
    totalIterations: number;      // Count of significant changes
    contentBlocks: number;        // Current content block count
    timeSpent: number;           // Total time spent (ms)
    sessionCount: number;        // Number of work sessions
    exportAttempts: number;      // Times user tried to export
    lastActivity: string;        // ISO timestamp
    avgSatisfactionScore?: number; // 1-10 if user has rated
    projectAge: number;          // Days since creation

    // Recent activity (last 7 days)
    recentIterations: number;
    recentSessionDuration: number;
    recentSatisfactionTrend?: 'up' | 'down' | 'stable';
  };

  // Current integration status for suggestion logic
  integrations: {
    github: { connected: boolean; lastUsed?: string };
    vercel: { connected: boolean; deployments?: number };
    sanity: { connected: boolean; documents?: number };
    supabase: { connected: boolean; queries?: number };
  };
}
```

### 3. POST /api/projects/{projectId}/suggestions/dismiss
**Purpose**: Track suggestion dismissals and user preferences

**Request**:
```typescript
{
  suggestionId: string;           // "github_after_iterations" | "vercel_high_satisfaction" etc.
  action: 'dismiss_temporary' | 'dismiss_permanent' | 'accepted';
  userId: string;
  timestamp: string;
  dismissalReason?: 'not_interested' | 'already_planned' | 'too_early' | 'other';
}
```

**Response**:
```typescript
{
  success: boolean;
  cooldownUntil?: string;         // ISO timestamp when suggestion can be shown again
}
```

### 4. GET /api/projects/{projectId}/suggestions/history
**Purpose**: Get suggestion history to avoid re-showing dismissed suggestions

**Request**:
```
GET /api/projects/{projectId}/suggestions/history?userId={userId}
```

**Response**:
```typescript
{
  projectId: string;
  dismissals: Array<{
    suggestionId: string;
    action: 'dismiss_temporary' | 'dismiss_permanent' | 'accepted';
    timestamp: string;
    cooldownUntil?: string;
  }>;
}
```

## Event Tracking Specifications

### Iteration Events
**Triggers** (frontend determines significance):
- Layout restructuring (add/remove/reorder sections)
- Content block changes (add/edit/remove content blocks)
- Major styling changes (theme changes, component swaps)
- Component additions/removals

**Not Counted as Iterations**:
- Typo fixes
- Minor text edits (< 10% content change)
- Color tweaks
- Simple spacing adjustments

### Session Tracking
- **session_start**: User opens workspace
- **session_end**: User closes/leaves workspace (track duration)
- **Minimum session**: 2 minutes to count as meaningful work

### Satisfaction Tracking
- **Trigger**: After export attempt or major milestone
- **Scale**: 1-10 rating
- **Frequency**: Max once per session, optional

## Suggestion Engine Logic (Backend)

### Suggestion Rules
```typescript
interface SuggestionRule {
  id: string;
  integration: 'github' | 'vercel' | 'sanity' | 'supabase';
  conditions: {
    minIterations?: number;
    minContentBlocks?: number;
    minTimeSpent?: number;        // milliseconds
    minSatisfactionScore?: number;
    maxDaysSinceLastSuggestion?: number;
    exportAttempted?: boolean;
    integrationNotConnected: boolean;
  };
  priority: 'high' | 'medium' | 'low';
  cooldownDays: number;           // Days before re-suggesting after dismissal
}
```

### Example Rules
```typescript
const SUGGESTION_RULES: SuggestionRule[] = [
  {
    id: 'github_after_iterations',
    integration: 'github',
    conditions: {
      minIterations: 3,
      integrationNotConnected: true
    },
    priority: 'high',
    cooldownDays: 7
  },
  {
    id: 'sanity_content_heavy',
    integration: 'sanity',
    conditions: {
      minContentBlocks: 5,
      integrationNotConnected: true
    },
    priority: 'medium',
    cooldownDays: 5
  },
  {
    id: 'vercel_high_satisfaction',
    integration: 'vercel',
    conditions: {
      minSatisfactionScore: 7,
      exportAttempted: true,
      integrationNotConnected: true
    },
    priority: 'high',
    cooldownDays: 3
  },
  {
    id: 'supabase_data_project',
    integration: 'supabase',
    conditions: {
      minIterations: 5,
      minTimeSpent: 30 * 60 * 1000, // 30 minutes
      integrationNotConnected: true
    },
    priority: 'medium',
    cooldownDays: 10
  }
];
```

## Database Schema Suggestions

### project_metrics Table
```sql
CREATE TABLE project_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  user_id UUID NOT NULL REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_project_metrics_project_user (project_id, user_id),
  INDEX idx_project_metrics_timestamp (timestamp),
  INDEX idx_project_metrics_event_type (event_type)
);
```

### suggestion_dismissals Table
```sql
CREATE TABLE suggestion_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  user_id UUID NOT NULL REFERENCES users(id),
  suggestion_id VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL, -- 'dismiss_temporary', 'dismiss_permanent', 'accepted'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cooldown_until TIMESTAMPTZ,
  dismissal_reason VARCHAR(50),

  UNIQUE(project_id, user_id, suggestion_id),
  INDEX idx_suggestion_dismissals_project_user (project_id, user_id),
  INDEX idx_suggestion_dismissals_cooldown (cooldown_until)
);
```

## Performance Requirements

### Response Times
- Metrics tracking: < 100ms (fire-and-forget)
- Suggestion context: < 300ms
- Suggestion history: < 200ms

### Data Retention
- Raw metrics: 90 days (for analysis)
- Aggregated metrics: Indefinite
- Dismissal history: 1 year

### Rate Limiting
- Metrics endpoint: 100 requests/minute per user
- Context/history: 20 requests/minute per user

## Privacy & Security

### Data Protection
- All metrics tied to user/project access permissions
- Metrics only accessible by project owners/collaborators
- No cross-user data leakage
- Option to disable tracking per user preference

### Data Minimization
- Only track necessary events for suggestions
- Aggregate raw metrics periodically
- Purge detailed interaction data after retention period

## Implementation Notes

### Backend Integration Points
- **Project System**: Requires project access validation
- **User Management**: User permissions and preferences
- **Integration Status**: Current integration connection state
- **Analytics Pipeline**: Optional integration with existing analytics

### Caching Strategy
- Cache aggregated metrics for 5 minutes
- Cache suggestion rules (rarely change)
- Cache dismissal state for 1 hour

### Migration Path
- Phase 1: Basic metrics tracking (iterations, time)
- Phase 2: Advanced context (satisfaction, content analysis)
- Phase 3: ML-enhanced suggestion timing

## Success Metrics

Track effectiveness of suggestion system:
- **Acceptance Rate**: % of suggestions that lead to integration connection
- **Dismissal Patterns**: Which suggestions are most often dismissed
- **Timing Accuracy**: Time between suggestion and user action
- **User Satisfaction**: Impact on overall workspace experience

This backend foundation will enable intelligent, non-intrusive integration suggestions that genuinely help users discover relevant capabilities at optimal moments.