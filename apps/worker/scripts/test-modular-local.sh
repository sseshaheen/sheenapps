#!/bin/bash

# Test script for modular architecture locally

echo "🧪 Testing Modular Architecture Locally"
echo "======================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found"
    exit 1
fi

# Set architecture mode to modular
echo "Setting ARCH_MODE=modular in .env..."
if grep -q "^ARCH_MODE=" .env; then
    sed -i.bak 's/^ARCH_MODE=.*/ARCH_MODE=modular/' .env
else
    echo "ARCH_MODE=modular" >> .env
fi

# Build the project
echo ""
echo "Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "✅ Build successful!"
echo ""
echo "To test the modular system:"
echo "1. Start the server: npm start"
echo "2. In another terminal, run a test request:"
echo ""
echo "curl -X POST http://localhost:3000/api/preview/build \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'x-sheen-signature: <signature>' \\"
echo "  -d '{"
echo "    \"userId\": \"test-user\","
echo "    \"projectId\": \"test-project\","
echo "    \"prompt\": \"Create a simple hello world page\","
echo "    \"framework\": \"nextjs\""
echo "  }'"
echo ""
echo "3. Watch the logs for:"
echo "   - '🏗️  Architecture mode: MODULAR'"
echo "   - '[MODULAR] Enqueuing build'"
echo "   - '[PLAN] Completed'"
echo "   - '[TASK] Completed'"
echo ""
echo "To switch back to monolith:"
echo "  Change ARCH_MODE=monolith in .env"