# Stream Implementation Fix Plan

## 🔍 Root Cause Analysis

### The Issue
Your server was running **outdated compiled JavaScript** that still used the `-p` flag approach. The TypeScript had been updated to use stdin, but the running Node.js process was using old code.

### Evidence
- **Server logs showed**: `claude -p "prompt" --output-format stream-json`
- **Compiled JS had**: `claude --output-format stream-json` (no -p flag)
- **Webhook logs**: Were from a different build (different build IDs)

## ✅ What We Fixed

1. **Updated TypeScript compilation** ✅
   - Removed `-p` flag, now sends prompt via stdin
   - Added extensive debugging output

2. **Improved restart script** ✅
   - More aggressive process killing
   - Build verification
   - Timestamp logging

3. **Added server build timestamp** ✅
   - Shows when the server code was built
   - Helps verify you're running the latest code

## 🚀 Immediate Actions

### 1. Restart with New Code
```bash
./restart-clean.sh
```

This will:
- Kill ALL old Node processes
- Rebuild TypeScript
- Start fresh with stdin implementation
- Save logs to `test-run/dev-server.log`

### 2. Verify New Code is Running
Look for these in the logs:
```
📅 Server built at: [RECENT TIMESTAMP]
[ClaudeStreamProcess] Sending prompt via stdin...
[ClaudeStreamProcess] Prompt length: XXX characters
[ClaudeStreamProcess] Successfully wrote prompt to stdin
```

**NOT** this old behavior:
```
[ClaudeStreamProcess] Command: /opt/homebrew/bin/claude -p ...
```

### 3. Test the Endpoint
```bash
curl -X POST http://localhost:3000/create-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: YOUR_SIGNATURE" \
  -d '{
    "userId": "user123",
    "projectId": "test-app",
    "prompt": "Create a simple React app with a welcome message",
    "framework": "react"
  }'
```

## 📊 Expected Behavior

### With Fixed Code
1. Claude receives prompt via stdin
2. Outputs JSON stream properly
3. Creates all necessary files
4. Webhook shows progress for each file

### If Still Not Working
The stdin approach is correct based on our testing. If Claude still doesn't respond:

1. **Test Claude CLI manually**:
   ```bash
   echo "Build a simple React app" | claude --output-format stream-json --verbose
   ```

2. **Check authentication**:
   ```bash
   claude version
   ```

3. **Use fallback**:
   ```bash
   export ARCH_MODE=modular
   ./restart-clean.sh
   ```

## 🔧 Debug Commands

### Check Running Processes
```bash
ps aux | grep -E "node.*dist/server.js"
```

### Monitor Logs
```bash
tail -f test-run/dev-server.log | grep -E "ClaudeStreamProcess|Claude process|stdin"
```

### Clean Failed Jobs
```bash
node clean-all-jobs.js
```

## 📝 Summary

The core issue was the server running old compiled code. With the fixes:
1. TypeScript is properly compiled with stdin implementation
2. Restart script ensures clean state
3. Build timestamps help verify latest code

The stdin approach should work once the server runs the new code. The webhook logs showing successful builds prove the overall system works - we just need Claude CLI to respond to the stdin input.