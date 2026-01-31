#!/bin/bash

# Set direct mode via header
SHARED_SECRET="${1:-9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=}"
PAYLOAD='{"userId":"test-user","projectId":"test-edge-project","prompt":"Create this: simple Next.js page that says '\''Hello Edge World'\'' with an API route at /api/hello that returns JSON with current timestamp. Make the API route edge-compatible.","framework":"nextjs"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" -binary | xxd -p -c 256)

echo "Testing /create-preview-for-new-project in DIRECT MODE"
echo "=========================================="
echo "PAYLOAD: $PAYLOAD"
echo ""

# Add x-direct-mode header to enable direct mode for this request
curl -s -X POST http://127.0.2.3:3000/v1/create-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -H "x-direct-mode: true" \
  -d "$PAYLOAD" | jq '.'