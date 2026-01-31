#!/bin/bash

# Integration test for modular architecture

echo "🧪 Modular Architecture Integration Test"
echo "========================================"
echo ""

cd /Users/sh/Sites/sheenapps-claude-worker

# Build first
echo "Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo ""

# Run the integration test
NODE_ENV=test node dist/test/testModularIntegration.js