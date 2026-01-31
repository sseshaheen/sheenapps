#!/bin/bash

# Smoke test script for the modular Claude architecture (without database)

echo "🧪 Running modular system smoke test (No DB)..."
echo "============================================"
echo ""

cd /Users/sh/Sites/sheenapps-claude-worker

# Run the compiled test
node dist/test/smokeTestModularNoDB.js