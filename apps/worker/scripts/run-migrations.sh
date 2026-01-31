#!/bin/bash

# Script to run database migrations

echo "🗄️  Running database migrations..."
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in environment"
    echo "Please set DATABASE_URL in your .env file"
    exit 1
fi

echo "📋 Found migrations:"
ls -1 src/db/migrations/*.sql
echo ""

# Run each migration
for migration in src/db/migrations/*.sql; do
    echo "▶️  Running: $(basename $migration)"
    
    # Use psql to run the migration
    if command -v psql &> /dev/null; then
        psql "$DATABASE_URL" -f "$migration"
        if [ $? -eq 0 ]; then
            echo "✅ Success: $(basename $migration)"
        else
            echo "❌ Failed: $(basename $migration)"
            exit 1
        fi
    else
        echo "❌ Error: psql command not found"
        echo "Please install PostgreSQL client tools"
        exit 1
    fi
    echo ""
done

echo "✅ All migrations completed successfully!"