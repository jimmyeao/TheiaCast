# Raspberry Pi Quick Install - TheiaCast

## One-Line Installation

```bash
curl -sSL https://raw.githubusercontent.com/jimmyeao/TheiaCast/main/install-pi.sh | bash
```

Or with custom repository URL:
```bash
REPO_URL=https://github.com/jimmyeao/TheiaCast.git curl -sSL https://raw.githubusercontent.com/jimmyeao/TheiaCast/main/install-pi.sh | bash
```

## What the installer does:

1. ✅ Installs Node.js 20 LTS
2. ✅ Installs Chromium browser
3. ✅ Clones the repository to `~/kiosk-client`
4. ✅ Installs dependencies
5. ✅ Creates `.env` configuration file
6. ✅ Creates systemd service
7. ✅ Creates update script
8. ✅ Starts the client

## After Installation

### 1. Create a device in the admin UI:
1. Start your backend and frontend servers
2. Open the admin UI (usually `http://localhost:5173`)
3. Log in with your admin credentials
4. Navigate to the Devices page
5. Click "Add Device"
6. Give it a name (e.g., "Lounge Pi")
7. Copy the generated device token

### 2. Configure the client:
```bash
nano ~/kiosk-client/client/.env
```

Set these required values:
```env
SERVER_URL=http://your-server-ip:5001
DEVICE_TOKEN=your-device-token-from-admin-ui
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**Important**:
- Replace `your-server-ip` with your actual server IP address
- Paste the device token you copied from the admin UI
- The `PUPPETEER_EXECUTABLE_PATH` is required for Raspberry Pi to use system Chromium

### 3. Caching Note

The client will create a `.pds-cache` folder in the user's home directory (`/home/pi/.pds-cache`) to store downloaded video files. This ensures smooth playback even with poor network connectivity.

### 4. Restart after configuration:
```bash
sudo systemctl restart kiosk-client
sudo systemctl status kiosk-client
```

### 5. Verify it's working:
```bash
sudo journalctl -u kiosk-client -f
```

You should see:
- "✅ Connected to server"
- "Loaded playlist with X items"
- No repeated disconnection warnings

### View logs:
```bash
sudo journalctl -u kiosk-client -f
```

## Updating the Client

The installer creates an update script at `~/kiosk-client/update.sh`:

```bash
~/kiosk-client/update.sh
```

This will:
1. Stop the service
2. Pull latest code from git
3. Update dependencies
4. Restart the service

## Service Management

```bash
# Start the service
sudo systemctl start kiosk-client

# Stop the service
sudo systemctl stop kiosk-client

# Restart the service
sudo systemctl restart kiosk-client

# Check status
sudo systemctl status kiosk-client

# View logs
sudo journalctl -u kiosk-client -f

# Disable auto-start
sudo systemctl disable kiosk-client

# Enable auto-start
sudo systemctl enable kiosk-client
```

## Troubleshooting

### Client keeps disconnecting from server
**Symptom**: Logs show "✅ Connected" followed immediately by "❌ Disconnected"

**Solution**: This is usually an authentication issue.
1. Make sure you created a device in the admin UI
2. Copy the exact device token from the admin UI
3. Paste it in `~/kiosk-client/client/.env` as `DEVICE_TOKEN=...`
4. Restart: `sudo systemctl restart kiosk-client`

### Browser fails to launch (Syntax error)
**Symptom**: Logs show "Syntax error: '(' unexpected" or "chrome-linux64"

**Solution**: Puppeteer downloaded wrong architecture. Set the executable path:
1. Edit `~/kiosk-client/client/.env`
2. Add: `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`
3. Restart: `sudo systemctl restart kiosk-client`

### Display not showing
```bash
export DISPLAY=:0
```

### Permission issues
```bash
sudo usermod -a -G video $USER
```

### Chromium not found
```bash
sudo apt-get install chromium-browser chromium-codecs-ffmpeg
```

### Check if backend is reachable
```bash
curl http://your-server-ip:5001/health
```
Should return: `{"status":"healthy"}`

## Manual Installation

If you prefer to install manually, see [README.md](README.md) for detailed instructions.
