# Installation Guide

This guide provides detailed instructions for installing TheiaCast on various platforms.

## Table of Contents

- [System Requirements](#system-requirements)
- [Server Installation](#server-installation)
  - [Docker Installation (Recommended)](#docker-installation-recommended)
  - [Manual Installation](#manual-installation)
- [Client Installation](#client-installation)
  - [Windows Client](#windows-client)
  - [Raspberry Pi Client](#raspberry-pi-client)
- [Post-Installation](#post-installation)
- [Troubleshooting](#troubleshooting)

## System Requirements

### Server Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Storage | 10 GB | 50+ GB (depending on content) |
| OS | Linux, Windows, macOS | Linux (Ubuntu 22.04 LTS) |
| Network | 100 Mbps | 1 Gbps |
| Software | Docker & Docker Compose | Docker & Docker Compose |

### Display Device Requirements

#### Windows Client
| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | Intel Core i3 or equivalent | Intel Core i5 or better |
| RAM | 2 GB | 4 GB |
| Storage | 5 GB | 10 GB |
| OS | Windows 10 | Windows 11 |
| Network | Stable connection to server | Wired Ethernet |

#### Raspberry Pi Client
| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Model | Raspberry Pi 3B+ | Raspberry Pi 4 (4GB RAM) |
| Storage | 16 GB microSD | 32 GB microSD (Class 10) |
| OS | Raspberry Pi OS Lite | Raspberry Pi OS (64-bit) |
| Network | Wi-Fi | Wired Ethernet |

---

## Server Installation

### Docker Installation (Recommended)

Docker provides the easiest and most reliable installation method.

#### Step 1: Install Docker

**On Ubuntu/Debian:**
```bash
# Update package index
sudo apt update

# Install prerequisites
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to docker group
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
```

**On Windows:**
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop
2. Run the installer
3. Restart your computer
4. Launch Docker Desktop

**On macOS:**
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop
2. Drag Docker.app to Applications
3. Launch Docker from Applications

#### Step 2: Verify Docker Installation

```bash
docker --version
docker-compose --version
```

You should see version numbers for both commands.

#### Step 3: Create TheiaCast Directory Structure

```bash
mkdir -p ~/theiacast
cd ~/theiacast
mkdir -p ssl-certs  # For optional SSL certificates
```

#### Step 4: Create docker-compose.yml

Create a file named `docker-compose.yml` with the following content:

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: theiacast-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: theiacast
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  backend:
    image: ghcr.io/jimmyeao/theiacast-backend:latest
    container_name: theiacast-backend
    environment:
      - ConnectionStrings__Default=Host=postgres;Port=5432;Database=theiacast;Username=postgres;Password=${POSTGRES_PASSWORD:-postgres}
      - ASPNETCORE_ENVIRONMENT=Production
      - Jwt__Secret=${JWT_SECRET:-dev-secret-key}
      - BASE_URL=http://backend:8080
    ports:
      - "5001:8080"
    depends_on:
      - postgres
    volumes:
      - theiacast_media:/app/wwwroot
    restart: unless-stopped

  frontend:
    image: ghcr.io/jimmyeao/theiacast-frontend:latest
    container_name: theiacast-frontend
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    volumes:
      - ${SSL_CERT_PATH:-./ssl-certs}:/etc/nginx/ssl:ro
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
  theiacast_media:
```

#### Step 5: Create Environment File (.env)

Create a `.env` file in the same directory:

```bash
# PostgreSQL password
POSTGRES_PASSWORD=YourSecurePassword123!

# JWT secret (minimum 32 characters)
JWT_SECRET=your-very-long-and-secure-secret-key-here-32-chars-minimum

# Optional: Custom ports
# HTTP_PORT=80
# HTTPS_PORT=443

# Optional: Custom SSL certificate path
# SSL_CERT_PATH=./ssl-certs
```

**Important Security Notes:**
- Replace `YourSecurePassword123!` with a strong, unique password
- Replace the JWT_SECRET with a long, random string (32+ characters)
- Keep this file secure and never commit it to version control

#### Step 6: Start TheiaCast

```bash
docker-compose up -d
```

This command will:
- Download the required Docker images (first time only)
- Create and start all containers
- Set up the database
- Configure networking

#### Step 7: Verify Installation

Check that all containers are running:

```bash
docker-compose ps
```

You should see three containers (postgres, backend, frontend) with status "Up".

`[Screenshot: Terminal showing docker-compose ps output with all services running]`

Check the logs:

```bash
# View all logs
docker-compose logs

# Follow backend logs
docker-compose logs -f backend

# Follow frontend logs
docker-compose logs -f frontend
```

#### Step 8: Access the Dashboard

Open your web browser and navigate to:
- **HTTP**: `http://localhost` or `http://your-server-ip`
- **HTTPS**: `https://localhost` or `https://your-server-ip` (if SSL configured)

`[Screenshot: TheiaCast login page]`

**First Login:**
1. Click "Register" (if shown) or use default credentials
2. Create an admin account
3. The first user becomes the administrator

`[Screenshot: Registration page with username, password fields]`

---

### Manual Installation

For advanced users who prefer not to use Docker.

#### Prerequisites

- .NET 8.0 SDK
- PostgreSQL 15+
- Node.js 18+
- Nginx (for production)

#### Backend Setup

1. **Install .NET 8.0:**
   ```bash
   # Ubuntu/Debian
   wget https://dot.net/v1/dotnet-install.sh
   chmod +x dotnet-install.sh
   ./dotnet-install.sh --channel 8.0
   ```

2. **Clone the repository:**
   ```bash
   git clone https://github.com/jimmyeao/TheiaCast.git
   cd TheiaCast
   ```

3. **Configure database:**
   ```bash
   # Install PostgreSQL
   sudo apt install postgresql-15

   # Create database
   sudo -u postgres psql
   CREATE DATABASE theiacast;
   CREATE USER theiacastuser WITH PASSWORD 'your-password';
   GRANT ALL PRIVILEGES ON DATABASE theiacast TO theiacastuser;
   \q
   ```

4. **Configure backend:**
   Edit `src/TheiaCast.Api/appsettings.json`:
   ```json
   {
     "ConnectionStrings": {
       "Default": "Host=localhost;Port=5432;Database=theiacast;Username=theiacastuser;Password=your-password"
     },
     "Jwt": {
       "Secret": "your-secret-key-minimum-32-characters",
       "Issuer": "theiacast",
       "Audience": "theiacast-clients"
     }
   }
   ```

5. **Build and run:**
   ```bash
   cd src/TheiaCast.Api
   dotnet build
   dotnet run
   ```

#### Frontend Setup

1. **Install Node.js dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Build for production:**
   ```bash
   npm run build
   ```

3. **Configure Nginx:**
   Create `/etc/nginx/sites-available/theiacast`:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       root /path/to/TheiaCast/frontend/dist;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       location /api/ {
           proxy_pass http://localhost:5001/;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
       }

       location /ws {
           proxy_pass http://localhost:5001/ws;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

4. **Enable site:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/theiacast /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## Client Installation

### Windows Client

#### Step 1: Download Client

1. Go to the [releases page](https://github.com/jimmyeao/TheiaCast/releases)
2. Download the latest Windows client package
3. Extract the ZIP file to a folder (e.g., `C:\TheiaCast\Client`)

#### Step 2: Configure Client

1. **In the TheiaCast web dashboard:**
   - Go to "Devices"
   - Click "+ Add Device"
   - Enter device name (e.g., "Reception Display")
   - Enter unique device ID (e.g., "reception-01")
   - Click "Create"
   - **Copy the device token** from the popup

   `[Screenshot: Add device modal with token shown]`

2. **On the display computer:**
   - Navigate to the extracted client folder
   - Edit the `.env` file:
     ```
     SERVER_URL=http://your-server-ip:5001
     DEVICE_ID=reception-01
     DEVICE_TOKEN=paste-token-here
     LOG_LEVEL=info
     ```

#### Step 3: Install as Windows Service

1. **Run PowerShell as Administrator**

2. **Navigate to client folder:**
   ```powershell
   cd C:\TheiaCast\Client
   ```

3. **Install the service:**
   ```powershell
   .\install-service.ps1
   ```

4. **Start the service:**
   ```powershell
   Start-Service TheiaCastClient
   ```

5. **Verify service is running:**
   ```powershell
   Get-Service TheiaCastClient
   ```

   `[Screenshot: PowerShell showing service running]`

#### Step 4: Verify Connection

1. Return to the web dashboard
2. Go to "Devices"
3. Your device should show "Online" with a green indicator

`[Screenshot: Device card showing online status]`

---

### Raspberry Pi Client

#### Step 1: Prepare Raspberry Pi

1. **Install Raspberry Pi OS:**
   - Download Raspberry Pi Imager: https://www.raspberrypi.com/software/
   - Flash Raspberry Pi OS (64-bit recommended) to microSD card
   - Boot the Raspberry Pi

2. **Update system:**
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

3. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

4. **Verify installation:**
   ```bash
   node --version  # Should show v18.x or higher
   npm --version
   ```

#### Step 2: Download and Install Client

1. **Download the latest release:**
   ```bash
   cd ~
   wget https://github.com/jimmyeao/TheiaCast/releases/latest/download/raspberrypi-client.tar.gz
   tar -xzf raspberrypi-client.tar.gz
   cd raspberrypi-client
   ```

2. **Install dependencies:**
   ```bash
   npm install --production
   ```

#### Step 3: Configure Client

1. **Create device in dashboard** (same as Windows step 2.1 above)

2. **Configure environment:**
   ```bash
   cp .env.example .env
   nano .env
   ```

   Edit the file:
   ```
   SERVER_URL=http://your-server-ip:5001
   DEVICE_ID=your-unique-device-id
   DEVICE_TOKEN=your-device-token
   LOG_LEVEL=info
   SCREENSHOT_INTERVAL=300000
   HEALTH_REPORT_INTERVAL=60000
   ```

#### Step 4: Install as System Service

1. **Create systemd service file:**
   ```bash
   sudo nano /etc/systemd/system/theiacast.service
   ```

2. **Add the following content:**
   ```ini
   [Unit]
   Description=TheiaCast Digital Signage Client
   After=network.target

   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/home/pi/raspberrypi-client
   ExecStart=/usr/bin/node /home/pi/raspberrypi-client/dist/index.js
   Restart=always
   RestartSec=10
   StandardOutput=journal
   StandardError=journal

   [Install]
   WantedBy=multi-user.target
   ```

3. **Enable and start service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable theiacast
   sudo systemctl start theiacast
   ```

4. **Check status:**
   ```bash
   sudo systemctl status theiacast
   ```

   `[Screenshot: Terminal showing service status as active]`

5. **View logs:**
   ```bash
   sudo journalctl -u theiacast -f
   ```

#### Step 5: Configure Auto-start (Optional)

To start the browser on boot in kiosk mode:

1. **Edit autostart:**
   ```bash
   mkdir -p ~/.config/lxsession/LXDE-pi
   nano ~/.config/lxsession/LXDE-pi/autostart
   ```

2. **Add:**
   ```
   @xset s off
   @xset -dpms
   @xset s noblank
   ```

---

## Post-Installation

### SSL Certificate Setup (Optional)

For HTTPS access, you need SSL certificates.

#### Option 1: Self-Signed Certificate (Testing)

```bash
cd ~/theiacast/ssl-certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -subj "/CN=localhost"
```

#### Option 2: Let's Encrypt (Production)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com

# Certificates will be in /etc/letsencrypt/live/yourdomain.com/
# Copy to TheiaCast directory
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ~/theiacast/ssl-certs/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ~/theiacast/ssl-certs/key.pem
sudo chown $USER:$USER ~/theiacast/ssl-certs/*.pem
```

Restart frontend:
```bash
cd ~/theiacast
docker-compose restart frontend
```

### Firewall Configuration

If you're using a firewall, open the required ports:

```bash
# Ubuntu/Debian with ufw
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 5001/tcp  # Backend API

# Or with firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=5001/tcp
sudo firewall-cmd --reload
```

### Backup Configuration

Set up regular backups of your data:

```bash
#!/bin/bash
# backup-theiacast.sh

BACKUP_DIR="/backup/theiacast"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
docker exec theiacast-postgres pg_dump -U postgres theiacast > $BACKUP_DIR/db_$DATE.sql

# Backup media files
docker run --rm -v theiacast_media:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/media_$DATE.tar.gz -C /data .

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

Make it executable and add to cron:
```bash
chmod +x backup-theiacast.sh
crontab -e
# Add: 0 2 * * * /path/to/backup-theiacast.sh
```

---

## Troubleshooting

### Server Issues

**Containers won't start:**
```bash
# Check logs
docker-compose logs

# Check specific service
docker-compose logs backend

# Restart all services
docker-compose restart
```

**Database connection errors:**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Reset database (WARNING: Deletes all data)
docker-compose down -v
docker-compose up -d
```

**Port conflicts:**
```bash
# Check what's using port 80
sudo lsof -i :80

# Change port in .env file
echo "HTTP_PORT=8080" >> .env
docker-compose up -d
```

### Client Issues

**Windows client won't start:**
1. Check Windows Event Viewer for errors
2. Verify .env file configuration
3. Check firewall allows outbound connections
4. Verify server URL is accessible: `curl http://your-server:5001/health`

**Raspberry Pi client crashes:**
```bash
# Check logs
sudo journalctl -u theiacast -n 100

# Check system resources
htop

# Increase memory (edit /boot/config.txt)
gpu_mem=256

# Restart
sudo reboot
```

**Device shows offline:**
1. Check network connectivity: `ping your-server-ip`
2. Verify device token is correct
3. Check client logs for connection errors
4. Verify firewall allows WebSocket connections (port 5001)

### Common Issues

See the [FAQ](faq.md) for more troubleshooting tips.

---

## Next Steps

- **[User Guide](user-guide.md)** - Learn how to use all features
- **[Administrator Guide](admin-guide.md)** - Advanced configuration
- **[FAQ](faq.md)** - Common questions and solutions

---

**Need Help?** Report issues at https://github.com/jimmyeao/TheiaCast/issues
