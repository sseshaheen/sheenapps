#!/bin/bash

# Test the stream-based create-preview endpoint with a React project
SHARED_SECRET="${1:-9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=}"
PAYLOAD='{"userId":"test-stream","projectId":"react-multi-file","prompt":"Create a React app with:\n1. A Header component that exports as Header and displays \"My React App\"\n2. An App component that imports Header and displays it\n3. A Button component that manages a counter state\n4. The App should import and use the Button component\n5. Include proper CSS files for styling","framework":"react"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" -binary | xxd -p -c 256)

echo "Testing stream-based implementation"
echo "=================================="
echo ""

# First, ensure ARCH_MODE is set to stream
export ARCH_MODE=stream
echo "ARCH_MODE=$ARCH_MODE"
echo ""

# Use direct mode for immediate execution
echo "Sending request to /create-preview-for-new-project..."
RESPONSE=$(curl -s -X POST http://localhost:3000/create-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -H "x-direct-mode: true" \
  -d "$PAYLOAD" \
  --max-time 300)

echo "Response:"
echo "$RESPONSE" | jq '.'

# Extract buildId/planId from response
PLAN_ID=$(echo "$RESPONSE" | jq -r '.planId')
echo ""
echo "Build ID: $PLAN_ID"

# Check generated files
PROJECT_PATH="/Users/sh/projects/test-stream/react-multi-file"
echo ""
echo "Checking generated files in $PROJECT_PATH:"
echo "==========================================="

if [ -d "$PROJECT_PATH" ]; then
  echo ""
  echo "File structure:"
  find "$PROJECT_PATH" -type f -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.css" | sort
  
  echo ""
  echo "Checking App.js imports:"
  if [ -f "$PROJECT_PATH/src/App.js" ]; then
    grep -E "^import.*from" "$PROJECT_PATH/src/App.js" || echo "No imports found"
  fi
  
  echo ""
  echo "Checking Header.js exports:"
  if [ -f "$PROJECT_PATH/src/Header.js" ]; then
    grep -E "^export" "$PROJECT_PATH/src/Header.js" || echo "No exports found"
  fi
  
  echo ""
  echo "Checking package.json:"
  if [ -f "$PROJECT_PATH/package.json" ]; then
    jq '.dependencies' "$PROJECT_PATH/package.json" 2>/dev/null || echo "Invalid package.json"
  fi
  
  echo ""
  echo "Checking for TypeScript syntax in .js files:"
  grep -r "interface\|: React.FC\|: string\|: number" "$PROJECT_PATH/src" --include="*.js" || echo "No TypeScript syntax found (good!)"
else
  echo "Project directory not found!"
fi