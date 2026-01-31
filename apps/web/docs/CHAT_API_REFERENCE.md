
## 💬 **Chat Plan Mode API**

### Overview
Chat Plan Mode provides a conversational interface with **AI-powered intent classification**. Simply send a message and the AI automatically determines the appropriate response type (question, feature, fix, analysis, etc.). No need to specify chat mode or manage session state - everything is handled backend-side.

### 🚀 Simplified v1 API Changes

| What Changed | Old (Never Released) | New (Production v1) |
|--------------|---------------------|--------------------|
| **Intent Classification** | Frontend specifies `chatMode` | AI auto-detects from message |
| **Session Management** | Frontend passes `sessionId` | Backend uses `projects.last_ai_session_id` |
| **Version/Build Context** | Frontend provides `versionId`/`buildId` | Backend fetches from projects table |
| **Request Complexity** | 7-9 fields required | Only 3-4 fields needed |
| **Response Mode** | Predetermined by request | AI-determined, shown in response |

### Key Features
- 🤖 **AI Auto-Detection**: AI classifies intent from natural language
- 🔄 **Automatic Session Continuity**: Backend manages sessionId via projects table
- 🌍 **Multi-language Support**: Full i18n with locale-aware responses
- 📡 **SSE Streaming**: Real-time response updates
- 🔨 **Build Conversion**: Transform plans into executable builds
- 📊 **Unified Timeline**: All interactions in one chronological view

### 1. Process Chat Plan Request (Simplified)

**Endpoint**: `POST /v1/chat-plan`

Send a message to the AI assistant. The AI automatically determines intent and responds appropriately.

#### Request
```typescript
interface SimplifiedChatPlanRequest {
  userId: string;
  projectId: string;
  message: string;
  locale?: string;         // e.g., 'en-US', 'ar-EG', 'fr-FR'
  context?: {              // Optional additional context
    includeVersionHistory?: boolean;
    includeProjectStructure?: boolean;
    includeBuildErrors?: boolean;
  };
}
// Note: No chatMode, sessionId, versionId, or buildId needed!
// Backend automatically:
// - Determines intent via AI classification
// - Uses last_ai_session_id from projects table
// - Fetches versionId/buildId from projects table
```

#### Response (Standard JSON)
```typescript
interface ChatPlanResponse {
  type: 'chat_response';
  subtype: 'success' | 'error' | 'partial';
  sessionId: string;        // For reference only - frontend doesn't manage
  messageId: string;
  timestamp: string;
  mode: ChatMode;           // AI-determined: 'question' | 'feature' | 'fix' | 'analysis' | 'build' | 'general'
  data: QuestionResponse | FeaturePlanResponse | FixPlanResponse | AnalysisResponse | GeneralResponse;
  metadata: {
    duration_ms: number;
    tokens_used: number;
    cache_hits?: number;
    projectContext: {
      versionId?: string;
      buildId?: string;
      lastModified: string;
    };
  };
  availableActions?: Array<{
    type: 'convert_to_build' | 'save_plan' | 'share' | 'export';
    label: string;
    payload?: any;
  }>;
}
```

#### AI Intent Classification

The AI automatically detects intent from message patterns:
- **Questions**: "How do I...", "What is...", "Where is..."
- **Features**: "Add...", "Implement...", "Create..."
- **Fixes**: "Fix...", "Not working", "Error when..."
- **Analysis**: "Analyze...", "Review...", "Check..."
- **Build**: "Build this", "Execute", "Deploy"
- **General**: Everything else

#### Response Types by Mode

**Question Mode**:
```typescript
interface QuestionResponse {
  answer: string;
  references?: Array<{
    file: string;
    line: number;
    snippet: string;
  }>;
  relatedTopics?: string[];
}
```

**Feature Mode**:
```typescript
interface FeaturePlanResponse {
  summary: string;
  feasibility: 'simple' | 'moderate' | 'complex';
  plan: {
    overview: string;
    steps: Array<{
      order: number;
      title: string;
      description: string;
      files: string[];
      estimatedEffort: 'low' | 'medium' | 'high';
    }>;
    dependencies: Array<{
      name: string;
      version?: string;
      reason: string;
    }>;
    risks: string[];
    alternatives?: string[];
  };
  buildPrompt?: string;  // Pre-generated prompt for conversion to build
}
```

