# Claude Worker Webhook Receiver

A standalone test application to receive and display webhooks from the Claude Worker.

## 🚀 Quick Start

```bash
# 1. Install dependencies
cd webhook-receiver
npm install

# 2. Start the receiver (automatically uses parent .env)
npm start

# 3. In another terminal, configure your Claude Worker
echo "MAIN_APP_WEBHOOK_URL=http://localhost:8080/webhook" >> ../.env
echo "WEBHOOK_SECRET=test-webhook-secret-123" >> ../.env

# 4. Restart your Claude Worker
cd .. && npm run dev
```

## 📡 Endpoints

- **POST /webhook** - Main webhook receiver
- **GET /health** - Health check and configuration status

## 🔐 Security

- Automatically reads `WEBHOOK_SECRET` from parent `.env` file
- Verifies HMAC-SHA256 signatures on all incoming webhooks
- Rejects webhooks with invalid or missing signatures

## 📊 Sample Output

```
🔔 WEBHOOK RECEIVED
⏰ 2025-07-22T15:30:45.123Z
═══════════════════════════════════════════════════════════
🔐 Signature verification:
   Received: a1b2c3...
   Expected: a1b2c3...
   Match: ✅

📦 Event details:
   Build ID: 27
   Event: deploy_completed
   Time: 2025-07-22T15:30:44.956Z

📝 Event data:
   Message: Deployment successful! Preview: https://...
   URL: https://abc123.sheenapps-preview.pages.dev

🎯 Processing:
   🎉 BUILD COMPLETED SUCCESSFULLY!
   🌐 Live at: https://abc123.sheenapps-preview.pages.dev

✅ Webhook processed successfully
```

## 🧪 Testing with Postman

1. Start the webhook receiver: `npm start`
2. Configure your Claude Worker (see Quick Start)
3. Use Postman to send "Build Preview (New Project)"
4. Watch the webhook receiver console for real-time events

## ⚙️ Configuration

The app automatically loads configuration from `../.env`:

- `WEBHOOK_SECRET` - Primary webhook secret
- `SHARED_SECRET` - Fallback if WEBHOOK_SECRET not set
- `WEBHOOK_RECEIVER_PORT` - Port to listen on (default: 8080)

## 🏗️ Integration Points

This receiver demonstrates where you would:

- **Update your database** with build status
- **Send user notifications** (email, push, SMS)
- **Update your UI** in real-time
- **Log events** for analytics
- **Handle errors** gracefully

## 📝 Event Types Handled

- `plan_started` - Build planning begins
- `plan_generated` - Implementation plan ready  
- `task_started` - Individual task execution
- `task_completed` - Task finished successfully
- `deploy_started` - Deployment process begins
- `build_started` - Building application assets
- `deploy_progress` - Upload progress updates
- `deploy_completed` - Build completed with preview URL
- `task_failed` / `deploy_failed` - Error handling

Perfect for testing your Claude Worker webhook integration!