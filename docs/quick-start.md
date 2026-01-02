# Quick Start Guide

Get TheiaCast up and running in just 5 minutes!

## Prerequisites

- Docker and Docker Compose installed ([Install Docker](https://docs.docker.com/get-docker/))
- A computer to run the server
- At least one display device (Windows PC or Raspberry Pi)

## Step 1: Install TheiaCast Server (2 minutes)

1. **Create a directory for TheiaCast:**
   ```bash
   mkdir theiacast
   cd theiacast
   ```

2. **Create a `docker-compose.yml` file:**
   ```yaml
   services:
     postgres:
       image: postgres:15-alpine
       container_name: theiacast-postgres
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: your-secure-password
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
         - ConnectionStrings__Default=Host=postgres;Port=5432;Database=theiacast;Username=postgres;Password=your-secure-password
         - ASPNETCORE_ENVIRONMENT=Production
         - Jwt__Secret=your-secret-key-here-minimum-32-characters
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
         - "80:80"
       depends_on:
         - backend
       restart: unless-stopped

   volumes:
     postgres_data:
     theiacast_media:
   ```

   **Important**: Change `your-secure-password` and `your-secret-key-here-minimum-32-characters` to secure values!

3. **Start the services:**
   ```bash
   docker-compose up -d
   ```

4. **Wait for services to start** (about 30 seconds):
   ```bash
   docker-compose logs -f backend
   ```
   Wait until you see "Application started" or similar message, then press `Ctrl+C`.

## Step 2: Access the Dashboard (30 seconds)

1. **Open your web browser** and navigate to:
   ```
   http://localhost
   ```
   (Or use your server's IP address if accessing remotely)

   `[Screenshot: Login page showing TheiaCast branding]`

2. **Create an admin account:**
   - The first user to register becomes the administrator
   - Click "Register" (if available) or use default credentials if configured
   - Fill in username and password
   - Click "Create Account"

   `[Screenshot: Registration form with username and password fields]`

3. **You're in!** You should now see the TheiaCast dashboard.

   `[Screenshot: Dashboard showing device overview]`

## Step 3: Connect Your First Display (2 minutes)

### For Windows Display

1. **Download the Windows client** from the [releases page](https://github.com/jimmyeao/TheiaCast/releases)

2. **In the TheiaCast dashboard:**
   - Click "Devices" in the sidebar
   - Click "+ Add Device"
   - Enter a name (e.g., "Lobby Display")
   - Enter a unique Device ID (e.g., "lobby-01")
   - Click "Create"
   - **Copy the device token** shown in the popup

   `[Screenshot: Add device modal with name and device ID fields]`

3. **On the display device:**
   - Extract the downloaded client
   - Edit the `.env` file:
     ```
     SERVER_URL=http://your-server-ip:5001
     DEVICE_ID=lobby-01
     DEVICE_TOKEN=paste-the-token-here
     ```
   - Run the installer or service

4. **Verify connection:**
   - Go back to the dashboard
   - The device should show as "Online" with a green indicator

   `[Screenshot: Device card showing online status with green indicator]`

### For Raspberry Pi Display

See the full [Installation Guide](installation.md) for Raspberry Pi setup instructions.

## Step 4: Create Your First Playlist (1 minute)

1. **Add content:**
   - Click "Content" in the sidebar
   - Click "+ Add Content"
   - Enter a name (e.g., "Welcome Page")
   - Enter a URL (e.g., "https://example.com")
   - Click "Save"

   `[Screenshot: Add content modal with name and URL fields]`

2. **Create a playlist:**
   - Click "Playlists" in the sidebar
   - Click "+ Create Playlist"
   - Enter a name (e.g., "Main Lobby")
   - Click "Create"
   - Click "Add Item" to add your content
   - Set display duration (in seconds, or 0 for permanent)
   - Click "Save"

   `[Screenshot: Create playlist modal and add item interface]`

3. **Assign to device:**
   - Click "Devices" in the sidebar
   - Find your device and click to flip the card
   - Click "Assign Playlist"
   - Select your playlist
   - Click "Assign"

   `[Screenshot: Device card back showing assign playlist button]`

4. **Watch the magic!** Your display should now show the content.

## 🎉 You're Done!

Your first display is now showing content. Here's what to explore next:

### Learn More
- **[User Guide](user-guide.md)** - Learn about all features
- **[Administrator Guide](admin-guide.md)** - Advanced configuration
- **[FAQ](faq.md)** - Common questions and troubleshooting

### Quick Tips
- **Upload videos**: Use the "Content" page to upload MP4 files
- **Upload presentations**: Upload PowerPoint files for slideshow content
- **Upload images**: Upload JPGs or PNGs for static displays
- **Schedule content**: Use time windows to show content at specific times
- **Broadcast urgent messages**: Use the broadcast feature for immediate alerts
- **Remote control**: Click "Live Remote" on any device to see and control it in real-time

## Need Help?

- Check the [FAQ](faq.md) for common issues
- Visit the [GitHub repository](https://github.com/jimmyeao/TheiaCast) for support

---

**Next Steps**: Read the full [User Guide](user-guide.md) to learn about advanced features like scheduling, broadcasting, and remote control.
