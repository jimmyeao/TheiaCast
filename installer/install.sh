#!/bin/bash

# PDS Automated Installer for Linux/macOS

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."

echo "==========================================="
echo "   PDS Kiosk System - Automated Installer  "
echo "==========================================="
echo ""

# 1. Check Prerequisites
echo "--- Step 1: Checking Prerequisites ---"

if ! command -v dotnet &> /dev/null; then
    echo "Error: .NET SDK is not installed."
    echo "Please install .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0"
    exit 1
else
    echo "Found .NET: $(dotnet --version)"
fi

if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js (LTS): https://nodejs.org/"
    exit 1
else
    echo "Found Node.js: $(node -v)"
fi

echo "Prerequisites check complete."
echo ""

# 2. Install Backend Dependencies
echo "--- Step 2: Installing Backend Dependencies ---"
BACKEND_PATH="$PROJECT_ROOT/src/PDS.Api"
if [ -d "$BACKEND_PATH" ]; then
    echo "Restoring .NET packages in $BACKEND_PATH..."
    cd "$BACKEND_PATH"
    dotnet restore
    echo "Backend dependencies installed."
else
    echo "Error: Backend directory not found at $BACKEND_PATH"
fi
echo ""

# 3. Install Frontend Dependencies
echo "--- Step 3: Installing Frontend Dependencies ---"
FRONTEND_PATH="$PROJECT_ROOT/frontend"
if [ -d "$FRONTEND_PATH" ]; then
    echo "Installing NPM packages in $FRONTEND_PATH..."
    cd "$FRONTEND_PATH"
    npm install
    echo "Frontend dependencies installed."
else
    echo "Error: Frontend directory not found at $FRONTEND_PATH"
fi
echo ""

# 4. Install Client Dependencies
echo "--- Step 4: Installing Client Dependencies ---"
CLIENT_PATH="$PROJECT_ROOT/client"
if [ -d "$CLIENT_PATH" ]; then
    echo "Installing NPM packages in $CLIENT_PATH..."
    cd "$CLIENT_PATH"
    npm install
    echo "Client dependencies installed."
else
    echo "Error: Client directory not found at $CLIENT_PATH"
fi
echo ""

echo "==========================================="
echo "   Installation Complete!                  "
echo "==========================================="
echo "You can now run the system."
