#!/bin/bash

# 🧪 Complete Webhook Testing Script

echo "🚀 Setting up Claude Worker Webhook Testing"
echo "═══════════════════════════════════════════"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Check if webhook receiver exists
if [ ! -d "webhook-receiver" ]; then
    echo -e "${RED}❌ webhook-receiver directory not found${NC}"
    echo "Make sure you're in the Claude Worker root directory"
    exit 1
fi

# 2. Install webhook receiver dependencies
echo -e "${YELLOW}📦 Installing webhook receiver dependencies...${NC}"
cd webhook-receiver
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found in webhook-receiver${NC}"
    exit 1
fi

npm install

# 3. Check parent .env file
cd ..
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo "Please create a .env file with SHARED_SECRET"
    exit 1
fi

# 4. Add webhook configuration to .env if not present
if ! grep -q "WEBHOOK_SECRET" .env; then
    echo -e "${YELLOW}🔧 Adding WEBHOOK_SECRET to .env...${NC}"
    echo "WEBHOOK_SECRET=test-webhook-secret-123" >> .env
fi

if ! grep -q "MAIN_APP_WEBHOOK_URL" .env; then
    echo -e "${YELLOW}🔧 Adding MAIN_APP_WEBHOOK_URL to .env...${NC}"
    echo "MAIN_APP_WEBHOOK_URL=http://localhost:8080/webhook" >> .env
fi

# 5. Display configuration
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Configuration added to .env:"
echo "  MAIN_APP_WEBHOOK_URL=http://localhost:8080/webhook"
echo "  WEBHOOK_SECRET=test-webhook-secret-123"
echo ""

# 6. Instructions
echo -e "${YELLOW}📋 TESTING STEPS:${NC}"
echo ""
echo "1. Start the webhook receiver:"
echo "   cd webhook-receiver && npm start"
echo ""
echo "2. In another terminal, restart your Claude Worker:"
echo "   npm run dev"
echo ""
echo "3. Test with Postman:"
echo "   - Send 'Build Preview (New Project)'"
echo "   - Watch webhook receiver console for events"
echo "   - Monitor with 'Get Build Status'"
echo ""
echo "🎯 Expected webhook events:"
echo "   plan_started → plan_generated → task_started → task_completed → deploy_started → deploy_completed"
echo ""
echo -e "${GREEN}🚀 Ready to test webhooks!${NC}"