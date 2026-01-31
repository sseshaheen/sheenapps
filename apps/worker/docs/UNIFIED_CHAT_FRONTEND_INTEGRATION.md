# Unified Chat Frontend Integration Guide

## Overview

The new Unified Chat API provides a seamless experience between Plan Mode (analysis only) and Build Mode (immediate execution) through a simple toggle interface. This eliminates the need for users to find and click a separate "Plan Mode" button.

## Key Benefits

- **Better Discoverability**: Toggle is always visible in the chat interface
- **Seamless Switching**: Users can switch modes without losing context
- **Persistent Preferences**: User's mode preference is saved per project
- **Unified Experience**: Single chat interface for both planning and building

## API Endpoints

### 1. Main Chat Endpoint

**POST** `/v1/chat/unified`

Send a message that will either trigger a build or return a plan based on the toggle state.

#### Request
```typescript
{
  userId: string;
  projectId: string;
  message: string;
  buildImmediately?: boolean;  // Optional - uses saved preference if not provided
  locale?: string;              // e.g., "en-US", "ar-EG"
  sessionContext?: {
    previousMode?: 'plan' | 'build';
    sessionId?: string;
  }
}
```

#### Response (Plan Mode)
```typescript
{
  success: true,
  mode: 'plan',
  sessionId: 'session_123',
  messageId: 'msg_456',
  timestamp: '2025-08-15T10:30:00Z',
  
  analysis: {
    intent: 'feature',  // or 'question', 'fix', 'analysis', 'general'
    response: {
      // Structured response based on intent
      summary: 'Add dark mode toggle',
      feasibility: 'moderate',
      plan: { ... }
    },
    canBuild: true,
    buildPrompt: 'Implement dark mode toggle with...'
  },
  
  actions: [
    {
      type: 'build_now',
      label: 'Build This Now',
      enabled: true,
      payload: { prompt: '...', planSessionId: '...' }
    },
    {
      type: 'switch_mode',
      label: 'Enable Auto-Build',
      enabled: true
    }
  ],
  
  preferences: {
    buildImmediately: false
  }
}
```

#### Response (Build Mode)
```typescript
{
  success: true,
  mode: 'build',
  sessionId: 'session_123',
  messageId: 'msg_456',
  timestamp: '2025-08-15T10:30:00Z',
  
  build: {
    buildId: 'build_789',
    versionId: 'version_012',
    status: 'queued',
    estimatedTime: 120,  // seconds
    message: 'Build has been queued and will start shortly'
  },
  
  actions: [
    {
      type: 'cancel_build',
      label: 'Cancel Build',
      enabled: true,
      payload: { buildId: 'build_789' }
    }
  ],
  
  preferences: {
    buildImmediately: true
  }
}
```

### 2. Get Chat Preferences

**GET** `/v1/projects/:projectId/chat-preferences`

Get the current chat mode preference for a project.

#### Response
```typescript
{
  success: true,
  preferences: {
    buildImmediately: true  // or false
  }
}
```

### 3. Update Chat Preferences

**PUT** `/v1/projects/:projectId/chat-preferences`

Update the chat mode preference for a project.

#### Request
```typescript
{
  buildImmediately: boolean
}
```

#### Response
```typescript
{
  success: true,
  message: 'Preferences updated successfully',
  preferences: {
    buildImmediately: false
  }
}
```

### 4. Convert Plan to Build

**POST** `/v1/chat/convert-to-build`

Convert a plan from chat into an actual build.

#### Request
```typescript
{
  projectId: string;
  userId: string;
  planSessionId: string;
  buildPrompt: string;
}
```

#### Response
```typescript
{
  success: true,
  buildId: 'build_123',
  versionId: 'version_456',
  status: 'queued',
  message: 'Build initiated from plan'
}
```

## Frontend Implementation Guide

### 1. UI Components Needed

#### Toggle Component
```jsx
function BuildModeToggle({ projectId, onChange }) {
  const [buildImmediately, setBuildImmediately] = useState(true);
  
  useEffect(() => {
    // Load saved preference on mount
    fetchChatPreferences(projectId).then(prefs => {
      setBuildImmediately(prefs.buildImmediately);
    });
  }, [projectId]);
  
  const handleToggle = async (newValue) => {
    setBuildImmediately(newValue);
    await updateChatPreferences(projectId, { buildImmediately: newValue });
    onChange?.(newValue);
  };
  
  return (
    <div className="build-mode-toggle">
      <label className="toggle-container">
        <input
          type="checkbox"
          checked={buildImmediately}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        <span className="toggle-slider"></span>
        <span className="toggle-label">
          {buildImmediately ? '🚀 Build Immediately' : '📋 Plan Mode'}
        </span>
      </label>
      <p className="toggle-description">
        {buildImmediately 
          ? 'Messages will trigger builds automatically'
          : 'Messages will generate plans without building'}
      </p>
    </div>
  );
}
```

