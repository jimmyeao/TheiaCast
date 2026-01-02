#!/bin/bash

# Update script to run ON the Raspberry Pi
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jimmyeao/PDS/<branch>/raspberrypi-client/update-pi.sh | bash -s -- <install_dir> <branch>
# Defaults:
#   install_dir = $HOME/kiosk
#   branch = main

set -e

INSTALL_DIR=${1:-"$HOME/kiosk"}
BRANCH=${2:-"main"}

echo "🚀 Updating Kiosk Client on Raspberry Pi"
echo "Install directory: $INSTALL_DIR"
echo "Branch: $BRANCH"

if [ ! -d "$INSTALL_DIR" ]; then
  echo "❌ Install directory not found: $INSTALL_DIR"
  echo "Run setup first:"
  echo "  curl -fsSL https://raw.githubusercontent.com/jimmyeao/PDS/$BRANCH/raspberrypi-client/setup-on-pi.sh | bash -s -- https://github.com/jimmyeao/PDS.git \"$INSTALL_DIR\""
  exit 1
fi

cd "$INSTALL_DIR"

echo "📦 Ensuring git repo is present..."
if [ ! -d .git ]; then
  echo "❌ Not a git repository. Please run setup again."
  exit 1
fi

echo "🔄 Fetching latest..."
git fetch --all --prune

echo "📥 Checking out branch: $BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# Handle migration from old 'client' folder to 'raspberrypi-client'
if [ -d "client" ] && [ ! -d "raspberrypi-client" ]; then
  echo "🔄 Migrating from old 'client' folder structure..."
  echo "   Copying .env file if it exists..."
  if [ -f "client/.env" ]; then
    mkdir -p raspberrypi-client
    cp client/.env raspberrypi-client/.env
    echo "   ✓ .env file preserved"
  fi
  echo "   Note: Old 'client' folder found. Please remove it after verifying the new setup works."
fi

echo "📦 Rebuilding shared package..."
cd shared
npm install --legacy-peer-deps
npm run build

echo "📦 Rebuilding Raspberry Pi client..."
cd ../raspberrypi-client
npm install --legacy-peer-deps
npm run build

echo "🔌 Setting up systemd service..."

SERVICE_NAME="pds-client"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CURRENT_USER=$(whoami)
NODE_PATH=$(which node)

# Generate service file
cat <<EOF > /tmp/${SERVICE_NAME}.service
[Unit]
Description=PDS Kiosk Client
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${INSTALL_DIR}/raspberrypi-client
ExecStart=${NODE_PATH} dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
# Ensure all child processes (Chromium) are killed when service stops
KillMode=control-group
KillSignal=SIGTERM
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "📝 Installing service to ${SERVICE_FILE}..."
sudo mv /tmp/${SERVICE_NAME}.service ${SERVICE_FILE}
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
echo "✅ Service installed and enabled."

echo "🚀 Restarting service..."
sudo systemctl restart ${SERVICE_NAME}

echo "✨ Update complete! Client is running as a service."
