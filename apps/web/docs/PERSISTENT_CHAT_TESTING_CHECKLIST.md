# Persistent Chat Testing Verification Checklist
**Purpose**: Manual QA procedures for persistent chat SSE functionality  
**Expert Guidance**: Based on production-readiness verification recommendations

---

## 🧪 **Core SSE Resume Testing**

### **Test 1: Basic Network Interruption Recovery**
**Scenario**: Verify messages are not lost when connection drops

**Steps**:
1. Open persistent chat in browser
2. Send/receive a few messages  
3. **Kill Wi-Fi** or disconnect network
4. Wait 10-15 seconds
5. **Reconnect network**
6. Check browser Network tab

**Expected Results**:
- ✅ Network tab shows new request with `Last-Event-ID` header
- ✅ Header value matches last received message sequence number  
- ✅ Stream resumes from next sequence (no message gaps)
- ✅ UI shows "reconnecting" → "connected" status transition
- ✅ No duplicate messages appear

**Common Issues**:
- Missing `Last-Event-ID` header = upstream not emitting `id:` fields
- Wrong sequence number = precedence logic error
- Duplicate messages = deduplication not working

---

### **Test 2: Explicit Backfill vs Auto-Resume Precedence** 
**Scenario**: Verify explicit backfill requests override automatic browser resume

**Steps**:
1. Open persistent chat in **Tab A**
2. Use pagination to scroll to older messages (triggers `from_seq` parameter)
3. Open persistent chat in **Tab B** (separate window)
4. **In Tab B**: Kill network → reconnect (triggers Last-Event-ID)
5. Check Network tab in both tabs

**Expected Results**:
- ✅ **Tab A**: Continues using explicit `from_seq` parameter for backfill
- ✅ **Tab B**: Uses `Last-Event-ID` for automatic resume  
- ✅ **Tab B** reconnection does **NOT** override **Tab A's** explicit backfill
- ✅ Both tabs show correct message ranges

**Common Issues**:
- Tab B overrides Tab A = precedence logic wrong
- Tab A loses backfill = shared connection state bug
- Wrong message ranges = sequence parameter confusion

---

## 🎭 **Event Types and Resume Coverage**

### **Test 3: All Event Types Include ID Fields**
**Scenario**: Verify all SSE events support resume (have `id:` fields)

**Event Types to Test**:
- `message.created` - New chat messages
- `message.updated` - Message edits  
- `presence.updated` - User online/typing status
- `system` - System notifications

**Steps** (for each event type):
1. Open browser dev tools → Network tab
2. Trigger the event (send message, change typing status, etc.)
3. Find the SSE connection in Network tab → Response tab
4. Check raw SSE event format

**Expected Results**:
- ✅ Each event shows format: `event: type\nid: <sequence>\ndata: {...}`
- ✅ `id:` field contains sequence number for resume
- ✅ After reconnect, stream resumes from last `id:` + 1

**Common Issues**:
- Missing `id:` fields = upstream worker not emitting them (requires backend fix)
- Non-sequential IDs = sequence generation broken
- Presence events without IDs = specific event type not configured

---

## 🔧 **Error Handling Verification** 

### **Test 4: Transport vs UI Error Separation**
**Scenario**: Verify network errors don't crash UI, but render errors do

**Transport Error Test**:
1. Start persistent chat
2. Block network requests to SSE endpoint (browser dev tools → Network → Block patterns)
3. Wait for connection error

**Expected Results**:
- ✅ UI shows "Connection lost" banner/indicator
- ✅ Chat interface remains functional (can type in input)
- ✅ **No error boundary screen** (white screen of death)
- ✅ Connection state updates correctly

**UI Error Test**:
1. Artificially trigger React render error (modify props to invalid values)
2. Check error boundary behavior

**Expected Results**:
- ✅ Error boundary catches render errors  
- ✅ Shows error fallback UI with refresh option
- ✅ Doesn't affect other parts of application

---

## 📱 **Cross-Platform Testing**

### **Test 5: Mobile Safari Behavior**
**Scenario**: iOS Safari has unique SSE handling behavior

**Steps**:
1. Test persistent chat on iPhone/iPad Safari
2. Background the app (iOS kills connections)
3. Return to foreground

**Expected Results**:
- ✅ Connection resumes automatically
- ✅ Last-Event-ID header sent on resume
- ✅ No message loss or duplication

---

## 🚨 **Error Monitoring and Logging**

### **Test 6: Sentry Integration** 
**Scenario**: Verify error tracking doesn't spam with transport errors

**Expected Behavior**:
- ✅ **Transport errors** (network, SSE connection) are **logged but not sent to Sentry**
- ✅ **UI errors** (render, component crashes) **are sent to Sentry**
- ✅ **PII scrubbed** from error reports (no message content, user IDs anonymized)

**Check**:
1. Trigger transport errors (network issues) → Should **not** appear in Sentry  
2. Trigger UI errors (component crashes) → Should appear in Sentry
3. Review Sentry reports for sensitive data leakage

---

## ⚠️ **Known Dependencies and Limitations**

### **Upstream Worker Service Requirements**
- **ID Fields**: Worker must emit `id: <seq>` on all SSE events for resume to work
- **Sequence Numbers**: Must be monotonic and consistent across reconnections  
- **Resume Endpoint**: Must support `from_seq` parameter correctly

### **Browser Compatibility**  
- **EventSource Support**: All modern browsers, no polyfill needed
- **Last-Event-ID**: Automatically handled by browser EventSource API
- **Header Limits**: Some proxies may limit header size

### **Performance Considerations**
- **Connection Limits**: Monitor for 429 responses if too many concurrent connections
- **Memory Usage**: Long-running streams should not leak memory
- **Message History**: Large backlogs may impact initial load time

---

## 📋 **Quick Debug Commands**

### **Check SSE Stream in DevTools**
```bash
# In browser console - monitor SSE connection
console.log('Last event ID:', eventSource.url)
```

### **Simulate Network Issues**
```bash
# Chrome DevTools → Network → Throttling → Offline
# Or Network → Block specific patterns
```

### **Verify Headers**
```bash
# Network tab → SSE request → Headers tab
# Look for: Last-Event-ID, x-sheen-locale, authorization
```

---

## ✅ **Success Criteria Summary**

**Before declaring "production-ready":**
- [ ] Test 1: Network interruption recovery works reliably
- [ ] Test 2: Explicit backfill precedence over auto-resume  
- [ ] Test 3: All event types include sequence IDs
- [ ] Test 4: Transport errors don't crash UI
- [ ] Test 5: Mobile Safari compatibility verified
- [ ] Test 6: Error monitoring properly configured

**If any test fails**, investigate root cause before release. Most issues will be either:
1. **Upstream worker** not emitting proper `id:` fields
2. **Precedence logic** in proxy routing 
3. **Error boundary** configuration in React components