# Frequently Asked Questions (FAQ)

Common questions and troubleshooting for TheiaCast.

## Table of Contents

1. [General Questions](#general-questions)
2. [Installation and Setup](#installation-and-setup)
3. [Device Connectivity](#device-connectivity)
4. [Content and Playlists](#content-and-playlists)
5. [Remote Control](#remote-control)
6. [Broadcasting](#broadcasting)
7. [Performance](#performance)
8. [Security](#security)
9. [Licensing](#licensing)
10. [Troubleshooting](#troubleshooting)

---

## General Questions

### What is TheiaCast?

TheiaCast is a web-based digital signage solution that allows you to manage and control multiple display devices from a central dashboard. It supports web content, videos, images, and presentations with advanced scheduling and remote control capabilities.

### What platforms are supported?

- **Server:** Any platform with Docker support (Linux, Windows, macOS)
- **Clients:** Windows 10/11, Raspberry Pi OS (Debian-based Linux)
- **Admin Dashboard:** Any modern web browser (Chrome, Firefox, Safari, Edge)

### Is TheiaCast free?

Yes, TheiaCast offers a free tier that supports:
- Up to 3 devices
- 1 admin user
- All core features (playlists, scheduling, broadcasting, remote control)

Paid tiers offer additional devices, users, and branding customization. See [License Management](admin-guide.md#license-management) for details.

### What are the hardware requirements?

**Server:**
- 2GB RAM minimum (4GB recommended)
- 10GB storage minimum (more for video content)
- 2 CPU cores minimum

**Display Devices:**
- **Windows:** 2GB RAM, any modern CPU
- **Raspberry Pi:** Raspberry Pi 4 with 2GB RAM (4GB recommended)

### Can I run TheiaCast without Docker?

Yes, but Docker is strongly recommended. Manual installation requires:
- .NET 8.0 SDK
- PostgreSQL 15+
- Node.js 18+ (for frontend build)
- nginx or similar web server

See [Installation Guide](installation.md#manual-installation-advanced) for details.

### Is my data secure?

Yes. TheiaCast uses:
- JWT authentication for admin users
- Secure token-based authentication for devices
- Password hashing with BCrypt
- HTTPS support for encrypted connections
- Optional multi-factor authentication (MFA)

See [Security Best Practices](admin-guide.md#security-best-practices) for more information.

---

## Installation and Setup

### How do I install TheiaCast?

Follow the [Quick Start Guide](quick-start.md) for a 5-minute setup, or the [Installation Guide](installation.md) for detailed instructions.

**Quick summary:**
1. Install Docker and Docker Compose
2. Create `docker-compose.yml` file
3. Run `docker-compose up -d`
4. Access dashboard at `http://localhost`

### The dashboard won't load. What should I check?

1. **Check if services are running:**
   ```bash
   docker-compose ps
   ```
   All services should show "Up" status.

2. **Check backend logs:**
   ```bash
   docker-compose logs backend
   ```
   Look for "Application started" message.

3. **Check if port 80 is available:**
   ```bash
   # Windows
   netstat -ano | findstr :80

   # Linux
   sudo netstat -tulpn | grep :80
   ```
   If another service is using port 80, change frontend port in `docker-compose.yml`:
   ```yaml
   frontend:
     ports:
       - "8080:80"  # Use port 8080 instead
   ```

4. **Try accessing backend directly:**
   ```bash
   curl http://localhost:5001/health
   ```
   Should return: `{"status":"healthy"}`

### How do I change the default passwords?

**Database Password:**
1. Edit `docker-compose.yml`
2. Change `POSTGRES_PASSWORD` in both `postgres` and `backend` services
3. Run `docker-compose down && docker-compose up -d`

**Admin Password:**
1. Log into dashboard
2. Click username → "Change Password"
3. Enter current and new password

### Can I use an external PostgreSQL database?

Yes. Change the connection string in `docker-compose.yml`:

```yaml
backend:
  environment:
    - ConnectionStrings__Default=Host=your-db-server;Port=5432;Database=theiacast;Username=your-user;Password=your-password
```

Remove the `postgres` service if you don't need the bundled database.

### How do I enable HTTPS?

See [SSL Certificate Management](admin-guide.md#ssl-certificate-management) in the Administrator Guide.

**Quick method (with reverse proxy):**
1. Install nginx or Caddy on host
2. Configure reverse proxy with SSL termination
3. Forward requests to TheiaCast containers

---

## Device Connectivity

### My device shows as offline even though it's running

**Troubleshooting steps:**

1. **Check device client logs:**
   ```bash
   # Windows
   Get-Content "C:\Program Files\TheiaCast\logs\client.log" -Tail 50

   # Raspberry Pi
   pm2 logs kiosk-client
   ```

2. **Verify device token:**
   - Check `.env` file on device has correct `DEVICE_TOKEN`
   - Compare with token shown in dashboard (flip device card → click token icon)

3. **Verify server URL:**
   - `.env` should have `SERVER_URL=http://your-server-ip:5001`
   - Should NOT include `/ws` path
   - Use server's IP address, not `localhost`

4. **Check network connectivity:**
   ```bash
   # From device, test HTTP
   curl http://your-server-ip:5001/health
   ```

5. **Check firewall:**
   - Server firewall should allow port 5001 (backend)
   - Client device should allow outbound connections

6. **Restart device client:**
   ```bash
   # Windows
   Restart-Service TheiaCastClient

   # Raspberry Pi
   pm2 restart kiosk-client
   ```

### Device keeps disconnecting and reconnecting

**Possible causes:**

1. **Network instability:**
   - Check WiFi signal strength
   - Use wired Ethernet connection if possible
   - Check router logs for connection drops

2. **WebSocket timeout:**
   - Increase ping interval in Settings → Advanced
   - Check for aggressive firewall/proxy timeouts

3. **Device resource issues:**
   - Check device health metrics (CPU, memory, disk)
   - If CPU >90% or Memory >90%, device may be overwhelmed
   - See [Performance](#performance) section

4. **Server restarts:**
   - Check backend logs for crashes or restarts
   - Device will automatically reconnect when server is back

### Can I connect devices over the internet (not LAN)?

Yes, but you need to:

1. **Expose server to internet:**
   - Configure port forwarding on router (ports 80, 443, 5001)
   - Or use a VPN tunnel
   - Or use reverse proxy with public IP/domain

2. **Update device client:**
   - Set `SERVER_URL=http://your-public-ip:5001` or `https://your-domain.com`

3. **Security considerations:**
   - Use HTTPS/SSL for encrypted connections
   - Use strong passwords and MFA
   - Consider VPN for additional security
   - Regularly rotate device tokens

### How do I move a device to a different server?

1. **On new server:**
   - Create device with same Device ID
   - Note the new device token

2. **On device:**
   - Edit `.env` file
   - Update `SERVER_URL` to new server
   - Update `DEVICE_TOKEN` to new token
   - Restart client

3. **On old server:**
   - Delete old device (optional)

---

## Content and Playlists

### Why isn't my playlist playing on the device?

**Troubleshooting checklist:**

1. **Is playlist assigned to device?**
   - Dashboard → Devices → Flip card
   - Should show active playlist name
   - If not, click "Assign Playlist" and select playlist

2. **Does playlist have items?**
   - Dashboard → Playlists → Click playlist
   - Should show at least one content item
   - If empty, add content items

3. **Is device online?**
   - Device must be online to receive playlist updates
   - Green indicator = online, gray = offline

4. **Are time windows blocking content?**
   - Check playlist item time windows
   - If current time is outside all time windows, nothing will display
   - See [Time Windows](user-guide.md#time-windows) in User Guide

5. **Check device client logs:**
   - Look for "Loaded playlist" message
   - Look for "No valid items in time window" warning

### Can I show different content on different days of the week?

Yes! Use the **Days of Week** filter when adding playlist items:

1. Create playlist
2. Add item
3. Select specific days (e.g., Monday, Wednesday, Friday)
4. Add another item for other days

See [Advanced Scheduling](user-guide.md#advanced-scheduling) for details.

### How do I make content show permanently (no rotation)?

Set **Display Duration to 0 seconds** when adding the playlist item:

1. Playlists → Select playlist → "Add Item"
2. Select content
3. Set "Display Duration" to `0`
4. Click "Add"

The device will show this content permanently until you change the playlist.

### What video formats are supported?

**Recommended:** MP4 with H.264 video codec and AAC audio

**Supported formats:**
- MP4 (H.264, H.265)
- WebM (VP8, VP9)
- OGG (Theora)

**Performance tips:**
- H.264 is best for Raspberry Pi (hardware decoding)
- Keep resolution ≤1080p for smooth playback
- Bitrate ≤10 Mbps for reliable streaming

### What image formats are supported?

- JPEG/JPG
- PNG (transparency supported)
- GIF (animation supported)
- WebP
- SVG

**Recommended:** JPEG for photos, PNG for graphics with transparency

### Can I show PowerPoint presentations?

Yes! Upload `.pptx` files as content items. TheiaCast converts them to web-based slideshows.

**Limitations:**
- Animations may not play exactly as in PowerPoint
- Embedded videos are not supported
- Complex transitions may render differently

**Recommendation:** Test presentation on a device before deploying to all screens.

### How do I show a website that requires login?

Use **Auto-Authentication** (see [Auto-Authentication](user-guide.md#auto-authentication) in User Guide):

1. Create content item with website URL
2. Enable "Auto Login"
3. Enter CSS selectors for username, password, and submit button
4. Enter credentials
5. Save

The device will automatically log in when showing this content.

### Can I show local files (not URLs)?

Not directly. TheiaCast is designed for web content and uploaded media.

**Workarounds:**
1. Upload media files to TheiaCast (Content → Add Content → Upload File)
2. Host files on a local web server and use URL
3. Use network share with web server (e.g., nginx serving local directory)

---

## Remote Control

### Live Remote isn't working - I just see a black screen

**Troubleshooting:**

1. **Is device online?**
   - Check device status indicator (green = online)

2. **Check WebSocket connection:**
   - Open browser developer console (F12)
   - Look for WebSocket errors
   - Try refreshing the dashboard

3. **Is Chromium running on device?**
   - Check device client logs
   - Should see "Browser launched" message

4. **Try Visual Remote instead:**
   - Uses screenshots instead of live stream
   - Works if live streaming has issues

5. **Check network bandwidth:**
   - Live streaming requires ~2-5 Mbps
   - High latency >200ms may cause issues

### Keyboard input in Live Remote isn't working

**Troubleshooting:**

1. **Click the canvas to focus:**
   - Canvas must be focused to receive keyboard events
   - You should see "KEYBOARD ACTIVE" indicator

2. **Check browser permissions:**
   - Some keys (F11, Ctrl+W) are reserved by browser
   - Use on-screen keyboard controls instead

3. **Try typing in text input instead:**
   - Enter text in the sidebar text box
   - Click "Type Text" button

### Clicks aren't registering in the right location

**Issue:** Coordinates may be off if device resolution doesn't match display.

**Solution:**
1. Check device resolution in screencast metadata
2. Ensure device client is running in full-screen kiosk mode
3. Restart device client if resolution changed recently

### Can I control multiple devices at once?

Not directly. Remote control works on one device at a time.

**For multiple devices:**
- Use Broadcasting to send messages/content to all devices
- Use Playlists to synchronize content across devices

---

## Broadcasting

### Broadcast message isn't showing on device

**Troubleshooting:**

1. **Is device online?**
   - Broadcast only works on online devices
   - Check device status indicator

2. **Is device selected?**
   - In broadcast modal, check target devices
   - "All Devices" should be selected, or specific device checked

3. **Is broadcast duration set?**
   - Default: 30 seconds
   - If set to 0, broadcast shows permanently (until manually dismissed)

4. **Check device client logs:**
   - Should see "Received broadcast" message

### How long does a broadcast last?

**Duration is configurable** when creating broadcast:
- Default: 30 seconds
- Set to 0 for permanent (until dismissed or new content)

After duration expires, device returns to normal playlist content.

### Can I broadcast to specific devices?

Yes! In the broadcast modal:
1. Uncheck "All Devices"
2. Select individual devices to target
3. Click "Start Broadcast"

### Can I broadcast images and videos?

Yes! In broadcast modal:
1. Select "Image" or "Video" type
2. Click "Select Media"
3. Choose from uploaded content
4. Configure duration
5. Click "Start Broadcast"

### How do I stop an active broadcast?

**Two methods:**

1. **Stop Broadcast button:**
   - Broadcast Control panel shows active broadcasts
   - Click "Stop Broadcast" button

2. **Automatic expiration:**
   - Broadcasts with duration >0 automatically stop after duration

---

## Performance

### Dashboard is slow to load

**Possible causes:**

1. **Too many devices:**
   - Each device card loads latest screenshot
   - With many devices, this can be slow
   - **Solution:** Use filtering to show fewer devices

2. **Large screenshots:**
   - Screenshots are base64-encoded in API response
   - **Solution:** Reduce screenshot quality or resolution in Settings

3. **Slow network:**
   - Test network speed from your location to server
   - **Solution:** Use CDN or closer server location

4. **Server overload:**
   - Check server CPU/memory usage
   - **Solution:** Upgrade server resources or reduce load (increase intervals)

### Video playback is choppy on Raspberry Pi

**Solutions:**

1. **Use H.264 codec:**
   - Hardware-accelerated on Raspberry Pi
   - Avoid VP9, AV1 (no hardware support)

2. **Reduce resolution:**
   - 1080p maximum for Raspberry Pi 4
   - 720p for Raspberry Pi 3

3. **Reduce bitrate:**
   - Keep video bitrate ≤5 Mbps
   - Use handbrake or ffmpeg to re-encode:
     ```bash
     ffmpeg -i input.mp4 -c:v libx264 -preset slow -crf 22 -maxrate 5M -bufsize 10M -c:a aac output.mp4
     ```

4. **Check Raspberry Pi temperature:**
   - Overheating causes throttling
   - Ensure adequate cooling (heatsink, fan)

5. **Use wired Ethernet:**
   - WiFi may introduce buffering
   - Wired connection is more stable

### Device client is using too much memory

**Solutions:**

1. **Restart device client periodically:**
   - Memory leaks in Chromium can build up
   - Set up daily restart (cron or scheduled task)

2. **Reduce screenshot frequency:**
   - Settings → Display → Screenshot Interval
   - Increase from 5 min to 10 min

3. **Disable unused features:**
   - If not using live remote, screenshots can be less frequent

4. **Upgrade device RAM:**
   - Raspberry Pi 4 with 4GB RAM recommended
   - Windows devices: 4GB minimum

### Live streaming is laggy (low FPS)

**Possible causes:**

1. **Network bandwidth:**
   - Live streaming requires ~2-5 Mbps
   - Test network speed between server and admin

2. **Server CPU:**
   - Forwarding frames uses CPU
   - Check server load during live streaming

3. **Device CPU:**
   - Capturing frames uses CPU
   - Check device health metrics

**Solutions:**
- Reduce screenshot quality (lower JPEG quality) - not yet configurable for screencast
- Use wired network connections
- Close other applications on device
- Upgrade server/device hardware

---

## Security

### How do I enable HTTPS?

See [SSL Certificate Management](admin-guide.md#ssl-certificate-management).

**Quick method:**
1. Use Let's Encrypt with reverse proxy (nginx, Caddy)
2. Forward HTTPS traffic to TheiaCast containers

### Should I change the default database password?

**Yes, absolutely!** The default password in the example `docker-compose.yml` is for demonstration only.

Change it before deploying to production:
1. Edit `docker-compose.yml`
2. Change `POSTGRES_PASSWORD` in both services
3. Redeploy

### How do I enable multi-factor authentication (MFA)?

See [Security Best Practices](admin-guide.md#security-best-practices).

**Quick steps:**
1. Click username → Security
2. Enable MFA
3. Scan QR code with authenticator app
4. Save recovery codes

### Are auto-authentication credentials encrypted?

**Currently:** Credentials are stored in plaintext in the database.

**Recommendation:**
- Use dedicated service accounts with minimal permissions
- Rotate credentials regularly
- Don't store highly sensitive credentials

**Future:** Credential encryption is planned for a future release.

### How often should I rotate device tokens?

**Recommendation:** Every 90 days for production environments.

**To rotate:**
1. Dashboard → Devices → Flip card → "Rotate Token"
2. Update `.env` on device
3. Restart device client

**Future:** Automatic token rotation is planned.

### Can I restrict device connections by IP address?

Not currently supported in the web UI.

**Workaround:** Use firewall rules on server:
```bash
# Example: Only allow specific IP range
sudo iptables -A INPUT -p tcp --dport 5001 -s 192.168.1.0/24 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5001 -j DROP
```

---

## Licensing

### What features are included in the free tier?

Free tier includes:
- Up to 3 devices
- 1 admin user
- All core features:
  - Playlists and scheduling
  - Content management
  - Broadcasting
  - Remote control
  - Health monitoring
  - Screenshots

See [License Management](admin-guide.md#license-management) for full comparison.

### How do I upgrade my license?

1. Settings → License → "Upgrade"
2. Purchase license (external link)
3. Enter license key
4. Click "Activate"

### What happens if my license expires?

When a license expires:
- System reverts to Free tier limitations
- Excess devices become inactive (oldest first)
- Excess users cannot log in (newest first)
- Branding customization is disabled

**Grace period:** 30 days to renew before data cleanup

**Notifications:** Sent at 30 days, 7 days, and on expiration day

### Can I transfer my license to a different server?

Yes. Contact support with your license key and new server details.

For self-hosted licenses, deactivate on old server:
1. Settings → License → "Deactivate"
2. Install TheiaCast on new server
3. Activate with same license key

### Do I need a license for development/testing?

No. Free tier (3 devices, 1 user) is sufficient for development and testing.

For larger test environments, contact sales for evaluation licenses.

---

## Troubleshooting

### Error: "Failed to connect to database"

**Cause:** Backend cannot reach PostgreSQL database.

**Solutions:**

1. **Check PostgreSQL is running:**
   ```bash
   docker-compose ps postgres
   ```
   Should show "Up" status.

2. **Check connection string:**
   - `docker-compose.yml` → `backend` → `environment`
   - Verify `ConnectionStrings__Default` matches PostgreSQL service

3. **Check PostgreSQL logs:**
   ```bash
   docker-compose logs postgres
   ```
   Look for startup errors.

4. **Reset database:**
   ```bash
   docker-compose down -v  # WARNING: Deletes all data!
   docker-compose up -d
   ```

### Error: "Device token is invalid or has expired"

**Cause:** Device token doesn't match server records.

**Solutions:**

1. **Get correct token:**
   - Dashboard → Devices → Flip card → Click token icon
   - Copy token

2. **Update device `.env`:**
   ```bash
   DEVICE_TOKEN=paste-correct-token-here
   ```

3. **Restart device client:**
   ```bash
   # Windows
   Restart-Service TheiaCastClient

   # Raspberry Pi
   pm2 restart kiosk-client
   ```

4. **If token still doesn't work, rotate it:**
   - Dashboard → Devices → Flip card → "Rotate Token"
   - Update `.env` with new token
   - Restart client

### Error: "WebSocket connection failed"

**Cause:** Client cannot establish WebSocket connection to server.

**Solutions:**

1. **Check server URL:**
   - Should be `http://server-ip:5001` (NOT `http://server-ip:5001/ws`)

2. **Check firewall:**
   - Port 5001 must be open on server
   - Outbound connections allowed on client

3. **Check reverse proxy:**
   - If using nginx/Caddy, ensure WebSocket upgrade headers are configured

4. **Test WebSocket endpoint:**
   ```bash
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://server-ip:5001/ws
   ```
   Should return 101 Switching Protocols.

### "Page is blank" or "White screen" on device

**Cause:** Web page failed to load or JavaScript error.

**Solutions:**

1. **Check device client logs:**
   - Look for console errors or navigation failures

2. **Check URL is accessible:**
   - Try opening URL in browser manually
   - Verify URL is correct (no typos)

3. **Check auto-authentication:**
   - If using auto-login, verify selectors are correct
   - Test manually: Disable auto-login, use Visual Remote to log in manually

4. **Restart browser:**
   - Device → Remote Control → "Refresh Page"
   - Or restart device client

### Playlist item doesn't show - "No valid items in time window"

**Cause:** All playlist items have time windows that exclude current time/day.

**Solutions:**

1. **Check time windows:**
   - Dashboard → Playlists → Select playlist
   - Verify time windows include current time

2. **Check days of week:**
   - Verify current day is selected in "Days of Week" filter

3. **Remove time restrictions:**
   - Edit playlist item
   - Clear "Time Window Start" and "Time Window End"
   - Clear "Days of Week" selection
   - Save

4. **Check server time:**
   - Settings → General → Time Zone
   - Verify server time zone is correct

### Device shows "Offline" but client is running

**Cause:** WebSocket connection is broken.

**Solutions:**

1. **Restart device client:**
   ```bash
   # Windows
   Restart-Service TheiaCastClient

   # Raspberry Pi
   pm2 restart kiosk-client
   ```

2. **Check network connectivity:**
   ```bash
   curl http://server-ip:5001/health
   ```

3. **Check device token:**
   - Compare `.env` token with dashboard token

4. **Check server logs:**
   ```bash
   docker-compose logs backend
   ```
   Look for WebSocket connection errors

### Screenshots not updating

**Cause:** Screenshot upload is failing or disabled.

**Solutions:**

1. **Check screenshot interval:**
   - Settings → Display → Screenshot Interval
   - Should be >0 (0 disables screenshots)

2. **Check device client logs:**
   - Look for "Screenshot captured" messages
   - Look for upload errors

3. **Request manual screenshot:**
   - Dashboard → Devices → Flip card → "Screenshot"
   - Check if this works

4. **Check database size:**
   - Large database may slow screenshot storage
   - See [Database Maintenance](admin-guide.md#database-maintenance)

### Can't upload large video files

**Cause:** File size exceeds upload limit.

**Solutions:**

1. **Increase upload limit:**
   - Edit `docker-compose.yml` → `backend` → `environment`
   - Add: `ASPNETCORE_UPLOAD_LIMIT=1073741824` (1GB)
   - Restart backend

2. **Use external hosting:**
   - Upload video to YouTube, Vimeo, or CDN
   - Use URL in content item instead of uploading

3. **Compress video:**
   - Reduce bitrate/resolution with ffmpeg
   - See [Performance](#performance) section for ffmpeg command

---

## Still Need Help?

If your question isn't answered here:

1. **Check other documentation:**
   - [User Guide](user-guide.md)
   - [Administrator Guide](admin-guide.md)
   - [Installation Guide](installation.md)

2. **Search GitHub Issues:**
   - [TheiaCast Issues](https://github.com/jimmyeao/TheiaCast/issues)
   - Someone may have had the same problem

3. **Ask the community:**
   - [GitHub Discussions](https://github.com/jimmyeao/TheiaCast/discussions)

4. **Report a bug:**
   - [Create new issue](https://github.com/jimmyeao/TheiaCast/issues/new)
   - Include logs, screenshots, and steps to reproduce

5. **Contact support:**
   - Email support available on paid tiers
   - See [License Management](admin-guide.md#license-management)

---

**Note**: Screenshots in this guide are indicated with `[Screenshot: description]` placeholders. Actual screenshots will be added in a future update.
