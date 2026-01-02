#!/bin/bash
#
# TheiaCast Client Uninstallation Script
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

INSTALL_DIR="/opt/theiacast-client"
SERVICE_NAME="theiacast-client"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo -e "${GREEN}Uninstalling TheiaCast Client...${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: This script must be run as root${NC}"
  echo "Please run: sudo $0"
  exit 1
fi

# Stop and disable service
if systemctl is-active --quiet ${SERVICE_NAME}; then
  echo "Stopping ${SERVICE_NAME} service..."
  systemctl stop ${SERVICE_NAME}
fi

if systemctl is-enabled --quiet ${SERVICE_NAME}; then
  echo "Disabling ${SERVICE_NAME} service..."
  systemctl disable ${SERVICE_NAME}
fi

# Remove service file
if [ -f "${SERVICE_FILE}" ]; then
  echo "Removing service file..."
  rm -f ${SERVICE_FILE}
  systemctl daemon-reload
fi

# Remove installation directory
if [ -d "${INSTALL_DIR}" ]; then
  echo "Removing installation directory..."
  rm -rf ${INSTALL_DIR}
fi

echo -e "${GREEN}Uninstallation complete!${NC}"
