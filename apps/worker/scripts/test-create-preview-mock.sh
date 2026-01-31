#!/bin/bash

# Test with mock provider to avoid actual Claude calls
SHARED_SECRET="${1:-9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=}"
PAYLOAD='{"userId":"test-user","projectId":"test-project","prompt":"Create a simple React app","framework":"react"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" -binary | xxd -p -c 256)

echo "Testing /create-preview-for-new-project with MOCK provider"
echo "=========================================="
echo ""

# Add headers to use mock provider and direct mode
curl -s -X POST http://localhost:3000/create-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -H "x-direct-mode: true" \
  -H "x-use-mock: true" \
  -d "$PAYLOAD" \
  --max-time 30 | jq '.'

echo ""
echo "Note: This uses a mock AI provider for faster testing"