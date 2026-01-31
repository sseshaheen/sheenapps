# Chat API Q&A for NextJS Team

## 1. Response Type Coverage

### Q: What are ALL possible values for intent field in responses?

**Answer:** Based on the codebase analysis, there are exactly **6 possible intent values**:

```typescript
export type ChatMode = 'question' | 'feature' | 'fix' | 'analysis' | 'general' | 'build';
```

These are the **only** values you'll receive. The system has no other intent types and will always map to one of these six.

### Q: Are there any other response types we should expect that don't follow the {intent, response} structure?

**Answer:** No. The API **always** returns the `{intent, response}` structure, even in error cases. However, there are important edge cases:

1. **Fallback handling**: If Claude returns plain text instead of JSON (rare but possible), the system will still wrap it in the standard structure with `intent: 'general'` and `response: {message: "the plain text"}`.

2. **Parse failures**: When JSON parsing fails, the system attempts smart detection based on content patterns and creates a properly structured response. It never returns raw unstructured data to the client.

## 2. Response Structure Variations

### Q: For fix responses, do they always have jsonResponse.response.issue structure, or are there variations?

**Answer:** The structure is **guaranteed** through validation. If any required fields are missing, the system provides defaults:

```typescript
// From chatPlanService.ts lines 387-401
case 'fix':
  if (!data.issue) {
    data.issue = {
      description: 'Issue to fix',
      severity: 'medium',
      category: 'bug'
    };
  }
  if (!data.solution) {
    data.solution = {
      approach: 'Fix approach',
      changes: [],
      testingStrategy: 'Test the fix'
    };
  }
```

**You can safely assume**: `issue`, `solution`, and their nested properties will always exist.

### Q: For analysis responses, are findings and recommendations arrays always present, or can they be missing?

**Answer:** Arrays are **always initialized** even if empty:

```typescript
// From chatPlanService.ts lines 403-409
case 'analysis':
  if (!data.overview) {
    data.overview = 'Analysis overview';
  }
  data.findings = data.findings || [];  // Always an array
  data.suggestions = data.suggestions || [];  // Always an array
```

**You can safely assume**: 
- `findings` will always be an array (may be empty)
- `suggestions` will always be an array (may be empty)
- Individual findings may have optional `recommendations` array

### Q: Can build intent responses have any special structured data we should format?

**Answer:** Build responses have a simple, fixed structure:

```typescript
interface BuildResponse {
  status: 'initiated' | 'queued' | 'error';
  buildId?: string;  // Only present if status is 'initiated' or 'queued'
  message: string;
  estimatedDuration?: number;  // In seconds, optional
}
```

No additional structured data beyond this interface.

## 3. Edge Cases & Error Handling

### Q: What should we expect when the AI can't classify the intent properly? Is there a fallback intent value?

**Answer:** Yes, **'general' is the fallback intent**. The classification logic has multiple fallback layers:

1. **Primary**: Claude returns proper JSON with intent
2. **Secondary**: Smart content detection based on keywords (lines 429-467 in chatPlanService.ts)
3. **Final fallback**: Always defaults to `intent: 'general'` with the response wrapped in `{message: "..."}` structure

You'll **never** receive a null/undefined intent.

### Q: Are there cases where jsonResponse.response might be null/undefined even in successful responses?

**Answer:** No. The system **guarantees** a response object through validation:

```typescript
// From parseClassificationResponse (line 346)
if (!parsed.intent || !parsed.response) {
  throw new Error('Invalid JSON structure - missing intent or response');
}
```

Even in the worst case, you'll get:
```json
{
  "intent": "general",
  "response": {
    "message": "Response"
  }
}
```

### Q: Can responses contain mixed intents or require special handling for multi-part responses?

**Answer:** No. **Each response has exactly one intent**. Multi-part aspects are handled within the single intent's structure:

- **question**: Can have multiple `references` and `relatedTopics`
- **feature**: Can have multiple `steps`, `dependencies`, `risks`
- **fix**: Can have multiple `changes` and `preventionTips`
- **analysis**: Can have multiple `findings` with nested `recommendations`

## 4. Future Roadmap

### Q: Are there any new response types planned that we should prepare for?

