#!/bin/bash

# Test script for the Task Executor

echo "🔧 Testing Task Executor Service..."
echo "================================"
echo ""

cd /Users/sh/Sites/sheenapps-claude-worker

# Run the test with NODE_ENV=test to avoid Redis
NODE_ENV=test node dist/test/testTaskExecutor.js