#!/bin/bash

# Set your SHARED_SECRET here or pass as first argument
SHARED_SECRET="${1:-your-shared-secret-here}"

# Test payload
PAYLOAD='{"userId":"test-user","projectId":"test-project","prompt":"Create a simple React app with a header component that says Hello World and a button that increments a counter","framework":"react"}'

# Generate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" -binary | xxd -p -c 256)

echo "Testing /create-preview-for-new-project endpoint..."
echo "Payload: $PAYLOAD"
echo "Signature: $SIGNATURE"
echo ""

# Make the request
curl -X POST http://localhost:3000/create-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -d "$PAYLOAD" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  | jq '.'