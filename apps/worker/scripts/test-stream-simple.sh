#!/bin/bash

# Simple test for stream endpoint
SHARED_SECRET="${1:-9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=}"
PAYLOAD='{"userId":"test-stream","projectId":"simple-test","prompt":"Create a simple React component that displays Hello World","framework":"react"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" -binary | xxd -p -c 256)

echo "Testing simple stream request..."
echo ""

curl -s -X POST http://localhost:3000/create-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -H "x-direct-mode: true" \
  -d "$PAYLOAD" \
  --max-time 30 | jq '.'