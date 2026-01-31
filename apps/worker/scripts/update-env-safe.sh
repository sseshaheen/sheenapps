#!/bin/bash
# Safe environment update script for production
# This script preserves existing working values and only adds new variables

set -e  # Exit on error

echo "=========================================="
echo "Safe Environment Configuration Update"
echo "=========================================="
echo ""

# Check if we have an existing .env
if [ ! -f .env ]; then
  echo "❌ ERROR: No existing .env file found!"
  echo "This script is for updating existing configurations."
  echo "If this is a new installation, use: cp .env.example .env"
  exit 1
fi

# Check if .env.example exists
if [ ! -f .env.example ]; then
  echo "❌ ERROR: No .env.example file found!"
  echo "Please ensure you've pulled the latest code from git."
  exit 1
fi

# Create backup
BACKUP_FILE=".env.backup.$(date +%Y%m%d-%H%M%S)"
cp .env "$BACKUP_FILE"
echo "✅ Created backup: $BACKUP_FILE"

# Find new variables
echo ""
echo "🔍 Scanning for new environment variables..."
echo ""

NEW_VARS=()
while IFS= read -r line; do
  # Skip comments and empty lines
  if [[ "$line" =~ ^#.*$ ]] || [[ -z "$line" ]]; then
    continue
  fi
  
  # Extract variable name
  if [[ "$line" =~ ^([A-Z_]+)= ]]; then
    var_name="${BASH_REMATCH[1]}"
    
    # Check if this variable exists in current .env
    if ! grep -q "^${var_name}=" .env; then
      NEW_VARS+=("$var_name")
      echo "  📝 New variable: $var_name"
    fi
  fi
done < .env.example

# Report findings
if [ ${#NEW_VARS[@]} -eq 0 ]; then
  echo "✅ No new variables found. Your .env is up to date!"
  echo ""
  echo "Running validation check..."
  npm run validate:env || echo "⚠️  Validation failed - check your configuration"
  exit 0
fi

echo ""
echo "📊 Found ${#NEW_VARS[@]} new variable(s) that need to be configured."
echo ""

# Add new variables to .env
echo "# New variables added on $(date)" >> .env
echo "" >> .env

for var in "${NEW_VARS[@]}"; do
  # Get the line from .env.example
  example_line=$(grep "^${var}=" .env.example)
  
  # Check if it's a placeholder value
  if [[ "$example_line" =~ COPY_YOUR_ACTUAL|UPDATE_WITH_YOUR ]]; then
    echo "# TODO: Replace placeholder value below" >> .env
    echo "$example_line" >> .env
    echo "  ⚠️  $var - Needs actual value (placeholder added)"
  else
    # It might have a sensible default
    echo "$example_line" >> .env
    echo "  ✅ $var - Added with default value"
  fi
done

echo ""
echo "=========================================="
echo ""

# Check if there are placeholders
if grep -q "COPY_YOUR_ACTUAL\|UPDATE_WITH_YOUR" .env; then
  echo "⚠️  ACTION REQUIRED: Some new variables have placeholder values"
  echo ""
  echo "Variables that need real values:"
  grep "COPY_YOUR_ACTUAL\|UPDATE_WITH_YOUR" .env | while read -r line; do
    if [[ "$line" =~ ^([A-Z_]+)= ]]; then
      echo "  - ${BASH_REMATCH[1]}"
    fi
  done
  echo ""
  echo "Please edit .env and replace the placeholder values."
  echo "To edit: nano .env"
  echo ""
  echo "To restore previous config: cp $BACKUP_FILE .env"
else
  echo "✅ All new variables have been added with default values."
  echo ""
  echo "Please review the changes:"
  echo "  diff $BACKUP_FILE .env"
  echo ""
  echo "If everything looks good, restart the application:"
  echo "  pm2 restart sheenapps-claude-worker --update-env"
fi

echo ""
echo "💡 Useful commands:"
echo "  npm run validate:env     - Validate configuration"
echo "  npm run check:conflicts  - Check for conflicts"
echo "  npm run env:reference    - See where to find values"
echo ""