**Fix Mode**:
```typescript
interface FixPlanResponse {
  issue: {
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
  };
  rootCause: string;
  solution: {
    approach: string;
    changes: Array<{
      file: string;
      changeType: 'modify' | 'create' | 'delete';
      description: string;
    }>;
    testingStrategy: string;
  };
  preventionTips?: string[];
  buildPrompt?: string;
}
```

#### SSE Streaming Support
For real-time updates, add `Accept: text/event-stream` header:

```typescript
function streamChat(projectId: string, message: string, onUpdate: (data: any) => void) {
  const eventSource = new EventSource('/v1/chat-plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',  // Enable SSE
      'x-sheen-signature': generateHMACv1(body, timestamp, WORKER_SHARED_SECRET),
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': crypto.randomBytes(16).toString('hex')
    },
    body: JSON.stringify({
      userId: currentUser.id,
      projectId,
      message,  // AI determines intent
      locale: currentUser.locale
    })
  });

  eventSource.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    onUpdate(data);

    // Log AI-detected mode when available
    if (data.mode) {
      console.log('AI detected intent:', data.mode);
    }
  });

  eventSource.addEventListener('complete', () => {
    eventSource.close();
  });

  eventSource.addEventListener('error', (error) => {
    console.error('SSE error:', error);
    eventSource.close();
  });

  return eventSource;
}
```

### 2. Convert Plan to Build

**Endpoint**: `POST /v1/chat-plan/convert-to-build`

Convert a chat plan session into an actual build request.

#### Request
```typescript
interface ConvertToBuildRequest {
  sessionId: string;
  planData: any;      // The structured plan from chat response
  userId: string;
  projectId: string;
}
```

#### Response
```typescript
interface ConvertToBuildResponse {
  buildId: string;
  status: 'queued' | 'started';
}
```

### 3. Get Project Timeline

**Endpoint**: `GET /v1/project/:projectId/timeline`

Retrieve unified timeline of chat messages, builds, and deployments.

#### Query Parameters
- `limit`: Number of items (1-100, default 50)
- `offset`: Pagination offset (default 0)
- `mode`: Filter by mode ('all' | 'plan' | 'build', default 'all')
- `includeHidden`: Include hidden messages (default false)

#### Response
```typescript
interface TimelineResponse {
  items: Array<{
    id: string;
    project_id: string;
    user_id: string;
    created_at: string;
    timeline_seq: number;
    mode: 'plan' | 'build';
    chat_mode?: string;
    message_text: string;
    message_type: 'user' | 'assistant' | 'system' | 'error' | 'build_reference';
    response_data?: any;
    build_id?: string;
    version_id?: string;
    session_id?: string;
    locale?: string;
    language?: string;
    preview_url?: string;
    version_status?: string;
    artifact_url?: string;
    build_status?: string;
    build_duration?: number;
    timeline_status: 'deployed' | 'failed' | 'in_progress' | 'planning' | 'unknown';
  }>;
  hasMore: boolean;
  total: number;
  limit: number;
  offset: number;
}
```

### 4. Get Session Details (DISABLED)

**Endpoint**: `GET /v1/chat-plan/session/:sessionId` ⚠️ **Currently disabled for security**

Retrieve details about a specific chat plan session.

**Note**: This endpoint is currently commented out as it exposes sensitive session data. It should only be available to admin users when re-enabled.

#### Response
```typescript
interface SessionDetailsResponse {
  session: {
    id: string;
    user_id: string;
    project_id: string;
    session_id: string;
    created_at: string;
    last_active: string;
    message_count: number;
    total_tokens_used: number;
    total_ai_seconds_consumed: number;
    total_cost_usd: number;
    status: 'active' | 'converted' | 'expired' | 'archived';
    converted_to_build_id?: string;
    conversion_prompt?: string;
    metadata: any;
  };
  messages: Array<{
    // Same structure as timeline items
  }>;
}
```

### Frontend Integration Examples

#### Simple Message (AI Determines Intent)
```typescript
async function sendMessage(projectId: string, message: string) {
  const request: SimplifiedChatPlanRequest = {
    userId: currentUser.id,
    projectId,
    message,  // Just send the message - AI figures out the rest!
    locale: currentUser.locale
  };

  const response = await callWorkerAPI('/v1/chat-plan', 'POST', request);

  // Check what the AI determined
  console.log('AI detected mode:', response.mode);

  // Handle response based on mode
  switch (response.mode) {
    case 'question':
      showAnswer(response.data.answer, response.data.references);
      break;
    case 'feature':
      showFeaturePlan(response.data.plan);
      break;
    case 'fix':
      showFixProposal(response.data.solution);
      break;
    // ... etc
  }
}
```

