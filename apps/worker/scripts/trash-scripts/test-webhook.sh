#!/bin/bash

# Simple webhook test

echo "=== Testing Webhook Integration ==="

# Create test webhook receiver (mock server)
echo "Starting mock webhook server on port 8080..."

# Start simple webhook receiver in background
node -e "
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      console.log('=== WEBHOOK RECEIVED ===');
      console.log('Headers:', req.headers);
      console.log('Body:', body);
      console.log('========================');
      res.writeHead(200);
      res.end('OK');
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.listen(8080, () => console.log('Mock webhook server running on :8080'));
" &

MOCK_PID=$!
echo "Mock server PID: $MOCK_PID"

# Set webhook environment variables
export MAIN_APP_WEBHOOK_URL="http://localhost:8080/webhook"
export WEBHOOK_SECRET="test-webhook-secret-123"

echo "Webhook URL: $MAIN_APP_WEBHOOK_URL"
echo "Webhook Secret: $WEBHOOK_SECRET"

# Wait for mock server to start
sleep 2

# Trigger a build to generate webhook events
echo -e "\nTriggering build to test webhooks..."

USER_ID="webhook-test-$(date +%s)"
PROJECT_ID="webhook-project-$(date +%s)"
SECRET="9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs="

mkdir -p "$HOME/projects/$USER_ID/$PROJECT_ID"

BODY='{"userId":"'$USER_ID'","projectId":"'$PROJECT_ID'","prompt":"Create webhook test page"}'
SIGNATURE=$(node -e "
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', '$SECRET').update('$BODY').digest('hex');
console.log(sig);
")

echo "Making build request..."
curl -s -X POST http://localhost:3000/build-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "X-Sheen-Signature: $SIGNATURE" \
  -d "$BODY"

echo -e "\n\nWaiting 30 seconds for webhooks to be delivered..."
sleep 30

# Cleanup
echo -e "\nCleaning up..."
kill $MOCK_PID 2>/dev/null
rm -rf "$HOME/projects/$USER_ID"

echo "Webhook test complete!"