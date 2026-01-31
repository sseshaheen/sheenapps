#\!/bin/bash

# Configuration
SECRET="9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs="
URL="http://localhost:3000/build-preview-for-new-project"
USER_ID="test-user-modular"
PROJECT_ID="test-project-$(date +%s)"
PROMPT="Create a simple landing page with a hero section and a contact form"

# Create request body without any extra whitespace
BODY='{"userId":"'$USER_ID'","projectId":"'$PROJECT_ID'","prompt":"'$PROMPT'"}'  

# Generate signature using Node.js to match server exactly
SIGNATURE=$(node -e "const crypto = require('crypto'); console.log(crypto.createHmac('sha256', '$SECRET').update('$BODY').digest('hex'))")

# Make request
echo "Testing full modular flow..."
echo "Request body: $BODY"
echo "Signature: $SIGNATURE"
echo ""

curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -d "$BODY" | jq .
