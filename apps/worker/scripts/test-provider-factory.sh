#!/bin/bash

# Test script for the Provider Factory

echo "🏭 Testing Provider Factory..."
echo "=============================="
echo ""

cd /Users/sh/Sites/sheenapps-claude-worker

# Run the test
NODE_ENV=test node dist/test/testProviderFactory.js