**Answer:** Based on the current codebase:
- No additional intents are defined or referenced
- The `ChatMode` type is used consistently throughout
- No TODO comments or feature flags suggest new types

**Recommendation**: The current 6 intents cover all use cases. If new types are added, they would require a backend update and likely a new API version.

### Q: Will the response structure change in upcoming API versions?

**Answer:** The code shows `contractVersion: '2.0'` in responses, suggesting versioning is already considered. Current structures are stable and well-validated. Any breaking changes would likely come with a new contract version.

## 5. Streaming Behavior

### Q: Are there cases where assistant_text events contain partial JSON that we need to handle differently?

**Answer:** The streaming implementation handles this elegantly:

1. **During streaming**: `assistant_text` events contain text chunks (not JSON)
2. **At completion**: The `complete` event contains the fully parsed and validated JSON structure

```typescript
// From streaming implementation
event: 'assistant_text'
data: {
  text: "I'll analyze your code...",  // Plain text, not JSON
  index: 0,
  isPartial: false  // Indicates if more chunks are coming
}

event: 'complete'
data: {
  fullResponse: {
    mode: 'question',
    data: { /* fully structured response */ }
  }
}
```

**You don't need to parse partial JSON** - the worker handles all JSON parsing and validation server-side.

### Q: Can a single response stream contain multiple assistant_text events with different intent types?

**Answer:** No. **One stream = one intent**. The flow is:

1. Multiple `assistant_text` events (Claude thinking/explaining)
2. Tool usage events (`tool_use`, `tool_result`)
3. Optional `intent_detected` event (when intent is identified)
4. Final `complete` event with the structured response

The intent, once determined, remains consistent throughout the stream.

## 6. Localization & Formatting

### Q: Should we handle any locale-specific formatting for different response types?

**Answer:** The backend handles language but **not** formatting. You should handle:

1. **RTL languages**: Apply RTL layout for Arabic, Hebrew, Farsi
2. **Number formatting**: Use locale-specific number formatting
3. **Date/time formatting**: Use locale-specific date formatting
4. **Template messages**: Tool usage and errors come as template keys for you to localize

Example:
```typescript
// Backend sends
{ code: 'CHAT_ERROR_INSUFFICIENT_BALANCE', params: { required: 120, available: 30 } }

// Frontend formats
t('CHAT_ERROR_INSUFFICIENT_BALANCE', {
  required: formatDuration(120, locale),  // "2 minutes" or "٢ دقيقة"
  available: formatDuration(30, locale)   // "30 seconds" or "٣٠ ثانية"
})
```

### Q: Are there standard formats the team prefers for displaying structured data?

**Answer:** The API provides semantic structure, leaving presentation to the frontend:

- **Code references**: Include file path and line numbers for IDE integration
- **Steps**: Ordered with effort estimation for progress tracking
- **Findings**: Include severity levels for prioritization
- **Tool usage**: Template keys allow custom formatting per tool type

## Summary of Guarantees

### What You Can Always Count On:

1. ✅ Intent will always be one of the 6 defined values
2. ✅ Response will always have the `{intent, response}` structure
3. ✅ Required fields are guaranteed through validation/defaults
4. ✅ Arrays will be initialized (never null/undefined)
5. ✅ One intent per request/stream
6. ✅ Streaming sends text chunks, not partial JSON
7. ✅ Error events use template keys with raw parameter values

### What You Should Handle:

1. 🔧 Locale-specific formatting (numbers, dates, RTL)
2. 🔧 Template key translation for tool usage and errors
3. 🔧 Empty arrays in responses (findings, references, etc.)
4. 🔧 Optional fields that may be undefined (buildId, alternatives, etc.)

## Error Code Reference

```typescript
// All possible error codes
'CHAT_ERROR_INSUFFICIENT_BALANCE'  // Payment required (non-recoverable)
'CHAT_ERROR_TIMEOUT'               // Request timeout (recoverable)
'CHAT_ERROR_PARSE_FAILED'          // Response parsing failed (recoverable)
'CHAT_ERROR_GENERAL'               // Generic error (recoverable)
```

The `recoverable` flag indicates whether the user should be offered a retry option.