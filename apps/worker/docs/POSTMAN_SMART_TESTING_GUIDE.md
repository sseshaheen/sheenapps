# 🧪 Smart Testing Guide - Postman Collection

## Quick Start (2 minutes)

1. **Import Collection**: Import `SheenApps-Claude_Worker_API.postman_collection-22-July-2025.json`
2. **Verify Variables**: Check that `sharedSecret` matches your `.env` file
3. **Test Health**: Send `Main Health Check` - should return `200 OK`

## 🚀 **Complete End-to-End Test (5 minutes)**

### Step 1: Start a Build
```
Send: "Build Preview (New Project)"
Expected: ✅ Test passes, buildId auto-set
Console shows: 🚀 BUILD STARTED SUCCESSFULLY!
```

### Step 2: Monitor Progress  
```
Send: "Get Build Status" every 10-15 seconds
Expected: Visual progress bar in console
Watch: planning → executing → deploying → completed
```

### Step 3: Check Events (Optional)
```
Send: "Get Build Events" 
Expected: Detailed event stream
See: plan_started, task_completed, deploy_completed
```

## 📊 **Smart Test Features**

### Auto-Generated Console Output:
```
🚀 BUILD STARTED SUCCESSFULLY!
✅ jobId extracted: 27
🔧 buildId variable set automatically: 27

📋 NEXT STEPS:
1. Use 'Get Build Status' to monitor progress
2. Use 'Get Build Events' to see detailed events
3. Watch for status: planning → executing → deploying → completed
4. Final build will have previewUrl in the response

⏰ Expected completion time: 60-120 seconds
```

### Visual Progress Monitoring:
```
📊 BUILD STATUS REPORT
══════════════════════════════════════════════════
🏗️  Build ID: 27
📈 Progress: [████████░░░░░░░░░░░░] 40%
🎯 Status: EXECUTING
📝 Events: 8 total
⚙️  Creating files and implementing features...
⏱️  Expected: ~30-60 seconds
══════════════════════════════════════════════════
💡 TIP: Send this request again in 10-15 seconds to check progress
```

## 🎯 **Testing Different Scenarios**

### 1. **Happy Path** (Most Common)
- Send "Build Preview (New Project)"  
- Monitor with "Get Build Status"
- Result: ✅ previewUrl returned

### 2. **Webhook Testing** 
- Send "Get Webhook Status"
- Should show configuration status
- Add webhook URL if desired

### 3. **Error Testing**
- Send "Invalid Signature (401)" 
- Send "Missing Parameters (400)"
- Verify error handling works

### 4. **Version Management**
- After successful build, try "Get Latest Version"
- Test "List Project Versions"

## 💡 **Pro Tips**

### Variables Auto-Set by Test Scripts:
- `buildId` - Automatically set from build response
- `lastPreviewUrl` - Latest successful deployment URL

### Console Debugging:
1. **Open Console**: View → Show Postman Console  
2. **Watch Real-time**: See progress updates and guidance
3. **Debug Issues**: Full request/response details shown

### Collection Runner (Advanced):
1. Create new Collection Runner
2. Select: Build Preview → Get Build Status (run multiple times)  
3. Add delays between requests for automatic monitoring

## 🔍 **Troubleshooting**

| Issue | Solution |
|-------|----------|
| Invalid Signature | Check `sharedSecret` variable matches `.env` |
| Build doesn't start | Verify server is running with modular workers |
| No progress updates | Check `buildId` variable is set correctly |
| Webhook not working | Set `MAIN_APP_WEBHOOK_URL` environment variable |

## 📈 **Expected Timeline**

| Time | Status | Progress | What's Happening |
|------|--------|----------|------------------|
| 0s | `queued` | 0% | Build added to queue |
| 5-10s | `planning` | 10% | Claude analyzing requirements |
| 15-30s | `executing` | 20-70% | Creating files, implementing features |
| 60-90s | `deploying` | 80% | Building and uploading to Cloudflare |
| 90-120s | `completed` | 100% | ✅ Live preview URL available |

## ✅ **Success Indicators**

- ✅ All tests pass (green checkmarks in Postman)
- ✅ Console shows detailed progress information  
- ✅ Final status shows `completed` with `previewUrl`
- ✅ Preview URL opens working application

**The test scripts provide comprehensive guidance and automation - just follow the console output!** 🎉