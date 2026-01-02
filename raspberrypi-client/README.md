# Kiosk Digital Signage Client

**Cross-platform client** for the Kiosk Digital Signage system.

Supports **Windows (Intel NUCs, PCs)**, **Linux**, and **Raspberry Pi**.

## Features

- **Cross-Platform**: Works on Windows, Linux, and Raspberry Pi
- **WebSocket Communication**: Real-time connection to backend server
- **Content Scheduling**: Automatic content rotation based on schedules
- **Offline Caching**: Automatically caches video content locally to reduce bandwidth and ensure smooth playback
- **Health Monitoring**: CPU, memory, and temperature reporting
- **Screenshot Capture**: Periodic and on-demand screenshots
- **Kiosk Mode**: Fullscreen display using Chrome/Chromium/Edge
- **Remote Control**: Restart, refresh, and navigate commands from admin UI

## Caching & Bandwidth

The client includes a robust caching system to minimize bandwidth usage and ensure playback stability:

- **Local Cache**: Video files are automatically downloaded to a local cache directory (`.pds-cache` in the user's home folder) before playback.
- **Offline Playback**: Once cached, videos play directly from the local disk (`file://`), bypassing the network entirely.
- **Smart Sync**: The client only downloads files that are not already in the cache and automatically cleans up unused files.
- **Browser Cache**: For web content, the client utilizes a persistent 1GB Chrome disk cache.

## Platform Support

| Platform | Status | Recommended For |
|----------|--------|-----------------|
| **Windows** | ✅ Fully Supported | Intel NUCs, desktop PCs, enterprise displays |
| **Linux** | ✅ Fully Supported | Ubuntu, Debian, other Linux distros |
| **Raspberry Pi** | ✅ Fully Supported | Budget displays, IoT deployments |

## Installation

### Development (Monorepo)

When developing locally with the full monorepo:

```bash
# From project root
npm install

# Or from client directory
cd client
npm install
```

## Quick Start by Platform

### Windows (Intel NUC, PC)

**See [README-WINDOWS.md](README-WINDOWS.md) for detailed Windows setup instructions.**

Quick steps:
1. Run deployment script: `npm run deploy:win`
2. Copy `deploy` folder to your Windows machine
3. Copy `.env.example` to `.env` and configure
4. Run the installer (Setup.exe) which will configure auto-start via Task Scheduler

### Raspberry Pi / Linux

**See instructions below for Linux/Raspberry Pi setup.**

### Deployment Overview

The client depends on the `@kiosk/shared` package which is part of the monorepo. Use one of these deployment methods:

#### Option 1: Automated Deployment (Recommended)

From your development machine, run the deployment script:

**For Windows deployment:**
```powershell
cd client
npm run deploy:win
```

**For Linux/Raspberry Pi deployment:**
```bash
cd client
npm run deploy
```

This creates a `client/deploy` folder with everything bundled. Transfer this folder to your target machine:

```bash
# On your development machine
scp -r deploy pi@raspberrypi:~/kiosk-client

# Or use rsync
rsync -av deploy/ pi@raspberrypi:~/kiosk-client/
```

#### Option 2: Manual Deployment

1. On your development machine, build both packages:
```bash
# Build shared package
cd shared
npm install
npm run build
cd ..

# Build client
cd client
npm install
npm run build
```

2. Transfer both `shared` and `client` folders to your Raspberry Pi.

3. On the Raspberry Pi, install dependencies:
```bash
# Install from the parent directory containing both folders
cd ~/kiosk
npm install --workspaces
```

### Raspberry Pi Prerequisites

Before deploying, ensure your Raspberry Pi has:

1. Node.js (v20 LTS or higher):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. Chromium browser:
```bash
sudo apt-get install -y chromium-browser chromium-codecs-ffmpeg
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your settings:
```env
SERVER_URL=http://your-server:5001
DEVICE_TOKEN=your-jwt-token-here
DISPLAY_WIDTH=1920
DISPLAY_HEIGHT=1080
KIOSK_MODE=true
```

### Getting a Device Token

1. Log into the admin UI
2. Create a new device in the Devices page
3. The backend will generate credentials for the device
4. Use the JWT token in your `.env` file

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode

**If using automated deployment:**
```bash
cd ~/kiosk-client  # The deployed folder
node dist/index.js
```

**If using manual deployment:**
```bash
cd ~/kiosk/client
npm run build
npm start
```

### Running as a Service (Raspberry Pi)

Create a systemd service file `/etc/systemd/system/kiosk-client.service`:

```ini
[Unit]
Description=Kiosk Digital Signage Client
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/kiosk-client
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Note:** Adjust `WorkingDirectory` based on your deployment location.

Enable and start the service:
```bash
sudo systemctl enable kiosk-client
sudo systemctl start kiosk-client
sudo systemctl status kiosk-client
```

View logs:
```bash
sudo journalctl -u kiosk-client -f
```

## Architecture

```
src/
├── index.ts        - Main entry point, orchestrates all modules
├── config.ts       - Configuration management
├── logger.ts       - Logging utility
├── websocket.ts    - WebSocket client for server communication
├── display.ts      - Puppeteer display controller
├── scheduler.ts    - Schedule execution engine
├── health.ts       - System health monitoring
└── screenshot.ts   - Screenshot capture and upload
```

## Troubleshooting

### Display Issues on Raspberry Pi

If you encounter display issues:
```bash
export DISPLAY=:0
```

### Chromium Not Found

Install Chromium manually:
```bash
sudo apt-get install chromium-browser
```

### Permission Issues

Run with proper permissions or add user to video group:
```bash
sudo usermod -a -G video pi
```

## Development

Run TypeScript compiler in watch mode:
```bash
npm run watch
```

## License

MIT
