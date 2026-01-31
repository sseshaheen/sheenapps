#!/bin/bash

# Check build status
BUILD_ID="${1:-01K0T922A5JZSTH7A6N9D6XDQX}"

echo "Checking build status for: $BUILD_ID"
echo "====================================="
echo ""

# Get build status
curl -s -X GET "http://localhost:3000/api/builds/$BUILD_ID/status" | jq '.'

echo ""
echo "To see events, run: curl -s http://localhost:3000/api/builds/$BUILD_ID/events | jq '.'"