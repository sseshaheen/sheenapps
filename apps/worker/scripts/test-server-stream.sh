#!/bin/bash
# Test server in stream mode with debugging

echo "Testing Claude CLI stream server..."
echo "========================================"

# First test if Claude works directly
echo -e "\n1. Testing Claude CLI directly:"
echo "Build a simple React app" | claude --output-format stream-json --verbose > /tmp/claude-test.log 2>&1 &
CLAUDE_PID=$!
sleep 3
if ps -p $CLAUDE_PID > /dev/null; then
    echo "Claude is running (PID: $CLAUDE_PID)"
    kill $CLAUDE_PID
else
    echo "Claude completed or failed"
fi
echo "Output (first 200 chars):"
head -c 200 /tmp/claude-test.log || echo "(no output)"

# Clean environment and start server
echo -e "\n2. Starting server in stream mode..."
cd /Users/sh/Sites/sheenapps-claude-worker

# Ensure Redis is running
if ! pgrep -x "redis-server" > /dev/null; then
    echo "Starting Redis..."
    redis-server --daemonize yes
    sleep 2
fi

# Clean any old jobs
node clean-all-jobs.js 2>/dev/null || echo "No jobs to clean"

# Unset Claude Code environment variables
unset CLAUDE_CODE_ENTRYPOINT
unset CLAUDECODE

# Set environment
export ARCH_MODE=stream
export LOG_LEVEL=debug

echo -e "\nEnvironment:"
echo "ARCH_MODE=$ARCH_MODE"
echo "Working directory: $(pwd)"
echo "Claude location: $(which claude)"
echo "Node version: $(node --version)"

# Start server with more verbose output
echo -e "\n3. Starting server..."
npm start