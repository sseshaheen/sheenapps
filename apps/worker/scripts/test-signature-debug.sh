#!/bin/bash

SHARED_SECRET="${1:-your-shared-secret}"
PAYLOAD='{"userId":"test-user","projectId":"test-project","prompt":"Create a simple React app","framework":"react"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" -binary | xxd -p -c 256)

echo "Testing signature generation for both endpoints..."
echo "SHARED_SECRET: $SHARED_SECRET"
echo "PAYLOAD: $PAYLOAD"
echo "SIGNATURE: $SIGNATURE"
echo ""

# Test debug-signature endpoint
echo "1. Testing /debug-signature endpoint:"
curl -s -X POST http://localhost:3000/debug-signature \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -d "$PAYLOAD" | jq '.'

echo ""
echo "2. Testing /create-preview-for-new-project endpoint:"
curl -s -X POST http://localhost:3000/create-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -d "$PAYLOAD" \
  -w "\nHTTP Status: %{http_code}\n"