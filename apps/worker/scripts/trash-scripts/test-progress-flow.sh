#!/bin/bash

# Test progress tracking flow

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=== Testing Progress Tracking Flow ==="

# Generate test IDs
USER_ID="test-user-$(date +%s)"
PROJECT_ID="test-project-$(date +%s)"
BUILD_ID=""

# 1. Create test directory
TEST_DIR="$HOME/projects/$USER_ID/$PROJECT_ID"
echo -e "${YELLOW}Creating test directory: $TEST_DIR${NC}"
mkdir -p "$TEST_DIR"

# 2. Create test prompt
PROMPT="Create a simple webpage with a heading 'Progress Test' and a paragraph explaining this is a test of the progress tracking system"

# 3. Prepare request body
BODY=$(cat <<EOF
{
  "userId": "$USER_ID",
  "projectId": "$PROJECT_ID",
  "prompt": "$PROMPT"
}
EOF
)

# 4. Generate signature
# Source .env file if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi
SHARED_SECRET=${SHARED_SECRET:-"production-secret-key-with-sufficient-entropy"}
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SHARED_SECRET" | cut -d' ' -f2)

echo -e "${YELLOW}Starting build preview request...${NC}"

# 5. Make build preview request
RESPONSE=$(curl -s -X POST http://localhost:3000/build-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "X-Sheen-Signature: $SIGNATURE" \
  -d "$BODY")

echo "Build Response: $RESPONSE"

# Extract jobId as buildId (jobId is used as buildId in the system)
BUILD_ID=$(echo "$RESPONSE" | grep -o '"jobId":"[^"]*' | cut -d'"' -f4)

if [ -z "$BUILD_ID" ]; then
  echo -e "${RED}Failed to get jobId from response${NC}"
  exit 1
fi

echo -e "${GREEN}Build started with ID: $BUILD_ID${NC}"

# 6. Poll for progress
echo -e "\n${YELLOW}Monitoring progress...${NC}"

LAST_EVENT_ID=0
COMPLETED=false
TIMEOUT=120 # 2 minutes timeout
START_TIME=$(date +%s)

while [ "$COMPLETED" != "true" ]; do
  # Check timeout
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))
  
  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo -e "${RED}Timeout waiting for build to complete${NC}"
    break
  fi
  
  # Get events since last ID
  EVENTS_RESPONSE=$(curl -s "http://localhost:3000/api/builds/$BUILD_ID/events?lastEventId=$LAST_EVENT_ID")
  
  # Extract events
  EVENTS=$(echo "$EVENTS_RESPONSE" | grep -o '"events":\[[^]]*\]' | sed 's/"events"://')
  NEW_LAST_EVENT_ID=$(echo "$EVENTS_RESPONSE" | grep -o '"lastEventId":[0-9]*' | cut -d':' -f2)
  
  if [ "$NEW_LAST_EVENT_ID" != "$LAST_EVENT_ID" ]; then
    # Parse and display new events
    echo "$EVENTS" | grep -o '{[^}]*}' | while read -r event; do
      TYPE=$(echo "$event" | grep -o '"type":"[^"]*' | cut -d'"' -f4)
      MESSAGE=$(echo "$event" | grep -o '"message":"[^"]*' | cut -d'"' -f4)
      TIMESTAMP=$(echo "$event" | grep -o '"timestamp":"[^"]*' | cut -d'"' -f4)
      
      case "$TYPE" in
        "plan_started")
          echo -e "${YELLOW}[$(date -d "$TIMESTAMP" +%H:%M:%S 2>/dev/null || date +%H:%M:%S)] Planning: $MESSAGE${NC}"
          ;;
        "plan_generated")
          echo -e "${GREEN}[$(date -d "$TIMESTAMP" +%H:%M:%S 2>/dev/null || date +%H:%M:%S)] Plan ready: $MESSAGE${NC}"
          ;;
        "task_started")
          echo -e "${YELLOW}[$(date -d "$TIMESTAMP" +%H:%M:%S 2>/dev/null || date +%H:%M:%S)] Task: $MESSAGE${NC}"
          ;;
        "task_completed")
          echo -e "${GREEN}[$(date -d "$TIMESTAMP" +%H:%M:%S 2>/dev/null || date +%H:%M:%S)] ✓ Task done: $MESSAGE${NC}"
          ;;
        "deploy_started")
          echo -e "${YELLOW}[$(date -d "$TIMESTAMP" +%H:%M:%S 2>/dev/null || date +%H:%M:%S)] Deploying: $MESSAGE${NC}"
          ;;
        "deploy_completed")
          PREVIEW_URL=$(echo "$event" | grep -o '"previewUrl":"[^"]*' | cut -d'"' -f4)
          echo -e "${GREEN}[$(date -d "$TIMESTAMP" +%H:%M:%S 2>/dev/null || date +%H:%M:%S)] ✓ Deployed: $PREVIEW_URL${NC}"
          COMPLETED=true
          ;;
        "task_failed"|"deploy_failed")
          ERROR=$(echo "$event" | grep -o '"error":"[^"]*' | cut -d'"' -f4)
          echo -e "${RED}[$(date -d "$TIMESTAMP" +%H:%M:%S 2>/dev/null || date +%H:%M:%S)] ✗ Failed: $ERROR${NC}"
          COMPLETED=true
          ;;
        *)
          echo "[$(date -d "$TIMESTAMP" +%H:%M:%S 2>/dev/null || date +%H:%M:%S)] $TYPE: $MESSAGE"
          ;;
      esac
    done
    
    LAST_EVENT_ID=$NEW_LAST_EVENT_ID
  fi
  
  # Check final status
  STATUS_RESPONSE=$(curl -s "http://localhost:3000/api/builds/$BUILD_ID/status")
  STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
  PROGRESS=$(echo "$STATUS_RESPONSE" | grep -o '"progress":[0-9]*' | cut -d':' -f2)
  
  # Display progress bar
  printf "\rProgress: ["
  FILLED=$((PROGRESS / 5))
  for i in $(seq 1 20); do
    if [ $i -le $FILLED ]; then
      printf "="
    else
      printf " "
    fi
  done
  printf "] $PROGRESS%%  "
  
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    COMPLETED=true
    echo "" # New line after progress bar
  fi
  
  sleep 1
done

# 7. Final status
echo -e "\n${YELLOW}=== Final Build Status ===${NC}"
curl -s "http://localhost:3000/api/builds/$BUILD_ID/status" | python3 -m json.tool

# Cleanup
echo -e "\n${YELLOW}Cleaning up test directory...${NC}"
rm -rf "$TEST_DIR"

echo -e "${GREEN}Test completed!${NC}"