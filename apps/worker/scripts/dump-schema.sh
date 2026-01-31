#!/bin/bash

# PostgreSQL Schema Dump Script
# Backs up complete database schema (no data) including:
# - Tables, indexes, constraints
# - Views, functions, triggers
# - Sequences, types (ENUMs)
# - Row Level Security policies
# - Extensions, schemas

set -e  # Exit on error

# Load .env file if it exists and DATABASE_URL is not already set
if [ -z "$DATABASE_URL" ] && [ -f ".env" ]; then
  echo "Loading DATABASE_URL from .env file..."
  export $(grep "^DATABASE_URL=" .env | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  echo "Usage: DATABASE_URL='postgresql://...' ./scripts/dump-schema.sh"
  echo "Or create a .env file with DATABASE_URL variable"
  exit 1
fi

# Create dumps directory if it doesn't exist
DUMP_DIR="./dumps"
mkdir -p "$DUMP_DIR"

# Generate filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="$DUMP_DIR/schema_dump_$TIMESTAMP.sql"

echo "Starting schema dump..."
echo "Output file: $DUMP_FILE"

# Run pg_dump with schema-only flags
# --schema-only (-s): Only dump schema, no data
# --no-owner: Don't include ownership commands (SET ROLE)
# --no-privileges: Don't include GRANT/REVOKE commands
# --verbose: Show progress
# --file: Output file

pg_dump "$DATABASE_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --verbose \
  --file="$DUMP_FILE"

echo ""
echo "✅ Schema dump completed successfully!"
echo "📁 File: $DUMP_FILE"
echo "📊 Size: $(du -h "$DUMP_FILE" | cut -f1)"
echo ""
echo "To restore this schema to a database:"
echo "  psql \$DATABASE_URL -f $DUMP_FILE"