#### Continuous Conversation
```typescript
async function continueConversation(projectId: string, followUp: string) {
  // No need to pass sessionId - backend uses last_ai_session_id from projects table!
  const response = await callWorkerAPI('/v1/chat-plan', 'POST', {
    userId: currentUser.id,
    projectId,
    message: followUp,
    locale: currentUser.locale
  });

  // Session continuity is automatic
  return response;
}
```

#### Feature Planning with Conversion
```typescript
async function sendFeatureRequest(projectId: string, description: string) {
  // 1. Send the message (AI will detect it's a feature request)
  const planResponse = await callWorkerAPI('/v1/chat-plan', 'POST', {
    userId: currentUser.id,
    projectId,
    message: description,  // e.g., "Add a dark mode toggle to settings"
    locale: currentUser.locale
  });

  // 2. Verify AI detected it as a feature
  if (planResponse.mode === 'feature') {
    const userApproved = await showFeaturePlan(planResponse.data.plan);

    if (userApproved) {
      // 3. Convert to build
      const buildResponse = await callWorkerAPI('/v1/chat-plan/convert-to-build', 'POST', {
      sessionId: planResponse.sessionId,
      planData: planResponse.data,
      userId: currentUser.id,
      projectId
    });

    // 4. Navigate to build progress
    router.push(`/project/${projectId}/build/${buildResponse.buildId}`);
  }
}
```

#### Timeline Component
```typescript
function ProjectTimeline({ projectId }: { projectId: string }) {
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState<'all' | 'plan' | 'build'>('all');

  useEffect(() => {
    async function loadTimeline() {
      const response = await callWorkerAPI(
        `/v1/project/${projectId}/timeline?mode=${mode}&limit=50`,
        'GET'
      );
      setItems(response.items);
    }
    loadTimeline();
  }, [projectId, mode]);

  return (
    <div className="timeline">
      {items.map(item => (
        <TimelineItem key={item.id} item={item} />
      ))}
    </div>
  );
}
```

### i18n Template Support

Assistant responses use template keys for consistent internationalization:

```typescript
// Frontend i18n bundle (messages/en.json)
{
  "chat": {
    "templates": {
      "initial_build_greeting": "I'll help you build {business_idea_summary}\!",
      "plan_thinking": "Analyzing your request...",
      "plan_suggestion": "Based on your codebase, I suggest {suggestion}",
      "question_response": "Here's what I found: {answer}",
      "feature_response": "I've created a plan for your feature: {summary}"
    }
  }
}

// Render template
function renderMessage(item: TimelineItem) {
  if (item.response_data?.template) {
    const template = t(`chat.templates.${item.response_data.template}`);
    return interpolate(template, item.response_data.variables);
  }
  return item.message_text;
}
```

### Billing & Rate Limits

#### AI Time Consumption by Auto-Detected Mode
- **Question**: ~30 seconds AI time
- **Feature**: ~120 seconds AI time
- **Fix**: ~90 seconds AI time
- **Analysis**: ~180 seconds AI time
- **Build**: ~150 seconds AI time
- **General**: ~30 seconds AI time

#### Rate Limits
- Per user: 100 requests/hour
- Per project: 200 requests/hour
- Per session: 50 messages max, 100k tokens max

### Error Handling

```typescript
try {
  const response = await callWorkerAPI('/v1/chat-plan', 'POST', request);
  // Handle success
} catch (error) {
  if (error.message === 'INSUFFICIENT_BALANCE') {
    // Show billing prompt
    showBillingPrompt();
  } else if (error.message === 'SESSION_EXPIRED') {
    // Start new session
    startNewSession();
  } else {
    // Generic error
    showError(error.message);
  }
}
```

### Best Practices

1. **No State Management**: Don't store sessionId/versionId/buildId - backend handles everything
2. **Trust AI Classification**: Let AI determine intent from natural language
3. **Locale Support**: Always pass user's locale for proper i18n
4. **Streaming**: Use SSE for long-running analysis/feature planning
5. **Show AI Mode**: Display detected mode to users for transparency
6. **Conversion Flow**: Show plan details before converting to build
7. **Timeline Pagination**: Implement infinite scroll with offset/limit
8. **Error Recovery**: Handle balance/rate limit errors gracefully
9. **Billing Awareness**: Show estimates based on AI-detected mode
