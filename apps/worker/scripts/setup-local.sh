#!/bin/bash
# Local development setup script

echo "Setting up local development environment..."

# Check if .env exists
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "⚠️  Please edit .env with your configuration values"
  echo ""
  echo "WHERE TO FIND YOUR VALUES:"
  echo "1. Copy from existing .env.backup if you have one"
  echo "2. Check with your team lead for shared secrets"
  echo "3. Get Cloudflare values from Cloudflare Dashboard"
  echo "4. See .env.example comments for detailed instructions"
  echo ""
else
  echo "✅ .env already exists"
fi

# Check for logs directory
if [ ! -d logs ]; then
  echo "Creating logs directory..."
  mkdir -p logs
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the project
echo "Building project..."
npm run build

echo ""
echo "✅ Local setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your configuration (if not already done)"
echo "2. Run 'npm run validate:env' to check your configuration"
echo "3. Run 'npm run dev' to start development server"
echo ""
echo "Useful commands:"
echo "  npm run validate:env    - Check environment variables"
echo "  npm run check:conflicts - Check for configuration conflicts"
echo "  npm run env:reference   - Show where to find env values"
echo "  npm run env:migrate     - Migrate deprecated variables"