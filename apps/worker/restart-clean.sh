#!/bin/bash
# Clean restart script for stream mode testing

echo "🧹 Clean restart for stream mode..."
echo "===================================="

# First, handle log rotation at the beginning
echo "📁 Rotating existing logs..."
if [ -d "test-runs/most_recent" ] && [ "$(ls -A test-runs/most_recent)" ]; then
    # Get timestamp for archive folder (use current time)
    ARCHIVE_TIMESTAMP=$(date +%s)

    # Create archive folder
    ARCHIVE_DIR="test-runs/archived/${ARCHIVE_TIMESTAMP}"
    mkdir -p "$ARCHIVE_DIR"

    # Move ALL contents from most_recent to archive
    echo "  Moving all files from most_recent to ${ARCHIVE_DIR}..."
    mv test-runs/most_recent/* "$ARCHIVE_DIR/" 2>/dev/null || true
    mv test-runs/most_recent/.* "$ARCHIVE_DIR/" 2>/dev/null || true  # Also move hidden files

    echo "  ✅ Archived all contents to ${ARCHIVE_DIR}"
else
    echo "  No files to archive in most_recent"
fi

# Ensure directories exist
mkdir -p "test-runs/most_recent"
mkdir -p "test-runs/archived"

# Create empty log files
touch "test-runs/most_recent/dev-server.log"
touch "test-runs/most_recent/dev-webhook.log"
echo "✅ Fresh log files created in test-runs/most_recent/"

# Function to handle cleanup on exit
cleanup() {
    echo -e "\n✅ Server stopped. Logs are in test-runs/most_recent/"

    # Kill any existing processes on port 9323 (playwright)
    # echo "Stopping any processes on port 9323  (playwright)..."
    # kill -9 $(lsof -ti :9323) 2>/dev/null || true

}

# Set up trap to run cleanup on script exit
trap cleanup EXIT INT TERM

# Clean Redis queues
echo "Cleaning Redis queues..."
node scripts/clean-all-jobs.js 2>/dev/null || echo "No jobs to clean"

# Clean environment
unset CLAUDE_CODE_ENTRYPOINT
unset CLAUDECODE

# Rebuild TypeScript
echo "Building TypeScript..."
npm run build


# Kill any existing processes on port 8080
# echo "Stopping any processes on port 8080..."
# kill -9 $(lsof -ti :8080) 2>/dev/null || true

# # Start webhook server in background
# echo -e "\n🚀 Starting webhook server on port 8080..."
# cd webhook-receiver
# node server.js 2>&1 | tee "../test-runs/most_recent/dev-webhook.log" &
# WEBHOOK_PID=$!
# cd ..

# # Give webhook server time to start
# sleep 2

# Start main server
echo -e "\n🚀 Starting main server in stream mode..."
echo "ARCH_MODE=stream"
echo "Working directory: $(pwd)"
echo "Main server logs: test-runs/most_recent/dev-server.log"
echo "Webhook logs: test-runs/most_recent/dev-webhook.log"
echo ""

# Start main server and save logs
PORT=8081 npm start 2>&1 | tee "test-runs/most_recent/dev-server.log"
