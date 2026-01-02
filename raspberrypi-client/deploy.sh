#!/bin/bash

# Kiosk Client Deployment Script
# This script prepares the client for deployment to Raspberry Pi
# Run this from the client directory

set -e

echo "🚀 Building client for deployment..."
echo ""

# Get the project root (parent of client)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure we're in the client directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run this script from the client directory"
    exit 1
fi

# Check if workspace dependencies are installed
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo "❌ Error: Dependencies not installed at root. Workspace node_modules not found."
    exit 1
fi

# Build shared package
echo "📦 Building shared package..."
cd "$PROJECT_ROOT/shared"
npm run build > /dev/null 2>&1
echo "  ✓ Done!"

# Build client
echo "🔨 Building client..."
cd "$CLIENT_DIR"
npm run build > /dev/null 2>&1
echo "  ✓ Done!"

# Create a tarball of the shared package
echo "📦 Packing shared package..."
cd "$PROJECT_ROOT/shared"
SHARED_TARBALL=$(npm pack 2>&1 | grep -E "^kiosk-shared-.*\.tgz$" | tail -1)
if [ -z "$SHARED_TARBALL" ]; then
    echo "❌ Error: Failed to create tarball"
    exit 1
fi
SHARED_TARBALL_PATH="$PROJECT_ROOT/shared/$SHARED_TARBALL"
echo "  ✓ Created: $SHARED_TARBALL"

# Create deployment directory
echo "📁 Creating deployment package..."
cd "$CLIENT_DIR"
DEPLOY_DIR="$CLIENT_DIR/deploy"
if [ -d "$DEPLOY_DIR" ]; then
    echo "  ⚠ Removing existing deploy folder..."
    rm -rf "$DEPLOY_DIR"
fi
mkdir -p "$DEPLOY_DIR"

# Copy necessary files
echo "📋 Copying files..."
cp -r "$CLIENT_DIR/dist" "$DEPLOY_DIR/"
cp "$CLIENT_DIR/package.json" "$DEPLOY_DIR/"
cp "$CLIENT_DIR/.env.example" "$DEPLOY_DIR/"
echo "  ✓ Copied dist/, package.json, .env.example"

if [ -f "$CLIENT_DIR/README.md" ]; then
    cp "$CLIENT_DIR/README.md" "$DEPLOY_DIR/"
    echo "  ✓ Copied README.md"
fi

# Install production dependencies in deployment folder
echo "📦 Installing production dependencies..."
cd "$DEPLOY_DIR"

# Install the shared package from tarball first
echo "  ➜ Installing @kiosk/shared from tarball..."
npm install "$SHARED_TARBALL_PATH" --save > /dev/null 2>&1

# Install other dependencies
echo "  ➜ Installing other dependencies..."
npm install --omit=dev > /dev/null 2>&1

# Clean up the tarball
rm -f "$SHARED_TARBALL_PATH"

echo ""
echo "✅ SUCCESS! Deployment package created in client/deploy/"
echo ""
echo "📦 Package contents:"
echo "  - dist/           (compiled JavaScript)"
echo "  - node_modules/   (production dependencies)"
echo "  - package.json    (package metadata)"
echo "  - .env.example    (configuration template)"
echo ""
echo "📋 Next steps:"
echo "  1. Copy the 'deploy' folder to your Raspberry Pi:"
echo "     scp -r deploy noroot@loungepi:~/kiosk-client"
echo ""
echo "  2. On the Pi, create .env from .env.example:"
echo "     cd ~/kiosk-client && cp .env.example .env && nano .env"
echo ""
echo "  3. Edit .env with your server details, then run:"
echo "     node dist/index.js"
echo ""
