#!/bin/bash

# End-to-end test for modular architecture with Claude CLI via Redis

set -e

echo "🧪 Modular Architecture E2E Test with Claude CLI"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to project directory
cd "$(dirname "$0")/.."

# Function to check if a service is running
check_service() {
    local service=$1
    local check_cmd=$2
    echo -n "Checking $service... "
    if eval $check_cmd > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        return 1
    fi
}

# Function to wait for server
wait_for_server() {
    local url=$1
    local max_attempts=30
    local attempt=1
    
    echo -n "Waiting for server at $url "
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo -e " ${GREEN}ready!${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    echo -e " ${RED}timeout!${NC}"
    return 1
}

# Function to run a test
run_test() {
    local test_name=$1
    local test_cmd=$2
    echo -n "  $test_name... "
    if eval $test_cmd > /tmp/test_output.log 2>&1; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        echo "    Error output:"
        cat /tmp/test_output.log | sed 's/^/    /'
        return 1
    fi
}

# Kill any existing server processes
echo "Cleaning up existing processes..."
pkill -f "ts-node src/server.ts" || true
pkill -f "node dist/server.js" || true
sleep 2

# Check prerequisites
echo ""
echo "Checking prerequisites..."
check_service "Redis" "redis-cli ping" || {
    echo -e "${RED}Error: Redis is not running. Please start Redis first.${NC}"
    exit 1
}

check_service "Claude CLI" "which claude" || {
    echo -e "${RED}Error: Claude CLI not found. Please install it first.${NC}"
    exit 1
}

# Build the project
echo ""
echo "Building project..."
npm run build > /dev/null 2>&1 || {
    echo -e "${RED}Build failed!${NC}"
    exit 1
}
echo -e "${GREEN}Build successful${NC}"

# Start server in modular mode
echo ""
echo "Starting server in modular mode..."
export ARCH_MODE=modular
export MOCK_CLAUDE=false
export NODE_ENV=test
export LOG_LEVEL=info

# Start server in background
npm run dev > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
wait_for_server "http://localhost:3000/myhealthz" || {
    echo -e "${RED}Server failed to start!${NC}"
    echo "Server logs:"
    tail -50 /tmp/server.log
    kill $SERVER_PID 2>/dev/null || true
    exit 1
}

# Run tests
echo ""
echo "Running E2E tests..."
echo ""

# Test 1: Health check endpoint
echo "1. Testing health endpoints"
run_test "Main health check" "curl -s http://localhost:3000/myhealthz | grep -q 'healthy'"
run_test "Claude executor health" "curl -s http://localhost:3000/claude-executor/health | grep -q 'healthy'"

# Test 2: Claude CLI execution via Redis
echo ""
echo "2. Testing Claude CLI execution"
run_test "Redis executor test" "npx ts-node scripts/test-redis-executor.ts"

# Test 3: Plan generation
echo ""
echo "3. Testing plan generation"
cat > /tmp/test_plan_request.json << EOF
{
  "userId": "test-user",
  "projectId": "test-project",
  "prompt": "Create a simple hello world HTML file",
  "type": "plan"
}
EOF

run_test "Plan generation via API" "curl -s -X POST http://localhost:3000/generate \
    -H 'Content-Type: application/json' \
    -H 'x-sheen-signature: test' \
    -d @/tmp/test_plan_request.json \
    | grep -q 'tasks'"

# Test 4: Code generation
echo ""
echo "4. Testing code generation"
cat > /tmp/test_code_request.json << EOF
{
  "type": "code_gen",
  "input": "Create a function that adds two numbers",
  "context": {
    "framework": "nodejs",
    "targetPath": "math.js"
  }
}
EOF

# Create a simple test script that uses the provider directly
cat > /tmp/test_code_gen.ts << EOF
import * as dotenv from 'dotenv';
dotenv.config();

import { providerFactory } from '../src/providers/providerFactory';

async function test() {
  const provider = providerFactory.create();
  const result = await provider.transform({
    type: 'code_gen',
    input: 'Create a function that adds two numbers',
    context: { framework: 'nodejs' }
  });
  
  if (result.output.includes('function') && result.output.includes('add')) {
    console.log('SUCCESS: Code generated');
    process.exit(0);
  } else {
    console.error('FAILED: Invalid output');
    process.exit(1);
  }
}

test().catch(console.error);
EOF

run_test "Code generation" "cd $(pwd) && npx ts-node /tmp/test_code_gen.ts"

# Test 5: Check metrics
echo ""
echo "5. Testing metrics collection"
run_test "Metrics available" "curl -s http://localhost:3000/claude-executor/health | jq '.metrics.totalRequests' | grep -q '[0-9]'"

# Test 6: Circuit breaker (optional - commented out as it takes time)
# echo ""
# echo "6. Testing circuit breaker"
# # Would need to force failures to test circuit breaker

# Check server logs for errors
echo ""
echo "Checking server logs for errors..."
if grep -i "error\|failed\|exception" /tmp/server.log | grep -v "test" | grep -v "debug" > /tmp/errors.log 2>&1; then
    echo -e "${YELLOW}Warning: Found some error messages in logs:${NC}"
    head -10 /tmp/errors.log | sed 's/^/  /'
    echo "  (See /tmp/server.log for full logs)"
else
    echo -e "${GREEN}No critical errors found in logs${NC}"
fi

# Cleanup
echo ""
echo "Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
rm -f /tmp/test_*.json /tmp/test_*.ts /tmp/test_output.log

echo ""
echo "=============================================="
echo -e "${GREEN}✅ E2E tests completed successfully!${NC}"
echo ""
echo "Summary:"
echo "  - Server started in modular mode"
echo "  - Claude CLI executed via Redis pub/sub"
echo "  - Health checks working"
echo "  - Plan and code generation functional"
echo "  - Metrics being collected"
echo ""
echo "Next steps:"
echo "  1. Run extended tests with real projects"
echo "  2. Monitor performance under load"
echo "  3. Check cost tracking accuracy"