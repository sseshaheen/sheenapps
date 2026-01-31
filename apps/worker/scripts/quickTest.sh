#!/bin/bash

# Quick test script for Claude Worker
# Usage: ./scripts/quickTest.sh

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables
source .env

# Default values
WORKER_URL="${WORKER_URL:-http://localhost:3000}"
USER_ID="test-user-$(date +%s)"
PROJECT_ID="saas-landing-$(date +%s)"

echo -e "${YELLOW}🧪 Testing Claude Worker${NC}"
echo "================================"
echo "Worker URL: $WORKER_URL"
echo "User ID: $USER_ID"
echo "Project ID: $PROJECT_ID"
echo "================================"

# Test 1: Create initial build
echo -e "\n${YELLOW}Test 1: Creating initial build...${NC}"

PAYLOAD='{
  "userId": "'$USER_ID'",
  "projectId": "'$PROJECT_ID'",
  "prompt": "Create a minimal SaaS landing page with Hero section, 3 features, and pricing table. Use React + Vite + Tailwind CSS v4.",
  "framework": "react"
}'

SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" | cut -d' ' -f2)

RESPONSE=$(curl -s -X POST "$WORKER_URL/build-preview-for-new-project" \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -d "$PAYLOAD")

echo "Response: $RESPONSE"

# Extract job ID and version ID
JOB_ID=$(echo "$RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
VERSION_ID=$(echo "$RESPONSE" | grep -o '"versionId":"[^"]*"' | cut -d'"' -f4)

if [ -n "$JOB_ID" ]; then
  echo -e "${GREEN}✅ Build job created successfully!${NC}"
  echo "Job ID: $JOB_ID"
  echo "Version ID: $VERSION_ID"
else
  echo -e "${RED}❌ Failed to create build job${NC}"
  exit 1
fi

# Wait for build to complete
echo -e "\n${YELLOW}Waiting 30 seconds for build to complete...${NC}"
sleep 30

# Test 2: Check preview URL
echo -e "\n${YELLOW}Test 2: Checking preview URL...${NC}"

PREVIEW_RESPONSE=$(curl -s "$WORKER_URL/preview/$USER_ID/$PROJECT_ID/latest")
echo "Preview Response: $PREVIEW_RESPONSE"

PREVIEW_URL=$(echo "$PREVIEW_RESPONSE" | grep -o '"previewUrl":"[^"]*"' | cut -d'"' -f4)

if [ -n "$PREVIEW_URL" ]; then
  echo -e "${GREEN}✅ Preview URL retrieved!${NC}"
  echo "Preview URL: $PREVIEW_URL"
else
  echo -e "${YELLOW}⚠️  Preview URL not yet available${NC}"
fi

# Test 3: List versions
echo -e "\n${YELLOW}Test 3: Listing project versions...${NC}"

VERSIONS_RESPONSE=$(curl -s "$WORKER_URL/versions/$USER_ID/$PROJECT_ID")
VERSION_COUNT=$(echo "$VERSIONS_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)

echo "Total versions: $VERSION_COUNT"

# Test 4: Rebuild with modification
if [ -n "$VERSION_ID" ]; then
  echo -e "\n${YELLOW}Test 4: Testing rebuild...${NC}"
  
  REBUILD_PAYLOAD='{
    "userId": "'$USER_ID'",
    "projectId": "'$PROJECT_ID'",
    "prompt": "Change the hero section background to a gradient from blue to purple",
    "baseVersionId": "'$VERSION_ID'"
  }'
  
  REBUILD_SIGNATURE=$(echo -n "$REBUILD_PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" | cut -d' ' -f2)
  
  REBUILD_RESPONSE=$(curl -s -X POST "$WORKER_URL/rebuild-preview" \
    -H "Content-Type: application/json" \
    -H "x-sheen-signature: $REBUILD_SIGNATURE" \
    -d "$REBUILD_PAYLOAD")
  
  echo "Rebuild Response: $REBUILD_RESPONSE"
fi

echo -e "\n${GREEN}✅ All tests completed!${NC}"
echo "================================"
echo "Summary:"
echo "- User ID: $USER_ID"
echo "- Project ID: $PROJECT_ID"
echo "- Initial Version: $VERSION_ID"
echo "- Preview URL: ${PREVIEW_URL:-'Building...'}"
echo "================================"