#### Chat Interface
```jsx
function UnifiedChat({ projectId, userId }) {
  const [messages, setMessages] = useState([]);
  const [buildMode, setBuildMode] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  
  const sendMessage = async (message) => {
    // Add user message to UI
    setMessages(prev => [...prev, { type: 'user', text: message }]);
    
    // Send to unified API
    const response = await fetch('/v1/chat/unified', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HMAC-Signature': generateHmacSignature(...)
      },
      body: JSON.stringify({
        userId,
        projectId,
        message,
        buildImmediately: buildMode
      })
    });
    
    const data = await response.json();
    
    if (data.mode === 'build') {
      setIsBuilding(true);
      // Show build progress UI
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: data.build.message,
        buildId: data.build.buildId
      }]);
    } else {
      // Show plan/analysis
      setMessages(prev => [...prev, {
        type: 'assistant',
        analysis: data.analysis,
        actions: data.actions
      }]);
    }
  };
  
  const handleBuildFromPlan = async (action) => {
    const response = await fetch('/v1/chat/convert-to-build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HMAC-Signature': generateHmacSignature(...)
      },
      body: JSON.stringify({
        projectId,
        userId,
        planSessionId: action.payload.planSessionId,
        buildPrompt: action.payload.prompt
      })
    });
    
    const data = await response.json();
    if (data.success) {
      setIsBuilding(true);
      // Show build progress
    }
  };
  
  return (
    <div className="unified-chat">
      <div className="chat-header">
        <BuildModeToggle 
          projectId={projectId}
          onChange={setBuildMode}
        />
      </div>
      
      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <ChatMessage 
            key={idx} 
            message={msg}
            onAction={handleBuildFromPlan}
          />
        ))}
      </div>
      
      <ChatInput 
        onSend={sendMessage}
        disabled={isBuilding}
        placeholder={
          isBuilding 
            ? 'Build in progress...'
            : buildMode 
              ? 'Describe what you want to build...'
              : 'Ask a question or describe a feature...'
        }
      />
    </div>
  );
}
```

### 2. Styling Suggestions

```css
/* Toggle Component Styling */
.build-mode-toggle {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  margin-bottom: 16px;
}

.toggle-container {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.toggle-slider {
  position: relative;
  width: 48px;
  height: 24px;
  background-color: #ccc;
  border-radius: 24px;
  margin-right: 12px;
  transition: background-color 0.3s;
}

.toggle-container input:checked + .toggle-slider {
  background-color: #4CAF50;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 2px;
  top: 2px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

.toggle-container input:checked + .toggle-slider::after {
  transform: translateX(24px);
}

.toggle-label {
  font-weight: 600;
  font-size: 14px;
}

.toggle-description {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* Mode Indicator */
.chat-mode-indicator {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.chat-mode-indicator.build-mode {
  background: rgba(76, 175, 80, 0.1);
  color: #4CAF50;
}

.chat-mode-indicator.plan-mode {
  background: rgba(33, 150, 243, 0.1);
  color: #2196F3;
}
```

### 3. State Management

```typescript
// Redux/Zustand store example
interface ChatState {
  buildImmediately: boolean;
  sessionId: string | null;
  messages: Message[];
  isBuilding: boolean;
  
  // Actions
  setBuildMode: (enabled: boolean) => void;
  sendMessage: (message: string) => void;
  convertPlanToBuild: (planData: any) => void;
}

// Persistence
const useChatPreferences = (projectId: string) => {
  const [preferences, setPreferences] = useState<ChatPreferences>({
    buildImmediately: true
  });
  
  useEffect(() => {
    // Load from API
    fetchChatPreferences(projectId).then(setPreferences);
  }, [projectId]);
  
  const updatePreference = async (key: string, value: any) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    await updateChatPreferences(projectId, { [key]: value });
  };
  
  return { preferences, updatePreference };
};
```

### 4. Migration from Existing Implementation

#### Step 1: Add Toggle UI
- Add the toggle component to your existing chat interface
- Position it prominently (e.g., in the chat header)

#### Step 2: Update API Calls
```typescript
// Old approach (separate endpoints)
if (isPlanMode) {
  await fetch('/v1/chat-plan', ...);
} else {
  await fetch('/v1/update-project', ...);
}

// New approach (unified endpoint)
await fetch('/v1/chat/unified', {
  body: JSON.stringify({
    ...payload,
    buildImmediately: userPreference
  })
});
```

#### Step 3: Handle Responses
- Check `response.mode` to determine if it was a plan or build
- Show appropriate UI based on the mode
- Display available actions for user interaction

#### Step 4: Add Visual Feedback
- Clear indication of current mode
- Smooth transitions when switching modes
- Loading states during mode changes

### 5. Best Practices

1. **Persist User Preference**: Always save the user's mode preference
2. **Visual Clarity**: Make the current mode obvious with icons/colors
3. **Smooth Transitions**: Animate mode switches for better UX
4. **Disable During Builds**: Prevent mode switching while a build is running
5. **Action Feedback**: Show clear feedback when converting plans to builds
6. **Error Handling**: Gracefully handle API errors with fallback to plan mode

### 6. Testing Checklist

- [ ] Toggle switches modes correctly
- [ ] Preference persists across sessions
- [ ] Messages sent in build mode trigger builds
- [ ] Messages sent in plan mode return analysis
- [ ] "Build Now" button converts plans successfully
- [ ] Mode indicator updates correctly
- [ ] Chat remains responsive during builds
- [ ] Error states handled gracefully
- [ ] SSE streaming works in both modes
- [ ] Backward compatibility maintained

## Support

For questions or issues with the Unified Chat API integration, please contact the backend team or refer to the API documentation in `/docs/API_REFERENCE_FOR_NEXTJS.md`.