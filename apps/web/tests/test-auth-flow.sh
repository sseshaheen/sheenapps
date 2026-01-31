#!/bin/bash

# Auth Debug Test Script
# Tests the complete authentication flow with detailed logging

echo "🔍 Starting Authentication Flow Test"
echo "=================================="
echo ""

# Clear any existing cookies
rm -f /tmp/auth-test-cookies.txt

echo "1️⃣ Testing unauthenticated /api/auth/me call..."
curl -s "http://localhost:3000/api/auth/me" \
  --cookie-jar /tmp/auth-test-cookies.txt \
  | jq '.'
echo ""

echo "2️⃣ Testing unauthenticated dashboard access (should redirect)..."
curl -I "http://localhost:3000/en/dashboard" \
  --cookie-jar /tmp/auth-test-cookies.txt \
  2>/dev/null | grep -E "(Location|HTTP)"
echo ""

echo "3️⃣ Attempting login with credentials..."
curl -X POST "http://localhost:3000/api/auth/sign-in" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=shady.anwar1@gmail.com&password=Super1313&locale=en&returnTo=/en/dashboard" \
  --cookie-jar /tmp/auth-test-cookies.txt \
  --cookie /tmp/auth-test-cookies.txt \
  -w "\nHTTP Status: %{http_code}\nRedirect: %{redirect_url}\n" \
  -s | grep -E "(HTTP|Redirect)"
echo ""

echo "4️⃣ Checking cookies after login..."
if [ -f /tmp/auth-test-cookies.txt ]; then
  echo "Cookies saved:"
  cat /tmp/auth-test-cookies.txt | grep -v "^#"
else
  echo "No cookies saved"
fi
echo ""

echo "5️⃣ Testing authenticated /api/auth/me call..."
curl -s "http://localhost:3000/api/auth/me" \
  --cookie /tmp/auth-test-cookies.txt \
  | jq '.'
echo ""

echo "6️⃣ Testing authenticated dashboard access..."
curl -I "http://localhost:3000/en/dashboard" \
  --cookie /tmp/auth-test-cookies.txt \
  2>/dev/null | grep -E "(Location|HTTP)"
echo ""

echo "7️⃣ Testing debug auth endpoint..."
curl -s "http://localhost:3000/api/auth/debugauth" \
  --cookie /tmp/auth-test-cookies.txt \
  | jq '.'
echo ""

echo "✅ Test complete! Check server logs for detailed authentication flow."
echo ""

echo "📋 Manual Test Steps:"
echo "1. Update password in this script (line with YOUR_PASSWORD_HERE)"
echo "2. Run: chmod +x test-auth-flow.sh && ./test-auth-flow.sh"
echo "3. Open browser to http://localhost:3000/en/dashboard and refresh"
echo "4. Check server console for detailed logs"
