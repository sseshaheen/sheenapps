#!/bin/bash

# Test Claude CLI directly
cd /tmp
mkdir -p test-claude
cd test-claude

echo "Testing Claude CLI directly..."
echo ""

# Simple test
claude -p "Create a simple index.html file with 'Hello World'" \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions \
  2>&1 | head -20