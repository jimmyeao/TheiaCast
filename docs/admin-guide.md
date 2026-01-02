# Administrator Guide

This guide covers advanced configuration and administrative tasks for TheiaCast.

## Table of Contents

1. [User Management](#user-management)
2. [System Settings](#system-settings)
3. [Branding Customization](#branding-customization)
4. [SSL Certificate Management](#ssl-certificate-management)
5. [License Management](#license-management)
6. [Database Management](#database-management)
7. [Security Best Practices](#security-best-practices)
8. [Advanced Troubleshooting](#advanced-troubleshooting)
9. [Performance Optimization](#performance-optimization)
10. [Backup and Recovery](#backup-and-recovery)

---

## User Management

### Creating Admin Users

TheiaCast supports multiple administrator accounts with role-based access control.

**Creating a New User:**

1. **Click your username** in the top-right corner
2. **Select "User Management"**
3. **Click "+ Add User"**
4. **Fill in user details:**
   - Username (required)
   - Email (required)
   - Password (minimum 8 characters)
   - Role (Admin or User)
5. **Click "Create User"**

`[Screenshot: User Management page with user list and Add User button]`

### User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all features including user management, settings, branding |
| **User** | Access to devices, content, playlists, broadcasting (no user management or settings) |

### Editing User Details

1. **Navigate to User Management**
2. **Find the user** in the list
3. **Click "Edit"**
4. **Modify details** (username, email, role)
5. **Click "Save"**

`[Screenshot: Edit user modal with fields]`

### Deleting Users

1. **Navigate to User Management**
2. **Find the user** in the list
3. **Click "Delete"**
4. **Confirm deletion**

**Warning:** You cannot delete the last admin user.

### Password Reset

**For Other Users (Admins):**
1. **Navigate to User Management**
2. **Click "Reset Password"** on the user
3. **Enter new password**
4. **Click "Save"**

**For Your Own Account:**
1. **Click your username** in top-right
2. **Select "Change Password"**
3. **Enter current password**
4. **Enter new password**
5. **Confirm new password**
6. **Click "Update Password"**

`[Screenshot: Change password modal]`

---

## System Settings

Access system settings by clicking your username → "Settings".

`[Screenshot: Settings page with all sections]`

### General Settings

**System Name:**
- Customize the application name shown in the dashboard
- Default: "TheiaCast"

**Time Zone:**
- Set the server time zone for accurate scheduling
- Affects all time window calculations

**Date Format:**
- Choose date display format (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD)

**Language:**
- Select interface language (currently English only)

### Display Settings

**Default Playlist Duration:**
- Default duration (in seconds) for new playlist items
- Applied when adding content to playlists
- Can be overridden per item

**Screenshot Interval:**
- How often devices should capture screenshots (in minutes)
- Default: 5 minutes
- Minimum: 1 minute
- Lower values increase server storage usage

**Health Report Interval:**
- How often devices should report health metrics (in seconds)
- Default: 60 seconds
- Minimum: 10 seconds
- Lower values increase network traffic

### Broadcast Settings

**Default Broadcast Duration:**
- Default duration for broadcast messages (in seconds)
- Default: 30 seconds

**Broadcast Priority:**
- Whether broadcasts should interrupt current content immediately
- Default: Enabled

### Advanced Settings

**Enable Debug Logging:**
- Enable detailed logging for troubleshooting
- Warning: Creates large log files

**API Rate Limiting:**
- Maximum API requests per minute per client
- Default: 100
- Prevents abuse

**WebSocket Ping Interval:**
- How often to ping clients to check connection (in seconds)
- Default: 30 seconds

---

## Branding Customization

**Branding customization is available on paid tiers only.**

### Customizing Logo

1. **Navigate to Settings → Branding**
2. **Click "Upload Logo"**
3. **Select image file:**
   - Supported formats: PNG, SVG (recommended), JPG
   - Recommended size: 200x50 pixels
   - Maximum file size: 2MB
4. **Click "Save"**

`[Screenshot: Branding section with logo upload]`

Your logo will appear:
- In the top-left corner of the dashboard
- On the login page
- In device client displays (if configured)

### Customizing Colors

1. **Navigate to Settings → Branding**
2. **Select "Custom Colors"**
3. **Choose colors:**
   - Primary color (buttons, links)
   - Secondary color (highlights)
   - Accent color (notifications)
4. **Preview changes** in real-time
5. **Click "Save"**

`[Screenshot: Color picker interface with preview]`

### Custom Login Message

1. **Navigate to Settings → Branding**
2. **Enter custom message** in "Login Message" field
3. **Click "Save"**

Displayed below the login form. Useful for:
- Welcome messages
- Company policies
- Support contact information

---

## SSL Certificate Management

TheiaCast supports custom SSL certificates for HTTPS connections.

### Uploading SSL Certificate

**Prerequisites:**
- SSL certificate file (.crt or .pem)
- Private key file (.key)
- Optional: Certificate chain/intermediate certificates

**Steps:**

1. **Navigate to Settings → SSL**
2. **Click "Upload Certificate"**
3. **Select files:**
   - Certificate file
   - Private key file
   - Chain file (optional)
4. **Enter private key password** (if encrypted)
5. **Click "Upload and Apply"**

`[Screenshot: SSL certificate upload form]`

**The server will restart** to apply the new certificate (approximately 10 seconds of downtime).

### Certificate Status

The SSL section shows:
- **Current certificate:** Domain name and issuer
- **Expiration date:** When certificate expires
- **Days remaining:** Visual indicator (red if <30 days)

`[Screenshot: SSL status showing certificate details]`

### Let's Encrypt Integration (Coming Soon)

Automatic SSL certificate generation and renewal via Let's Encrypt will be available in a future update.

---

## License Management

### License Tiers

TheiaCast offers multiple licensing tiers:

| Feature | Free | Basic | Professional | Enterprise |
|---------|------|-------|--------------|------------|
| Devices | Up to 3 | Up to 10 | Up to 50 | Unlimited |
| Users | 1 | 3 | 10 | Unlimited |
| Branding | ❌ | ✅ | ✅ | ✅ |
| SSL Upload | ❌ | ✅ | ✅ | ✅ |
| Advanced Scheduling | ✅ | ✅ | ✅ | ✅ |
| Broadcasting | ✅ | ✅ | ✅ | ✅ |
| Remote Control | ✅ | ✅ | ✅ | ✅ |
| Support | Community | Email | Priority Email | Phone + Email |

### Viewing Current License

1. **Navigate to Settings → License**
2. **View license details:**
   - Current tier
   - Licensed devices
   - Licensed users
   - Expiration date
   - License key (masked)

`[Screenshot: License information panel]`

### Upgrading License

1. **Navigate to Settings → License**
2. **Click "Upgrade"**
3. **Select desired tier**
4. **Complete purchase** (external link)
5. **Enter license key** received via email
6. **Click "Activate"**

`[Screenshot: License activation modal]`

### License Expiration

When a license expires:
- System reverts to Free tier limitations
- Excess devices become inactive (oldest devices first)
- Excess users cannot log in (last created users first)
- Branding customization is disabled
- You have 30 days to renew before data cleanup

**Email notifications** are sent at:
- 30 days before expiration
- 7 days before expiration
- On expiration day

---

## Database Management

### Database Configuration

TheiaCast uses PostgreSQL as its database backend.

**Connection String:**
Located in `docker-compose.yml` (Docker) or `appsettings.json` (manual installation):

```yaml
ConnectionStrings__Default=Host=postgres;Port=5432;Database=theiacast;Username=postgres;Password=your-password
```

### Viewing Database Size

1. **SSH into the server**
2. **Run command:**
   ```bash
   docker exec -it theiacast-postgres psql -U postgres -d theiacast -c "SELECT pg_size_pretty(pg_database_size('theiacast'));"
   ```

### Database Maintenance

**Automatic Maintenance:**
- Entity Framework Core handles schema migrations automatically on startup
- No manual migration steps required for updates

**Manual Vacuum (Performance):**
```bash
docker exec -it theiacast-postgres psql -U postgres -d theiacast -c "VACUUM ANALYZE;"
```

Run this monthly to optimize database performance.

### Cleaning Old Data

**Screenshots:**
Screenshots are automatically cleaned up based on retention policy (default: 30 days).

To change retention:
1. **Navigate to Settings → Advanced**
2. **Set "Screenshot Retention Days"**
3. **Click "Save"**

**Device Logs:**
Device logs are retained indefinitely. To clean old logs:

```bash
# Delete logs older than 90 days
docker exec -it theiacast-postgres psql -U postgres -d theiacast -c "DELETE FROM device_logs WHERE timestamp < NOW() - INTERVAL '90 days';"
```

---

## Security Best Practices

### Password Policies

**Enforce Strong Passwords:**
1. **Navigate to Settings → Security**
2. **Enable "Enforce Password Complexity"**
3. **Set requirements:**
   - Minimum length (default: 8)
   - Require uppercase
   - Require numbers
   - Require special characters
4. **Click "Save"**

### Multi-Factor Authentication (MFA)

**Enabling MFA for Your Account:**
1. **Click your username → Security**
2. **Click "Enable MFA"**
3. **Scan QR code** with authenticator app (Google Authenticator, Authy, etc.)
4. **Enter verification code**
5. **Save recovery codes** in a secure location
6. **Click "Confirm"**

`[Screenshot: MFA setup with QR code]`

**Enforcing MFA for All Users (Admins):**
1. **Navigate to Settings → Security**
2. **Enable "Require MFA for All Users"**
3. **Set grace period** (days users have to enable MFA)
4. **Click "Save"**

### Device Token Security

**Token Rotation:**
Device tokens should be rotated periodically for security.

1. **Navigate to Devices**
2. **Flip device card**
3. **Click "Rotate Token"**
4. **Copy new token**
5. **Update device client `.env` file**
6. **Restart device client**

**Auto-Rotation Policy (Coming Soon):**
Automatic token rotation every 90 days.

### Network Security

**Firewall Configuration:**
- Only expose ports 80 (HTTP) and 443 (HTTPS) to public internet
- Keep port 5432 (PostgreSQL) internal only
- Use VPN or SSH tunnel for administrative database access

**Reverse Proxy:**
Use nginx or similar reverse proxy for additional security:
- Rate limiting
- DDoS protection
- SSL termination
- Request filtering

### Content Security

**Auto-Authentication Credentials:**
Credentials stored in content items (for auto-login) are currently stored in plaintext in the database.

**Recommendation:**
- Use dedicated service accounts with minimal permissions
- Rotate credentials regularly
- Avoid storing highly sensitive credentials
- Plan: Credential encryption is planned for future release

---

## Advanced Troubleshooting

### Viewing Server Logs

**Docker Deployment:**
```bash
# Backend logs
docker-compose logs -f backend

# Frontend logs
docker-compose logs -f frontend

# Database logs
docker-compose logs -f postgres

# All logs
docker-compose logs -f
```

**Manual Deployment:**
- Backend logs: Check application output or system journal
- Frontend logs: Check nginx error logs

### Enabling Debug Logging

1. **Navigate to Settings → Advanced**
2. **Enable "Debug Logging"**
3. **Click "Save"**
4. **Restart backend** to apply

**Warning:** Debug logging creates large log files. Disable after troubleshooting.

### WebSocket Connection Issues

**Symptoms:**
- Devices showing as offline when they should be online
- Real-time updates not appearing in dashboard
- Screenshot thumbnails not updating

**Troubleshooting:**

1. **Check WebSocket endpoint:**
   ```bash
   # Test WebSocket connection
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://your-server:5001/ws
   ```

2. **Check reverse proxy configuration:**
   - Ensure WebSocket upgrade headers are passed through
   - nginx example:
     ```nginx
     location /ws {
         proxy_pass http://backend:8080/ws;
         proxy_http_version 1.1;
         proxy_set_header Upgrade $http_upgrade;
         proxy_set_header Connection "upgrade";
     }
     ```

3. **Check firewall:**
   - Ensure port 5001 (or your configured port) is open
   - Check for WebSocket-specific firewall rules

### Device Not Connecting

**Symptoms:**
- Device shows as offline immediately after registration
- Device client logs show connection errors

**Troubleshooting Steps:**

1. **Verify device token:**
   ```bash
   # In device client .env file
   DEVICE_TOKEN=<correct-token>
   ```

2. **Verify server URL:**
   ```bash
   # Should NOT include /ws path
   SERVER_URL=http://your-server:5001
   ```

3. **Check device client logs:**
   ```bash
   # Windows
   journalctl -u theiacast-client -f

   # Raspberry Pi
   pm2 logs kiosk-client
   ```

4. **Test network connectivity:**
   ```bash
   # From device, test HTTP
   curl http://your-server:5001/health

   # Should return: {"status":"healthy"}
   ```

### Playlist Not Updating on Device

**Symptoms:**
- Assign playlist to device in dashboard
- Device continues showing old content

**Troubleshooting:**

1. **Check device connection:**
   - Device should show green "Online" status
   - If offline, device is not receiving updates

2. **Check WebSocket events:**
   - Enable debug logging
   - Look for `content:update` event in device client logs

3. **Manual refresh:**
   - Flip device card → Click "Refresh Page"
   - Or use Remote Control to navigate

### High CPU Usage

**Symptoms:**
- Backend container using high CPU
- Slow dashboard performance

**Possible Causes:**

1. **Too many screenshots:**
   - Increase screenshot interval (Settings → Display)
   - Reduce screenshot retention period

2. **Too many devices:**
   - Check if you've exceeded license tier device limit
   - Consider upgrading license

3. **Database query performance:**
   - Run manual VACUUM (see Database Maintenance section)
   - Check for missing indexes (should be automatic)

4. **Memory leak:**
   - Restart backend container
   - Report issue on GitHub

---

## Performance Optimization

### Server Performance

**Recommended Specifications (by number of devices):**

| Devices | RAM | CPU | Storage |
|---------|-----|-----|---------|
| 1-10 | 2GB | 2 cores | 20GB |
| 11-50 | 4GB | 4 cores | 50GB |
| 51-100 | 8GB | 8 cores | 100GB |
| 100+ | 16GB+ | 16+ cores | 200GB+ |

**Optimization Tips:**

1. **Increase screenshot interval:**
   - Settings → Display → Screenshot Interval
   - 5 minutes → 10 minutes reduces database writes by 50%

2. **Reduce health report frequency:**
   - Settings → Display → Health Report Interval
   - 60 seconds → 120 seconds reduces WebSocket traffic by 50%

3. **Use content CDN:**
   - Host large video files on external CDN
   - Reference CDN URLs in content items
   - Reduces server bandwidth and storage

4. **Enable database connection pooling:**
   - Already enabled by default (100 connections)
   - Increase in `appsettings.json` if needed:
     ```json
     "ConnectionStrings": {
       "Default": "Host=postgres;...;Maximum Pool Size=200;"
     }
     ```

### Client Performance

**Raspberry Pi Optimization:**

1. **Use H.264 video codec:**
   - Most efficient for Raspberry Pi hardware decoding
   - Avoid VP9, AV1 (no hardware support)

2. **Limit video resolution:**
   - 1080p maximum for Raspberry Pi 4
   - 720p for Raspberry Pi 3

3. **Disable unnecessary features:**
   - Reduce screenshot quality (lower JPEG quality)
   - Increase screenshot interval

**Windows Client Optimization:**

1. **Use hardware acceleration:**
   - Enabled by default in Puppeteer
   - Ensure GPU drivers are up to date

2. **Close other applications:**
   - Dedicated kiosk devices should run client only

---

## Backup and Recovery

### Backup Strategy

**What to Backup:**

1. **Database (Critical):**
   - Contains all devices, content, playlists, users, settings
   - Backup daily at minimum

2. **Media Files (Important):**
   - Uploaded images, videos, presentations
   - Located in Docker volume: `theiacast_media`

3. **Configuration Files (Important):**
   - `docker-compose.yml`
   - `.env` files
   - SSL certificates (if uploaded)

### Database Backup

**Manual Backup:**
```bash
# Create backup directory
mkdir -p ~/theiacast-backups

# Backup database
docker exec theiacast-postgres pg_dump -U postgres theiacast > ~/theiacast-backups/backup-$(date +%Y%m%d-%H%M%S).sql
```

**Automated Daily Backup (Cron):**
```bash
# Edit crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * docker exec theiacast-postgres pg_dump -U postgres theiacast > ~/theiacast-backups/backup-$(date +\%Y\%m\%d).sql
```

**Keep last 30 days:**
```bash
# Add to crontab (runs at 3 AM daily)
0 3 * * * find ~/theiacast-backups -name "backup-*.sql" -mtime +30 -delete
```

### Media Files Backup

**Manual Backup:**
```bash
# Backup media volume to tar archive
docker run --rm -v theiacast_media:/data -v ~/theiacast-backups:/backup ubuntu tar czf /backup/media-$(date +%Y%m%d).tar.gz -C /data .
```

**Automated Backup:**
```bash
# Add to crontab (runs at 1 AM daily)
0 1 * * * docker run --rm -v theiacast_media:/data -v ~/theiacast-backups:/backup ubuntu tar czf /backup/media-$(date +\%Y\%m\%d).tar.gz -C /data .
```

### Database Restoration

**Restore from Backup:**
```bash
# Stop backend to prevent connections
docker-compose stop backend

# Drop and recreate database (WARNING: Deletes all current data!)
docker exec -it theiacast-postgres psql -U postgres -c "DROP DATABASE theiacast;"
docker exec -it theiacast-postgres psql -U postgres -c "CREATE DATABASE theiacast;"

# Restore from backup file
cat ~/theiacast-backups/backup-20250102.sql | docker exec -i theiacast-postgres psql -U postgres theiacast

# Restart backend
docker-compose start backend
```

### Media Files Restoration

**Restore from Backup:**
```bash
# Stop backend to prevent writes
docker-compose stop backend

# Extract backup to volume
docker run --rm -v theiacast_media:/data -v ~/theiacast-backups:/backup ubuntu tar xzf /backup/media-20250102.tar.gz -C /data

# Restart backend
docker-compose start backend
```

### Disaster Recovery

**Complete System Restoration:**

1. **Install TheiaCast** on new server (follow Installation Guide)
2. **Stop all services:**
   ```bash
   docker-compose down
   ```
3. **Restore database** (see Database Restoration above)
4. **Restore media files** (see Media Files Restoration above)
5. **Restore configuration:**
   ```bash
   # Copy docker-compose.yml and .env files from backup
   cp ~/theiacast-backups/docker-compose.yml .
   ```
6. **Start services:**
   ```bash
   docker-compose up -d
   ```
7. **Verify restoration:**
   - Check dashboard loads
   - Verify devices appear
   - Test content playback

**Device Re-connection:**
- Devices should automatically reconnect when server comes online
- No action needed on device side (tokens persist)

---

## Support and Resources

### Getting Help

- **Community Support:** [GitHub Discussions](https://github.com/jimmyeao/TheiaCast/discussions)
- **Bug Reports:** [GitHub Issues](https://github.com/jimmyeao/TheiaCast/issues)
- **Email Support:** Available on paid tiers (see License Management section)

### Additional Resources

- [User Guide](user-guide.md) - Daily operations and features
- [Installation Guide](installation.md) - Setup instructions
- [FAQ](faq.md) - Common questions and answers
- [GitHub Repository](https://github.com/jimmyeao/TheiaCast) - Source code and releases

---

**Note**: Screenshots in this guide are indicated with `[Screenshot: description]` placeholders. Actual screenshots will be added in a future update.
