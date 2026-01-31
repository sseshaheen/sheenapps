#!/bin/bash

# Simple progress test

echo "=== Simple Progress Test ==="

# Use hardcoded values
USER_ID="test-user-$(date +%s)"
PROJECT_ID="test-project-$(date +%s)"
SECRET="9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs="

# Create directory
mkdir -p "$HOME/projects/$USER_ID/$PROJECT_ID"

# Create request
BODY='{"userId":"'$USER_ID'","projectId":"'$PROJECT_ID'","prompt":"Create a simple test page"}'
echo "Body: $BODY"

# Generate signature using Node.js (more reliable than openssl)
SIGNATURE=$(node -e "
const crypto = require('crypto');
const body = '$BODY';
const secret = '$SECRET';
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
console.log(sig);
")

echo "Signature: $SIGNATURE"

# Make request
echo "Making request..."
RESPONSE=$(curl -s -X POST http://localhost:3000/build-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "X-Sheen-Signature: $SIGNATURE" \
  -d "$BODY")

echo "Response: $RESPONSE"

# Extract jobId
JOB_ID=$(echo "$RESPONSE" | grep -o '"jobId":"[^"]*' | cut -d'"' -f4)
echo "Job ID: $JOB_ID"

if [ -z "$JOB_ID" ]; then
  echo "Failed to get job ID"
  exit 1
fi

# Monitor progress
echo -e "\nMonitoring progress for build $JOB_ID..."

for i in {1..60}; do
  # Get events
  EVENTS=$(curl -s "http://localhost:3000/api/builds/$JOB_ID/events")
  echo "Attempt $i: $EVENTS"
  
  # Check if we have events
  if echo "$EVENTS" | grep -q "plan_started\|task_started\|deploy_started"; then
    echo "Found events!"
    echo "$EVENTS" | python3 -m json.tool
    break
  fi
  
  sleep 2
done

# Get final status
echo -e "\nFinal status:"
curl -s "http://localhost:3000/api/builds/$JOB_ID/status" | python3 -m json.tool

# Cleanup
rm -rf "$HOME/projects/$USER_ID"