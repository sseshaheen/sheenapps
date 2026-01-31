#!/usr/bin/env node

// Load environment variables from parent directory (Claude Worker .env)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const crypto = require('crypto');
const app = express();

// Configuration from Claude Worker's .env file
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const SHARED_SECRET = process.env.SHARED_SECRET; // Fallback for testing
const PORT = process.env.WEBHOOK_RECEIVER_PORT || 8080;

console.log('🚀 Claude Worker Webhook Receiver');
console.log('═'.repeat(60));

// Validate configuration
if (!WEBHOOK_SECRET && !SHARED_SECRET) {
  console.error('❌ ERROR: No webhook secret found!');
  console.error('   Please set WEBHOOK_SECRET in your .env file');
  console.error('   Or run: echo "WEBHOOK_SECRET=test-secret-123" >> .env');
  process.exit(1);
}

const SECRET = WEBHOOK_SECRET || SHARED_SECRET;
console.log(`🔐 Using secret: ${SECRET.substring(0, 8)}...`);
console.log(`📡 Will listen on port: ${PORT}`);
console.log('═'.repeat(60));

// Parse raw body for signature verification
app.use(express.raw({ type: 'application/json', limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    webhookSecret: SECRET ? 'configured' : 'missing',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main webhook endpoint
app.post('/webhook', (req, res) => {
  const timestamp = new Date().toISOString();

  console.log('\\n🔔 WEBHOOK RECEIVED');
  console.log(`⏰ ${timestamp}`);
  console.log('═'.repeat(60));

  try {
    // 1. Get signature and body
    const receivedSignature = req.headers['x-webhook-signature'];
    const body = req.body;

    console.log('📨 Headers:');
    console.log(`   Content-Type: ${req.headers['content-type']}`);
    console.log(`   User-Agent: ${req.headers['user-agent']}`);
    console.log(`   Content-Length: ${req.headers['content-length']}`);

    if (!receivedSignature) {
      console.error('❌ Missing X-Webhook-Signature header');
      return res.status(401).send('Missing signature header');
    }

    // 2. Verify HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', SECRET)
      .update(body)
      .digest('hex');

    console.log('🔐 Signature verification:');
    console.log(`   Received: ${receivedSignature}`);
    console.log(`   Expected: ${expectedSignature}`);
    console.log(`   Match: ${receivedSignature === expectedSignature ? '✅' : '❌'}`);

    if (receivedSignature !== expectedSignature) {
      console.error('❌ INVALID SIGNATURE - Webhook rejected for security');
      return res.status(401).send('Invalid signature');
    }

    // 3. Parse and process payload
    const payload = JSON.parse(body.toString());
    const { buildId, type, data, timestamp: eventTime } = payload;

    console.log('📦 Event details:');
    console.log(`   Build ID: ${buildId}`);
    console.log(`   Event: ${type}`);
    console.log(`   Time: ${eventTime}`);

    // 4. Pretty-print event data
    console.log('📝 Event data:');
    if (data.message) console.log(`   Message: ${data.message}`);
    if (data.taskName) console.log(`   Task: ${data.taskName}`);
    if (data.taskCount) console.log(`   Tasks: ${data.taskCount}`);
    if (data.filesCreated) console.log(`   Files: ${data.filesCreated}`);
    if (data.previewUrl) console.log(`   URL: ${data.previewUrl}`);
    if (data.error) console.log(`   Error: ${data.error}`);

    // 5. Event-specific processing
    console.log('🎯 Processing:');
    switch (type) {
      case 'plan_started':
        console.log('   🔄 Planning phase - Analyzing requirements');
        break;

      case 'plan_generated':
        console.log(`   📋 Plan complete - ${data.taskCount || 'unknown'} tasks to execute`);
        break;

      case 'task_started':
        console.log(`   ⚙️  Executing task: ${data.taskName || 'Unknown task'}`);
        break;

      case 'task_completed':
        console.log(`   ✅ Task done: ${data.taskName} (${data.filesCreated || 0} files created)`);
        break;

      case 'deploy_started':
        console.log('   🚀 Deployment started - building and uploading');
        break;

      case 'build_started':
        console.log('   🏗️  Building application assets');
        break;

      case 'deploy_progress':
        console.log(`   📤 ${data.stage}: ${data.message || 'Deploying...'}`);
        break;

      case 'deploy_completed':
        console.log('   🎉 BUILD COMPLETED SUCCESSFULLY!');
        console.log(`   🌐 Live at: ${data.previewUrl}`);
        console.log(`   🏷️  Deployment ID: ${data.deploymentId}`);
        // Here you would:
        // - Update your database
        // - Send notification to user
        // - Update UI in real-time
        break;

      case 'task_failed':
        console.log(`   ❌ Task failed: ${data.taskName}`);
        console.log(`   🐛 Error: ${data.error}`);
        break;

      case 'deploy_failed':
        console.log('   ❌ DEPLOYMENT FAILED');
        console.log(`   🐛 Error: ${data.error}`);
        // Here you would:
        // - Log error for debugging
        // - Notify user of failure
        // - Maybe retry or suggest fixes
        break;

      default:
        console.log(`   📝 Event type: ${type} (no specific handler)`);
    }

    console.log('═'.repeat(60));
    console.log('✅ Webhook processed successfully\\n');

    // Always acknowledge receipt
    res.status(200).json({
      received: true,
      buildId,
      type,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Error processing webhook:', error.message);
    console.error('📊 Raw body:', req.body.toString().substring(0, 500));
    console.log('═'.repeat(60));

    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message
    });
  }
});

// Catch-all for other requests
app.use((req, res) => {
  console.log(`❓ Unexpected ${req.method} ${req.url}`);
  res.status(404).json({
    error: 'Endpoint not found',
    hint: 'Use POST /webhook for Claude Worker events'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\\n🎯 Webhook Receiver Started Successfully!');
  console.log('═'.repeat(60));
  console.log(`📡 Listening on: http://localhost:${PORT}`);
  console.log(`🔔 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`💊 Health check: http://localhost:${PORT}/health`);
  console.log('═'.repeat(60));
  console.log('\\n💡 TO CONFIGURE CLAUDE WORKER:');
  console.log('   Add to your .env file:');
  console.log(`   MAIN_APP_WEBHOOK_URL=http://localhost:${PORT}/webhook`);
  console.log(`   WEBHOOK_SECRET=${SECRET}`);
  console.log('   Then restart your Claude Worker server');
  console.log('\\n🚀 Ready to receive webhooks!\\n');

  // Set up graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});

function shutdown() {
  console.log('\\n🛑 Shutting down webhook receiver...');
  process.exit(0);
}
