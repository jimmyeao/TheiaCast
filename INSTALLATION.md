# TheiaCast Installation Guide

This guide provides detailed installation instructions for all TheiaCast components.

## Table of Contents

- [System Requirements](#system-requirements)
- [Quick Start](#quick-start)
- [Component Installation](#component-installation)
  - [Backend Server](#backend-server-installation)
  - [Frontend Dashboard](#frontend-dashboard-installation)
  - [Windows Client](#windows-client-installation)
  - [Linux/Raspberry Pi Client](#linuxraspberry-pi-client-installation)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## System Requirements

### Backend Server
- **Operating System**: Windows 10+, Linux (Ubuntu 20.04+), or macOS 11+
- **Database**: PostgreSQL 12 or later
- **Memory**: 2GB RAM minimum, 4GB recommended
- **Disk**: 1GB free space
- **.NET Runtime**: Included in self-contained builds

### Frontend Dashboard
- **Web Server**: Nginx or Apache
- **Modern Browser**: Chrome, Firefox, Edge, or Safari (latest versions)

### Client Devices
- **Windows**: Windows 10 or later, .NET 10 Runtime (auto-installed)
- **Linux/Pi**: Ubuntu 20.04+, Raspberry Pi OS, Node.js 18+
- **Display**: X11 display server for kiosk mode

---

## Quick Start

### For Testing (All-in-One Local Setup)

1. **Install Backend** (choose your platform)
2. **Install Frontend** (serve locally or via nginx)
3. **Create Admin User** (via backend API)
4. **Register Devices** (via admin dashboard)
5. **Install Client** on device(s)

---

## Component Installation

## Backend Server Installation

### Download

Get the latest release for your platform:
- **Windows**: `theiacast-backend-win-x64-v{VERSION}.zip`
- **Linux**: `theiacast-backend-linux-x64-v{VERSION}.tar.gz`
- **macOS**: `theiacast-backend-osx-x64-v{VERSION}.tar.gz`

### Prerequisites

Install PostgreSQL:

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

**Windows:**
Download from https://www.postgresql.org/download/windows/

**macOS:**
```bash
brew install postgresql
```

Create Database:
```bash
sudo -u postgres psql
CREATE DATABASE theiacast;
CREATE USER theiacast WITH ENCRYPTED PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE theiacast TO theiacast;
\q
```

### Windows Installation

1. Extract the zip file
2. Run PowerShell as Administrator
3. Execute the install script:
   ```powershell
   cd theiacast-backend-win-x64
   .\install-windows.ps1
   ```
4. Follow prompts for:
   - PostgreSQL connection details
   - JWT secret (auto-generated if left blank)
5. Service will start automatically

Verify:
```powershell
Get-Service TheiaCastBackend
```

Access Swagger UI: http://localhost:5001/swagger

### Linux Installation

1. Extract the archive:
   ```bash
   tar xzf theiacast-backend-linux-x64-v{VERSION}.tar.gz
   cd theiacast-backend-linux-x64
   ```

2. Run install script:
   ```bash
   sudo ./install-linux.sh
   ```

3. Follow prompts for database and JWT configuration

4. Verify service:
   ```bash
   sudo systemctl status theiacast-backend
   ```

Access Swagger UI: http://localhost:5001/swagger

### macOS Installation

Same as Linux installation (uses bash script).

### Manual Start (All Platforms)

If not using the install script:

```bash
# Set environment variables
export ASPNETCORE_ENVIRONMENT=Production
export ASPNETCORE_URLS=http://0.0.0.0:5001

# Edit appsettings.json with your database details

# Run the executable
./TheiaCast.Backend  # Linux/Mac
# or
.\TheiaCast.Backend.exe  # Windows
```

---

## Frontend Dashboard Installation

### Download

Get the latest release:
- `theiacast-frontend-v{VERSION}.tar.gz`
- `theiacast-frontend-v{VERSION}.zip`

### Option 1: Nginx (Recommended)

**Ubuntu/Debian:**

1. Extract the archive:
   ```bash
   tar xzf theiacast-frontend-v{VERSION}.tar.gz
   cd theiacast-frontend
   ```

2. Run the deployment script:
   ```bash
   sudo ./deploy.sh
   ```

This will:
- Install Nginx (if not present)
- Copy files to `/var/www/theiacast/frontend`
- Configure Nginx with proxy to backend
- Enable and start the service

3. Access at: http://your-server-ip

**Manual Nginx Setup:**

```bash
# Copy files
sudo mkdir -p /var/www/theiacast
sudo cp -r dist /var/www/theiacast/frontend

# Update nginx.conf backend URLs
sed -i 's|http://backend:8080/|http://localhost:5001/|g' nginx.conf

# Install config
sudo cp nginx.conf /etc/nginx/sites-available/theiacast
sudo ln -s /etc/nginx/sites-available/theiacast /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Optional

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Option 2: Apache

1. Install Apache:
   ```bash
   sudo apt install apache2
   ```

2. Copy files:
   ```bash
   sudo cp -r dist/* /var/www/html/
   ```

3. Enable SPA routing:
   ```bash
   sudo a2enmod rewrite
   sudo systemctl restart apache2
   ```

4. Create `.htaccess` in `/var/www/html/`:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /index.html [L]
   </IfModule>
   ```

### Option 3: Development Server

For testing only:
```bash
cd dist
python3 -m http.server 5173
# or
npx serve -l 5173
```

### SSL/HTTPS Setup (Production)

1. Install Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. Obtain certificate:
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

Certbot will auto-configure HTTPS in nginx.

---

## Windows Client Installation

### Download

Get the latest release:
- `TheiaCast-Client-Windows-v{VERSION}-Setup.exe`

### Installation

1. **Run the installer** (Setup.exe)
2. **Follow the wizard:**
   - Server URL (e.g., `http://192.168.0.11:5001`)
   - Device ID (unique identifier, e.g., `office-display-1`)
   - Device Token (obtained from admin dashboard)
3. **.NET 10 Runtime** will be installed automatically if missing
4. **Client starts automatically** on login

### Silent Installation

For mass deployment:
```powershell
Setup.exe /VERYSILENT /ServerUrl=http://192.168.0.11:5001 /DeviceId=office-kiosk-1 /DeviceToken=your-token-here
```

### Verify Installation

Check scheduled task:
```powershell
Get-ScheduledTask -TaskName "TheiaCastKioskClient-AutoStart"
```

View logs:
```powershell
Get-EventLog -LogName Application -Source KioskClient -Newest 10
```

### Uninstall

Use Windows "Add or Remove Programs" or run:
```powershell
C:\Program Files\TheiaCast\KioskClient\uninstall.exe
```

---

## Linux/Raspberry Pi Client Installation

### Download

Get the latest release:
- `theiacast-client-linux-v{VERSION}.tar.gz`

### Installation

1. Extract the archive:
   ```bash
   tar xzf theiacast-client-linux-v{VERSION}.tar.gz
   cd theiacast-client
   ```

2. Run install script:
   ```bash
   sudo ./scripts/install.sh
   ```

3. Follow prompts for:
   - Server URL
   - Device ID
   - Device Token (from admin dashboard)

4. Client will start automatically as a systemd service

### Verify Installation

Check service status:
```bash
sudo systemctl status theiacast-client
```

View logs:
```bash
sudo journalctl -u theiacast-client -f
```

### Uninstall

```bash
sudo /opt/theiacast-client/scripts/uninstall.sh
```

---

## Configuration

### Obtaining Device Token

1. Log into the TheiaCast admin dashboard
2. Navigate to **Devices** page
3. Click **Add Device** or select existing device
4. Copy the **Device Token**
5. Use this token during client installation

### Backend Configuration

Edit `/opt/theiacast-backend/appsettings.json` (Linux) or `C:\Program Files\TheiaCast\Backend\appsettings.json` (Windows):

```json
{
  "ConnectionStrings": {
    "Default": "Host=localhost;Port=5432;Database=theiacast;Username=theiacast;Password=your-password"
  },
  "Jwt": {
    "Secret": "your-secret-key-min-32-chars",
    "Issuer": "theiacast",
    "Audience": "theiacast-clients"
  }
}
```

Restart service after changes:
```bash
sudo systemctl restart theiacast-backend  # Linux
Restart-Service TheiaCastBackend  # Windows
```

### Client Configuration

Edit `/opt/theiacast-client/.env` (Linux) or check installer config (Windows):

```env
SERVER_URL=http://192.168.0.11:5001
DEVICE_ID=my-device-id
DEVICE_TOKEN=device-token-from-admin
LOG_LEVEL=info
SCREENSHOT_INTERVAL=300000
HEALTH_REPORT_INTERVAL=60000
HEADLESS=false
KIOSK_MODE=false
```

Restart client:
```bash
sudo systemctl restart theiacast-client  # Linux
schtasks /Run /TN "TheiaCastKioskClient-AutoStart"  # Windows
```

---

## Troubleshooting

### Backend Issues

**Service won't start:**
```bash
# Check logs
sudo journalctl -u theiacast-backend -n 50  # Linux
Get-EventLog -LogName Application -Newest 10  # Windows

# Check database connection
psql -h localhost -U theiacast -d theiacast
```

**Port 5001 already in use:**
```bash
# Find process using port
sudo lsof -i :5001  # Linux
netstat -ano | findstr :5001  # Windows

# Change port in appsettings.json or environment variable
export ASPNETCORE_URLS=http://0.0.0.0:5002
```

### Frontend Issues

**404 on page refresh:**
- Ensure nginx/apache SPA routing is configured correctly
- Check nginx.conf `try_files` directive

**API connection failed:**
- Verify backend is running: `curl http://localhost:5001/health`
- Check nginx proxy configuration
- Review browser console for CORS errors

**WebSocket connection failed:**
- Verify `/ws` endpoint is proxied correctly
- Check nginx proxy_read_timeout setting

### Client Issues

**Client not starting (Linux):**
```bash
# Check service status
sudo systemctl status theiacast-client

# Check logs
sudo journalctl -u theiacast-client -f

# Verify Node.js version
node -v  # Should be 18+

# Test manual start
cd /opt/theiacast-client
node index.js
```

**Client not starting (Windows):**
```powershell
# Check scheduled task
Get-ScheduledTask -TaskName "TheiaCastKioskClient-AutoStart"

# Run manually
cd "C:\Program Files\TheiaCast\KioskClient"
.\KioskClient.Service.exe
```

**Browser not visible:**
- Ensure HEADLESS=false in config
- Check DISPLAY variable is set (Linux)
- Verify user has X11 access

**Device not showing online in dashboard:**
- Check SERVER_URL is correct
- Verify DEVICE_TOKEN matches admin dashboard
- Check firewall rules (port 5001)
- Review client logs for connection errors

---

## Support

For additional help:
- GitHub Issues: https://github.com/yourorg/theiacast/issues
- Documentation: https://github.com/yourorg/theiacast/wiki

---

## Next Steps

After installation:
1. **Create Admin User** (via API or database)
2. **Log into Dashboard** at http://your-server/
3. **Add Content** (URLs, videos)
4. **Create Playlists**
5. **Assign Playlists to Devices**
6. **Monitor Device Status**

Enjoy TheiaCast!
