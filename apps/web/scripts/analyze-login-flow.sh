#!/bin/bash

# Login Flow Analysis Script
# Concatenates all files involved in the authentication flow for analysis

OUTPUT_FILE="login-flow-analysis.txt"
BASE_DIR="/Users/sh/Sites/sheenappsai"

echo "🔐 SheenApps Login Flow Complete Analysis" > "$OUTPUT_FILE"
echo "Generated on: $(date)" >> "$OUTPUT_FILE"
echo "=========================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Function to add file to analysis
add_file() {
    local file_path="$1"
    local description="$2"

    if [ -f "$BASE_DIR/$file_path" ]; then
        echo "📁 FILE: $file_path" >> "$OUTPUT_FILE"
        echo "📋 DESCRIPTION: $description" >> "$OUTPUT_FILE"
        echo "────────────────────────────────────────" >> "$OUTPUT_FILE"
        cat "$BASE_DIR/$file_path" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo "════════════════════════════════════════" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    else
        echo "❌ MISSING FILE: $file_path" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    fi
}

echo "🚀 CORE AUTHENTICATION API ROUTES" >> "$OUTPUT_FILE"
echo "==================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

add_file "src/app/api/auth/sign-in/route.ts" "Main login endpoint with header-based cookie adapter and Set-Cookie append fix"
add_file "src/app/api/auth/sign-up/route.ts" "Registration endpoint with proper cookie handling"
add_file "src/app/api/auth/sign-out/route.ts" "Logout endpoint"
add_file "src/app/api/auth/oauth/start/route.ts" "OAuth initiation with locale-aware returnTo and cookie fixes"
add_file "src/app/auth/callback/route.ts" "OAuth callback handler with session establishment and cookie transfer"
add_file "src/app/api/auth/me/route.ts" "Current user status endpoint"
add_file "src/app/api/auth/debugauth/route.ts" "Debug endpoint to verify cookie reading in RSC"

echo "🎨 UI COMPONENTS" >> "$OUTPUT_FILE"
echo "================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

add_file "src/components/auth/login-form.tsx" "Main login form with HTML POST and locale-aware paths"
add_file "src/components/auth/login-modal.tsx" "Login modal with real form submission (no fetch)"
add_file "src/components/auth/auth-layout.tsx" "Auth page wrapper layout"
add_file "src/app/[locale]/auth/login/page.tsx" "Login page with translation mapping for new reason codes"

echo "⚙️ SERVER INFRASTRUCTURE" >> "$OUTPUT_FILE"
echo "=========================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

add_file "src/lib/supabase-server.ts" "CRITICAL: Server Supabase clients with per-cookie API fix for RSC"
add_file "src/lib/actions/auth-actions.ts" "Legacy server actions (mostly replaced by route handlers)"
add_file "middleware.ts" "Next.js route middleware"

echo "🗄️ AUTHENTICATION STORE" >> "$OUTPUT_FILE"
echo "========================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

add_file "src/store/index.ts" "Main store exports"
add_file "src/store/auth-store.ts" "Client auth store"
add_file "src/store/server-auth-store.ts" "Server auth store for server-side auth pattern"

echo "🛡️ PROTECTED ROUTES" >> "$OUTPUT_FILE"
echo "===================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

add_file "src/app/[locale]/(protected)/layout.tsx" "Protected layout with Node runtime configuration"
add_file "src/app/[locale]/(protected)/dashboard/(ui)/page.tsx" "Dashboard page with Node runtime"

echo "✅ Analysis complete! Generated: $OUTPUT_FILE"
echo "📊 File contains complete login flow implementation with all expert fixes applied."
