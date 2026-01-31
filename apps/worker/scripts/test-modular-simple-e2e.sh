#!/bin/bash

# Simple e2e test for modular architecture

set -e

echo "🧪 Simple Modular E2E Test"
echo "=========================="
echo ""

cd "$(dirname "$0")/.."

# 1. Build
echo "1. Building project..."
npm run build > /dev/null 2>&1
echo "✅ Build successful"

# 2. Test Redis executor
echo ""
echo "2. Testing Redis executor..."
npx ts-node scripts/test-redis-executor.ts
echo "✅ Redis executor test passed"

# 3. Test with server (optional)
if [ "$1" == "--with-server" ]; then
    echo ""
    echo "3. Testing with server..."
    
    # Start server
    export ARCH_MODE=modular
    npm run dev > /tmp/server.log 2>&1 &
    SERVER_PID=$!
    
    # Wait for server
    echo -n "Waiting for server"
    for i in {1..30}; do
        if curl -s http://localhost:3000/myhealthz > /dev/null 2>&1; then
            echo " ✅"
            break
        fi
        echo -n "."
        sleep 1
    done
    
    # Test health endpoint
    echo ""
    echo "Testing health endpoint..."
    curl -s http://localhost:3000/claude-executor/health | jq .
    
    # Cleanup
    kill $SERVER_PID 2>/dev/null || true
fi

echo ""
echo "=========================="
echo "✅ All tests passed!"