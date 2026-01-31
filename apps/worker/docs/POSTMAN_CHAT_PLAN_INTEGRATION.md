# Postman Collection Update Instructions for Chat Plan Mode

## How to Add Chat Plan Endpoints to Existing Collection

### Method 1: Import as Sub-Collection (Recommended)

1. **In Postman:**
   - Open your existing "Claude Worker API" collection
   - Click the three dots (...) next to the collection name
   - Select "Import" → "File"
   - Choose `postman-chat-plan-endpoints.json`
   - This will add "Chat Plan Mode" as a new folder in your collection

### Method 2: Manual Addition

1. **Add new collection variable:**
   - Click on the collection name
   - Go to "Variables" tab
   - Add: `sessionId` with initial value `test-session-123`

2. **Copy the endpoints from `postman-chat-plan-endpoints.json`**

### New Endpoints Added:

1. **Process Chat Plan (Question)** - Ask technical questions
2. **Process Chat Plan (Feature)** - Plan new features
3. **Process Chat Plan (Fix)** - Analyze and fix bugs
4. **Process Chat Plan (SSE Streaming)** - Real-time streaming responses
5. **Convert Plan to Build** - Convert a plan to actual build
6. **Get Project Timeline** - View unified chat/build history
7. **Get Session Details** - Get specific session information
8. **Resume Chat Session** - Continue existing conversation
9. **Arabic Chat Plan Request** - Example of i18n support

### Testing Workflow:

1. **Start a conversation:**
   ```
   POST /v1/chat-plan
   Body: {
     "userId": "user123",
     "projectId": "my-app",
     "message": "How do I add authentication?",
     "chatMode": "question"
   }
   ```
   - Save the `sessionId` from response

2. **Continue the conversation:**
   ```
   POST /v1/chat-plan
   Body: {
     "userId": "user123",
     "projectId": "my-app",
     "message": "Can you show me an example?",
     "chatMode": "question",
     "sessionId": "{{sessionId}}"  // From step 1
   }
   ```

3. **Plan a feature:**
   ```
   POST /v1/chat-plan
   Body: {
     "userId": "user123",
     "projectId": "my-app",
     "message": "I want to add dark mode",
     "chatMode": "feature"
   }
   ```

4. **Convert plan to build:**
   ```
   POST /v1/chat-plan/convert-to-build
   Body: {
     "sessionId": "{{sessionId}}",
     "planData": { /* from step 3 response */ },
     "userId": "user123",
     "projectId": "my-app"
   }
   ```

5. **View timeline:**
   ```
   GET /v1/project/my-app/timeline?mode=all&limit=50
   ```

### Environment Variables Required:

- `baseUrl`: Your worker URL (e.g., `http://localhost:3000`)
- `sharedSecret`: Your HMAC secret key
- `userId`: Test user ID
- `projectId`: Test project ID
- `sessionId`: Set after first chat plan request

### Notes:

- All endpoints require HMAC signature authentication
- SSE streaming may not display properly in Postman - use curl for testing:
  ```bash
  curl -N -H "Accept: text/event-stream" \
       -H "x-sheen-signature: YOUR_SIGNATURE" \
       -H "Content-Type: application/json" \
       -d '{"userId":"user123","projectId":"my-app","message":"Analyze my code","chatMode":"analysis"}' \
       http://localhost:3000/v1/chat-plan
  ```

- Arabic and other language responses require proper locale setting (e.g., `"locale": "ar-EG"`)
- Session timeout is 10 minutes of inactivity
- Rate limits: 100 req/hour per user, 200 req/hour per project

### Troubleshooting:

1. **401 Unauthorized**: Check HMAC signature generation and secret key
2. **402 Payment Required**: User has insufficient AI time balance
3. **404 Session Not Found**: Session expired or invalid sessionId
4. **500 Internal Error**: Check server logs, may be Claude CLI issue

### Integration with Existing Workflows:

The chat plan mode integrates seamlessly with existing build workflows:

1. Use chat plan to discuss and plan changes
2. Convert approved plans to builds
3. Monitor build progress with existing endpoints
4. View everything in unified timeline

This maintains backward compatibility while adding conversational planning capabilities.