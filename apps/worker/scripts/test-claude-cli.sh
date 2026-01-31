#!/bin/bash

# Test script for the Claude CLI Provider

echo "🤖 Testing Claude CLI Provider..."
echo "================================"
echo ""

cd /Users/sh/Sites/sheenapps-claude-worker

# Run with USE_REAL_PROVIDER to bypass mock in test mode
USE_REAL_PROVIDER=true NODE_ENV=test node dist/test/testClaudeCLI.js