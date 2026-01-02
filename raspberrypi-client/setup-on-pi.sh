#!/bin/bash

# Setup script to run ON the Raspberry Pi
# This will clone the repo and build everything needed

set -e

REPO_URL=${1:-"https://github.com/jimmyeao/PDS.git"}
INSTALL_DIR=${2:-"$HOME/kiosk"}

echo "🚀 Setting up Kiosk Client on Raspberry Pi"
echo "Repository: $REPO_URL"
echo "Install directory: $INSTALL_DIR"

# Install Node.js if not present
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Clone repository
if [ -d "$INSTALL_DIR" ]; then
  echo "📂 Directory exists, pulling latest changes..."
  cd "$INSTALL_DIR"
  git pull
else
  echo "📥 Cloning repository..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install and build shared package first
echo "📦 Installing shared package dependencies..."
cd shared
npm install --legacy-peer-deps
echo "🔧 Building shared package..."
npm run build
cd ..

# Install and build Raspberry Pi client (which will link to local shared package)
echo "📦 Installing Raspberry Pi client dependencies..."
cd raspberrypi-client
npm install --legacy-peer-deps
echo "🔧 Building Raspberry Pi client..."
npm run build

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cp .env.example .env
  echo ""
  echo "⚠️  IMPORTANT: Edit the .env file with your configuration:"
  echo "   nano $INSTALL_DIR/raspberrypi-client/.env"
  echo ""
fi

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

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit configuration: nano $INSTALL_DIR/raspberrypi-client/.env"
echo "2. Start service: sudo systemctl start $SERVICE_NAME"
echo ""
echo "To update in the future, run:"
echo "  curl -fsSL https://raw.githubusercontent.com/jimmyeao/PDS/main/raspberrypi-client/update-pi.sh | bash -s -- \"$INSTALL_DIR\" main"
