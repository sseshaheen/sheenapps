#!/bin/bash

# Test script for the Claude Provider

echo "🤖 Testing Claude Provider..."
echo "============================="
echo ""

cd /Users/sh/Sites/sheenapps-claude-worker

# Run with USE_REAL_PROVIDER to bypass mock in test mode
USE_REAL_PROVIDER=true NODE_ENV=test node dist/test/testClaudeProvider.js