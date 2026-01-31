#!/bin/bash

# Script to help set up DATABASE_URL from Supabase credentials

echo "Setting up DATABASE_URL for Supabase..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Copy .env.example to .env first."
    exit 1
fi

# Check if DATABASE_URL is already set
if grep -q "^DATABASE_URL=" .env; then
    echo "DATABASE_URL is already set in .env"
    echo "Current value:"
    grep "^DATABASE_URL=" .env
    exit 0
fi

# Extract Supabase URL
SUPABASE_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" .env | cut -d'=' -f2)
if [ -z "$SUPABASE_URL" ]; then
    echo "Error: NEXT_PUBLIC_SUPABASE_URL not found in .env"
    exit 1
fi

# Extract project ref from Supabase URL
PROJECT_REF=$(echo $SUPABASE_URL | sed 's/https:\/\/\(.*\)\.supabase\.co/\1/')

# Construct DATABASE_URL
# Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
echo ""
echo "Your Supabase project reference is: $PROJECT_REF"
echo ""
echo "To set DATABASE_URL, you need your database password from Supabase dashboard."
echo "Go to: https://supabase.com/dashboard/project/$PROJECT_REF/settings/database"
echo ""
echo "Add this to your .env file:"
echo "DATABASE_URL=postgresql://postgres.$PROJECT_REF:[YOUR-DATABASE-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
echo ""
echo "Replace [YOUR-DATABASE-PASSWORD] with your actual database password."
echo ""
echo "For connection pooling (recommended), use port 5432."
echo "For direct connection, use port 6543."