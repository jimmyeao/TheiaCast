#!/bin/bash
#
# TheiaCast Client Installation Script
# This script installs the TheiaCast Kiosk Client on Linux/Raspberry Pi
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/theiacast-client"
SERVICE_NAME="theiacast-client"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}TheiaCast Client Installer${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: This script must be run as root${NC}"
  echo "Please run: sudo $0"
  exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}Node.js not found. Installing Node.js 20.x...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓${NC} Node.js ${NODE_VERSION} found"

# Detect system architecture early
ARCH=$(uname -m)
echo "Detected architecture: ${ARCH}"

# Stop existing service if running
if systemctl is-active --quiet ${SERVICE_NAME}; then
  echo "Stopping existing ${SERVICE_NAME} service..."
  systemctl stop ${SERVICE_NAME}
fi

# Create installation directory
echo "Creating installation directory at ${INSTALL_DIR}..."
mkdir -p ${INSTALL_DIR}

# Copy files to installation directory
echo "Copying files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

# Copy dist files
if [ -d "${PACKAGE_DIR}/dist" ]; then
  cp -r ${PACKAGE_DIR}/dist/* ${INSTALL_DIR}/
else
  echo -e "${RED}Error: dist directory not found at ${PACKAGE_DIR}/dist${NC}"
  exit 1
fi

# Copy package.json if it exists
if [ -f "${PACKAGE_DIR}/package.json" ]; then
  cp ${PACKAGE_DIR}/package.json ${INSTALL_DIR}/
fi

# Copy pre-bundled node_modules if they exist (includes @theiacast/shared)
HAS_PREBUNDLED_DEPS=false
if [ -d "${PACKAGE_DIR}/node_modules" ]; then
  echo "Copying pre-bundled dependencies..."
  cp -r ${PACKAGE_DIR}/node_modules ${INSTALL_DIR}/
  HAS_PREBUNDLED_DEPS=true
fi

# Install dependencies only if not pre-bundled
if [ "$HAS_PREBUNDLED_DEPS" = true ]; then
  echo -e "${GREEN}✓${NC} Using pre-bundled dependencies (including @theiacast/shared)"
  echo "Skipping npm install to avoid registry lookups..."
elif [ -f "${INSTALL_DIR}/package.json" ]; then
  echo "Installing Node.js dependencies from npm..."
  cd ${INSTALL_DIR}
  # Skip Puppeteer's Chromium download on ARM (we use system chromium)
  # On x64, let Puppeteer download its own Chrome
  if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" || "$ARCH" == "armv7l" ]]; then
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install --production --no-optional
  else
    npm install --production --no-optional
  fi
fi

# Detect the actual user (not root)
ACTUAL_USER=${SUDO_USER:-$(who am i | awk '{print $1}')}
ACTUAL_USER=${ACTUAL_USER:-$(logname 2>/dev/null)}
USER_HOME=$(eval echo ~${ACTUAL_USER})

if [ -z "$ACTUAL_USER" ] || [ "$ACTUAL_USER" = "root" ]; then
  echo -e "${RED}Error: Cannot detect non-root user${NC}"
  echo "Please run as: sudo -u <username> $0"
  exit 1
fi

echo "Installing for user: $ACTUAL_USER"
echo "User home: $USER_HOME"

# Configure Chromium based on architecture BEFORE creating .env file
CHROMIUM_EXECUTABLE_PATH=""
if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" || "$ARCH" == "armv7l" ]]; then
  # ARM system (Raspberry Pi) - use system chromium
  echo "ARM system detected. Installing system Chromium package..."
  apt-get update -qq

  # Try different package names (varies by distribution)
  if apt-cache show chromium &> /dev/null; then
    echo "Installing chromium package..."
    apt-get install -y chromium
  elif apt-cache show chromium-browser &> /dev/null; then
    echo "Installing chromium-browser package..."
    apt-get install -y chromium-browser
  else
    echo -e "${YELLOW}Warning: Could not find chromium package in apt${NC}"
  fi

  # Find chromium executable
  if command -v chromium &> /dev/null; then
    CHROMIUM_EXECUTABLE_PATH=$(which chromium)
    echo -e "${GREEN}✓${NC} System Chromium installed at: ${CHROMIUM_EXECUTABLE_PATH}"
  elif command -v chromium-browser &> /dev/null; then
    CHROMIUM_EXECUTABLE_PATH=$(which chromium-browser)
    echo -e "${GREEN}✓${NC} System Chromium installed at: ${CHROMIUM_EXECUTABLE_PATH}"
  else
    echo -e "${YELLOW}Warning: Could not find chromium executable${NC}"
    echo -e "${YELLOW}The client may fail to start. Please install chromium manually:${NC}"
    echo -e "${YELLOW}  sudo apt-get install chromium${NC}"
  fi
else
  # x64 system - let Puppeteer download its own Chrome
  echo "x64 system detected. Puppeteer will download Chrome automatically."
  CHROMIUM_EXECUTABLE_PATH=""
fi

# Load existing configuration if available
EXISTING_SERVER_URL=""
EXISTING_DEVICE_ID=""
EXISTING_DEVICE_TOKEN=""

if [ -f "${INSTALL_DIR}/.env" ]; then
  echo "Found existing configuration, loading defaults..."
  # Read existing values (using grep and cut to safely extract values)
  EXISTING_SERVER_URL=$(grep "^SERVER_URL=" "${INSTALL_DIR}/.env" 2>/dev/null | cut -d'=' -f2-)
  EXISTING_DEVICE_ID=$(grep "^DEVICE_ID=" "${INSTALL_DIR}/.env" 2>/dev/null | cut -d'=' -f2-)
  EXISTING_DEVICE_TOKEN=$(grep "^DEVICE_TOKEN=" "${INSTALL_DIR}/.env" 2>/dev/null | cut -d'=' -f2-)
fi

# NOW prompt for configuration (after CHROMIUM_EXECUTABLE_PATH is set)
echo ""
echo -e "${YELLOW}Configuration:${NC}"

# Prompt with existing values as defaults
if [ -n "$EXISTING_SERVER_URL" ]; then
  read -p "Enter Server URL [$EXISTING_SERVER_URL]: " SERVER_URL
  SERVER_URL=${SERVER_URL:-$EXISTING_SERVER_URL}
else
  read -p "Enter Server URL (e.g., http://192.168.0.11:5001): " SERVER_URL
fi

if [ -n "$EXISTING_DEVICE_ID" ]; then
  read -p "Enter Device ID [$EXISTING_DEVICE_ID]: " DEVICE_ID
  DEVICE_ID=${DEVICE_ID:-$EXISTING_DEVICE_ID}
else
  read -p "Enter Device ID (e.g., $(hostname)): " DEVICE_ID
  DEVICE_ID=${DEVICE_ID:-$(hostname)}
fi

if [ -n "$EXISTING_DEVICE_TOKEN" ]; then
  read -p "Enter Device Token [$EXISTING_DEVICE_TOKEN]: " DEVICE_TOKEN
  DEVICE_TOKEN=${DEVICE_TOKEN:-$EXISTING_DEVICE_TOKEN}
else
  read -p "Enter Device Token: " DEVICE_TOKEN
fi

# Create .env file with the now-set CHROMIUM_EXECUTABLE_PATH
cat > ${INSTALL_DIR}/.env << EOF
SERVER_URL=${SERVER_URL}
DEVICE_ID=${DEVICE_ID}
DEVICE_TOKEN=${DEVICE_TOKEN}
LOG_LEVEL=info
SCREENSHOT_INTERVAL=300000
HEALTH_REPORT_INTERVAL=60000
DISPLAY_WIDTH=800
DISPLAY_HEIGHT=480
HEADLESS=false
KIOSK_MODE=true
PUPPETEER_EXECUTABLE_PATH=${CHROMIUM_EXECUTABLE_PATH}
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
EOF

echo -e "${GREEN}✓${NC} Configuration saved to ${INSTALL_DIR}/.env"
if [ -n "$CHROMIUM_EXECUTABLE_PATH" ]; then
  echo -e "${GREEN}✓${NC} Configured to use system Chromium at ${CHROMIUM_EXECUTABLE_PATH}"
fi

# Set proper ownership
chown -R ${ACTUAL_USER}:${ACTUAL_USER} ${INSTALL_DIR}

# Create systemd service
echo "Creating systemd service..."
cat > ${SERVICE_FILE} << EOF
[Unit]
Description=TheiaCast Kiosk Client
After=network.target

[Service]
Type=simple
User=${ACTUAL_USER}
Group=${ACTUAL_USER}
WorkingDirectory=${INSTALL_DIR}
Environment="NODE_ENV=production"
Environment="DISPLAY=:0"
Environment="XAUTHORITY=${USER_HOME}/.Xauthority"
Environment="HOME=${USER_HOME}"
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/node ${INSTALL_DIR}/index.js
Restart=always
RestartSec=10
# Ensure all child processes (Chromium) are killed when service stops
KillMode=control-group
KillSignal=SIGTERM
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

# Set permissions
chmod +x ${INSTALL_DIR}/index.js 2>/dev/null || true
chmod 644 ${SERVICE_FILE}

# Reload systemd
systemctl daemon-reload

# Enable and start service
echo "Enabling ${SERVICE_NAME} service..."
systemctl enable ${SERVICE_NAME}

echo "Starting ${SERVICE_NAME} service..."
systemctl start ${SERVICE_NAME}

# Check status
sleep 2
if systemctl is-active --quiet ${SERVICE_NAME}; then
  echo ""
  echo -e "${GREEN}================================${NC}"
  echo -e "${GREEN}Installation Complete!${NC}"
  echo -e "${GREEN}================================${NC}"
  echo ""
  echo "Service Status:"
  systemctl status ${SERVICE_NAME} --no-pager -l
  echo ""
  echo "Useful commands:"
  echo "  View logs:    sudo journalctl -u ${SERVICE_NAME} -f"
  echo "  Stop service: sudo systemctl stop ${SERVICE_NAME}"
  echo "  Start service: sudo systemctl start ${SERVICE_NAME}"
  echo "  Restart service: sudo systemctl restart ${SERVICE_NAME}"
  echo "  View status: sudo systemctl status ${SERVICE_NAME}"
  echo ""
else
  echo -e "${RED}Warning: Service failed to start${NC}"
  echo "Check logs with: sudo journalctl -u ${SERVICE_NAME} -n 50"
  exit 1
fi
