#!/bin/bash

# Integration test script for the modular Claude architecture

echo "🧪 Running Integration Test..."
echo "============================="
echo ""

cd /Users/sh/Sites/sheenapps-claude-worker

# Run the test with NODE_ENV=test to avoid Redis
NODE_ENV=test node dist/test/integrationTest.js