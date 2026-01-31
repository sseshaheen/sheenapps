#!/bin/bash

# Smoke test script for the modular Claude architecture

echo "🧪 Running modular system smoke test..."
echo "=================================="
echo ""

# Run the test directly with node using existing node_modules
cd /Users/sh/Sites/sheenapps-claude-worker

# First build just the test file
echo "Building test file..."
npx tsc src/test/smokeTestModular.ts --outDir dist --esModuleInterop --skipLibCheck || true

# Run the compiled test
echo ""
echo "Running test..."
node dist/test/smokeTestModular.js