#!/bin/bash

# Simple test without headers
SHARED_SECRET="${1:-9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=}"
PAYLOAD='{"userId":"test-user","projectId":"test-edge-project","prompt":"Create this: simple Next.js page that says '\''Hello Edge World'\'' with an API route at /api/hello that returns JSON with current timestamp. Make the API route edge-compatible.","framework":"nextjs"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" -binary | xxd -p -c 256)

echo "Testing /create-preview-for-new-project (queue mode)"
echo "====================================================="
echo ""

curl -s -X POST http://localhost:3000/v1/create-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -d "$PAYLOAD" | jq '.'