# User Guide

Complete guide to using TheiaCast Digital Signage for daily operations.

## Table of Contents

- [Dashboard Overview](#dashboard-overview)
- [Managing Devices](#managing-devices)
- [Managing Content](#managing-content)
- [Creating Playlists](#creating-playlists)
- [Broadcasting Messages](#broadcasting-messages)
- [Remote Control](#remote-control)
- [Tags and Organization](#tags-and-organization)
- [Monitoring and Logs](#monitoring-and-logs)

---

## Dashboard Overview

The dashboard is your central control panel for managing all displays and content.

`[Screenshot: Dashboard home page showing overview statistics]`

### Main Navigation

The left sidebar provides access to all features:

- **📊 Dashboard** - Overview of your system
- **💻 Devices** - Manage display devices
- **🎬 Content** - Upload and manage content
- **📅 Playlists** - Create content schedules
- **📝 Logs** - View system logs
- **👥 Users** - Manage user accounts
- **🔑 License** - View license status
- **⚙️ Settings** - Configure system settings

### Quick Stats

The dashboard shows at-a-glance information:
- Total devices (online/offline)
- Total content items
- Total playlists
- Active broadcasts
- System health

`[Screenshot: Dashboard statistics cards]`

---

## Managing Devices

Devices are the display screens running your content (Windows PCs, Raspberry Pis, etc.).

### Viewing Devices

Navigate to **Devices** in the sidebar.

`[Screenshot: Devices page showing multiple device cards]`

Each device card shows:
- **Device name** and status (Online/Offline)
- **Live thumbnail** - Latest screenshot
- **Current playlist** - What's currently assigned
- **Playback controls** - Pause, resume, next, previous
- **Health status** - Click card to flip and see details

### Adding a New Device

1. Click **+ Add Device**

   `[Screenshot: Add device button highlighted]`

2. Fill in the device details:
   - **Device ID**: Unique identifier (e.g., "lobby-display-01")
   - **Name**: Friendly name (e.g., "Main Lobby Display")
   - **Description**: Optional description
   - **Location**: Optional location info

   `[Screenshot: Add device modal with form fields]`

3. Click **Create**

4. **Important**: Copy the device token shown in the popup
   - You'll need this to configure the client software
   - Store it securely - you can view it later if needed

   `[Screenshot: Device token popup]`

5. Install and configure the client software on your display device using this token (see [Installation Guide](installation.md))

### Device Actions

Click on a device card to flip it and reveal actions:

`[Screenshot: Device card back showing action buttons]`

**Available actions:**
- **Assign Playlist** - Choose which playlist to display
- **Screenshot** - Take immediate screenshot
- **Live Remote** - View and control display in real-time
- **Visual Remote** - Control using screenshot interface
- **View Token** - Show the device token
- **Delete** - Remove device (confirmation required)

### Filtering Devices by Tags

Use tags to organize devices by location, department, or purpose:

1. Click **Manage Tags** to create tags
2. Assign tags to devices
3. Use the tag filter buttons to show only specific groups

`[Screenshot: Tag filter buttons at top of devices page]`

### Playback Controls

Control playlist playback directly from the device card:

`[Screenshot: Playback controls on device card]`

- **▶️ Play/⏸️ Pause** - Resume or pause playlist rotation
- **⏮️ Previous** - Go to previous playlist item
- **⏭️ Next** - Skip to next playlist item
- **Status indicator** - Shows playing (green), paused (yellow), or broadcasting (purple)
- **Item counter** - Shows current item position (e.g., "2/5")

### Viewing Device Details

Click the thumbnail to see:
- Full-size screenshot
- Current URL
- Health metrics (CPU, memory, disk usage)
- Connection status
- Last screenshot timestamp

`[Screenshot: Device details modal with health metrics]`

---

## Managing Content

Content is what displays on your screens - websites, videos, images, or presentations.

### Viewing Content

Navigate to **Content** in the sidebar.

`[Screenshot: Content page with grid view]`

### View Modes

Toggle between two viewing modes:
- **Grid view** (📱) - Thumbnail previews
- **List view** (☰) - Detailed list

Your preference is saved automatically.

### Content Types

TheiaCast supports four content types:

1. **🌐 Web Pages** - Any website URL
2. **🎬 Videos** - MP4 files uploaded or from URL
3. **🖼️ Images** - JPG, PNG files
4. **📊 Presentations** - PowerPoint files (converted to slideshow)

### Adding Web Content

1. Click **+ Add Content**

   `[Screenshot: Add content button]`

2. Enter details:
   - **Name**: Descriptive name
   - **URL**: Full website address (e.g., https://example.com)
   - **Description**: Optional notes

   `[Screenshot: Add web content form]`

3. Click **Save**

### Uploading Videos

1. Click the **Upload Video** button

   `[Screenshot: Upload video button]`

2. Fill in the form:
   - **Name**: Video title
   - **File**: Choose your MP4 file (max 2.5GB)
   - Upload progress will show

   `[Screenshot: Video upload form with progress bar]`

3. Click **Upload**

The video will be:
- Uploaded to the server
- Cached on display devices
- Available for playlists immediately

### Uploading Images

1. Click **Upload Image**
2. Enter name and select image file (JPG or PNG)
3. Click **Upload**

Images display full-screen on devices.

`[Screenshot: Uploaded image in content library]`

### Uploading Presentations

1. Click **Upload Presentation**
2. Enter details:
   - **Name**: Presentation title
   - **File**: PowerPoint file (.pptx)
   - **Duration per slide**: Seconds to show each slide (default: 10)

   `[Screenshot: Upload presentation form]`

3. Click **Upload**

The presentation will be converted to individual slides.

### Auto-Authentication for Websites

Some websites require login. TheiaCast can automatically log in for you.

1. Edit a web content item
2. Expand **Auto-Authentication** section
3. Fill in:
   - **Username Selector**: CSS selector for username field (e.g., `#username`)
   - **Password Selector**: CSS selector for password field (e.g., `#password`)
   - **Submit Selector**: CSS selector for submit button (e.g., `button[type="submit"]`)
   - **Username**: Login username
   - **Password**: Login password
   - Enable **Auto Login** checkbox

   `[Screenshot: Auto-authentication form fields]`

4. Click **Save**

**Finding CSS Selectors:**
1. Open the website in Chrome/Edge
2. Right-click the login field → Inspect
3. Note the `id` or `name` attribute
4. Use `#id` for IDs or `[name="fieldname"]` for names

### Editing Content

1. Click the edit button (✏️) on any content item
2. Modify the details
3. Click **Save**

### Deleting Content

1. Click the delete button (🗑️)
2. Confirm deletion
3. **Note**: Content used in playlists will be removed from those playlists

### Searching Content

Use the search box to find content by name or URL:

`[Screenshot: Search box filtering content]`

### Storage Management

View storage usage at the bottom of the Content page:

`[Screenshot: Storage usage statistics]`

Shows:
- Total space available
- Space used by videos, images, presentations
- Percentage used

---

## Creating Playlists

Playlists control what content displays on devices and when.

### Viewing Playlists

Navigate to **Playlists** in the sidebar.

`[Screenshot: Playlists page with 2-column grid layout]`

### Filtering Playlists

Use the filter tools at the top:
- **Search box**: Find playlists by name or description
- **Tag filters**: Click tags to filter by category
- **Results counter**: Shows how many playlists match

`[Screenshot: Playlist filters and search]`

### Creating a Playlist

1. Click **+ Create Playlist**

   `[Screenshot: Create playlist button]`

2. Enter details:
   - **Name**: Playlist name (e.g., "Reception Area - Weekdays")
   - **Description**: Optional notes
   - **Active**: Check to enable immediately

   `[Screenshot: Create playlist modal]`

3. Click **Create**

### Adding Items to Playlist

1. Find your playlist and click **Add Item**

   `[Screenshot: Add item button on playlist card]`

2. Configure the item:
   - **Content**: Select from your content library
   - **Display Duration**: Seconds to show (0 = permanent/static)
   - **Order**: Position in playlist (auto-assigned)

   `[Screenshot: Add playlist item modal]`

3. Click **Save**

**Duration Tips:**
- **0 seconds**: Content stays on screen permanently (good for single-item playlists)
- **15-30 seconds**: Good for images and short videos
- **60+ seconds**: For detailed dashboards or long videos

### Advanced Scheduling

Restrict when content displays using time windows and days of week.

#### Time Windows

Show content only during specific hours:

1. When adding/editing a playlist item, expand **Time Window**
2. Set **Start Time** and **End Time** (24-hour format)
   - Example: 09:00 to 17:00 (9 AM to 5 PM)

   `[Screenshot: Time window configuration]`

3. Content only displays between these times

#### Days of Week

Show content only on specific days:

1. In the playlist item editor, expand **Days of Week**
2. Check the days when content should display
   - Example: Monday-Friday only

   `[Screenshot: Days of week checkboxes]`

3. Content only displays on selected days

#### Combined Scheduling Example

Show "Lunch Menu" only Monday-Friday, 11:30 AM - 1:30 PM:
- Time Window: 11:30 - 13:30
- Days: Mon, Tue, Wed, Thu, Fri checked

`[Screenshot: Example scheduled item with both constraints]`

### Reordering Playlist Items

Drag and drop items to change their order:

1. Click and hold the drag handle (≡) on an item
2. Drag to new position
3. Release

   `[Screenshot: Drag and drop reordering]`

The order saves automatically.

### Editing Playlist Items

1. Click **Edit** on any playlist item
2. Modify settings
3. Click **Save**

Changes take effect immediately on all assigned devices.

### Removing Items from Playlist

1. Click **Remove** on the item
2. Confirm deletion

The item is removed from this playlist but remains in your content library.

### Assigning Playlists to Devices

1. Go to **Devices** page
2. Click a device card to flip it
3. Click **Assign Playlist**
4. Select the playlist
5. Click **Assign**

   `[Screenshot: Assign playlist to device]`

The device will immediately start playing the playlist.

**Notes:**
- A device can have multiple playlists assigned
- Priority is given to the most recently assigned active playlist
- Inactive playlists are ignored

### Playlist Tags

Organize playlists with tags:

1. Edit a playlist
2. Select tags or create new ones
3. Save

Use tag filters on the Playlists page to find related playlists.

---

## Broadcasting Messages

Broadcast urgent messages to all displays immediately, overriding playlists.

### Starting a Broadcast

1. At the top of the **Dashboard** page, click **Start Broadcast to All Devices**

   `[Screenshot: Broadcast button on dashboard]`

2. Choose broadcast type:
   - **Message**: Text message with custom background
   - **URL**: Navigate all displays to a website
   - **Image**: Show an image file
   - **Video**: Play a video file

   `[Screenshot: Broadcast type selection]`

### Message Broadcast

Display a formatted text message:

1. Select **Message** type
2. Enter your message text
3. Click **Start Broadcast**

   `[Screenshot: Message broadcast modal]`

All devices will immediately show your message in a styled card.

### URL Broadcast

Send all displays to a specific website:

1. Select **URL** type
2. Enter the full URL
3. Click **Start Broadcast**

### Image/Video Broadcast

1. Select **Image** or **Video** type
2. Upload the file (or select from library if available)
3. Click **Start Broadcast**

   `[Screenshot: Image broadcast upload]`

### Targeting Specific Devices

Filter which devices receive the broadcast:

1. In the broadcast modal, expand **Target Devices**
2. Select tags to filter devices
3. The counter shows how many devices will receive it
4. Click **Start Broadcast**

   `[Screenshot: Tag-based device targeting]`

### Broadcast Settings (Paid Feature)

Customize message appearance:

1. Click **Settings** next to the broadcast button
2. Upload custom background image
3. Upload logo
4. Select logo position
5. Preview the design
6. Click **Save Settings**

   `[Screenshot: Broadcast settings modal with preview]`

### Ending a Broadcast

1. The **Active Broadcast** banner shows at top of Dashboard
2. Click **End Broadcast**
3. Devices return to their assigned playlists

   `[Screenshot: Active broadcast banner with end button]`

---

## Remote Control

View and interact with displays in real-time from the dashboard.

### Live Remote Control

The most powerful way to interact with displays:

1. Go to **Devices**
2. Click device card → **Live Remote**

   `[Screenshot: Live remote button on device]`

3. A modal opens showing live video stream from the device

   `[Screenshot: Live remote control modal with stream]`

**Features:**
- **Live video** at 10-30 FPS
- **Click anywhere** on the stream to interact
- **Type directly** when focused (click the video first)
- **FPS counter** shows stream performance
- **Connection status** indicator

**Keyboard Control:**
1. Click the video to focus it
2. "KEYBOARD ACTIVE" indicator appears
3. Type normally - keystrokes go to the device
4. Perfect for entering passwords or filling forms

   `[Screenshot: Keyboard active indicator]`

### Visual Remote Control

Screenshot-based interaction with auto-refresh:

1. Click **Visual Remote** on a device
2. Screenshot-based interface loads
3. Enable **Auto-refresh** for continuous updates (every 2 seconds)

   `[Screenshot: Visual remote with auto-refresh toggle]`

**Features:**
- **Click on screenshot** to interact at that position
- **Keyboard controls** sidebar with common keys
- **Type text** with optional CSS selector targeting
- **Refresh page** button
- Lower bandwidth than live remote

### Basic Remote Control

Simple command interface:

1. Click **Remote** on a device
2. Use the control panel:
   - **Type text**: Enter text with optional CSS selector
   - **Special keys**: Enter, Tab, Escape, Arrow keys, F5
   - **Click coordinates**: Send click at X,Y position
   - **Scroll**: Scroll up/down/left/right

   `[Screenshot: Basic remote control panel]`

### Remote Control Use Cases

**Website Login:**
1. Open Live Remote
2. Click username field
3. Type username
4. Click password field
5. Type password
6. Click login button

**Form Filling:**
1. Use Visual Remote with auto-refresh
2. Type in specific fields using CSS selectors
3. Send Tab key to move between fields
4. Send Enter to submit

**Debugging Display Issues:**
1. Use Live Remote to see exactly what device sees
2. Open browser developer tools if needed
3. Navigate menus and test interactions

---

## Tags and Organization

Tags help organize devices, playlists, and content into logical groups.

### Creating Tags

1. Go to **Devices** page
2. Click **Manage Tags**

   `[Screenshot: Manage tags button]`

3. Click **+ Create Tag**
4. Enter tag name and choose a color
5. Click **Create**

   `[Screenshot: Create tag modal]`

### Assigning Tags to Devices

1. Edit a device
2. Select tags from the list
3. Save

Or use bulk tagging:
1. Select multiple devices (if feature available)
2. Apply tag to all

### Assigning Tags to Playlists

1. Edit a playlist
2. Select tags
3. Save

### Filtering by Tags

**On Devices Page:**
- Click tag buttons at top to show only tagged devices
- Click multiple tags to filter by all selected tags

  `[Screenshot: Device tag filters]`

**On Playlists Page:**
- Use tag filter buttons in the filter card
- Combine with search for powerful filtering

  `[Screenshot: Playlist tag filters]`

### Tag Organization Examples

**By Location:**
- "Building-A", "Building-B", "Building-C"
- "Floor-1", "Floor-2", "Floor-3"
- "Lobby", "Cafeteria", "Conference"

**By Department:**
- "HR", "IT", "Sales", "Marketing"

**By Purpose:**
- "Information", "Wayfinding", "Menu", "Dashboard"

**By Schedule:**
- "24/7", "Business-Hours", "Weekday-Only"

---

## Monitoring and Logs

### Device Health Monitoring

View real-time health metrics for each device:

1. Go to **Devices**
2. Click a device card to flip it
3. View health indicators:
   - **CPU Usage**: Percentage of CPU in use
   - **Memory Usage**: RAM utilization
   - **Disk Usage**: Storage space used
   - **Status**: Online/Offline
   - **Last Seen**: Time of last connection

   `[Screenshot: Device health metrics on card back]`

**Health indicators update every 60 seconds automatically.**

### Viewing Screenshots

See what's currently displayed:

1. Device card shows latest thumbnail
2. Click thumbnail for full-size view
3. Click **Screenshot** button for immediate refresh

   `[Screenshot: Screenshot viewer modal]`

**Automatic screenshots:**
- Single-item playlists: Every 30 seconds
- Multi-item playlists: On each rotation
- On-demand: Click Screenshot button

### System Logs

View system activity and troubleshoot issues:

1. Go to **Logs** in the sidebar
2. Filter by:
   - Device
   - Log level (Info, Warning, Error)
   - Date range

   `[Screenshot: Logs page with filters]`

3. Each log entry shows:
   - Timestamp
   - Device name
   - Message
   - Level/severity

### Device Logs

View logs specific to a device:

1. Go to **Devices**
2. Click **View Logs** on a device
3. Logs filtered to that device appear

Useful for troubleshooting connection or playback issues.

---

## Tips and Best Practices

### Content Organization
- Use descriptive names for all content
- Tag content by category or purpose
- Regularly review and delete unused content
- Keep video file sizes reasonable (under 500MB)

### Playlist Management
- Test playlists on one device before deploying widely
- Use meaningful playlist names (include location or purpose)
- Set reasonable display durations (15-30s for most content)
- Use time windows to avoid showing outdated information

### Device Management
- Name devices by location (e.g., "Reception-MainLobby")
- Tag devices consistently
- Monitor device health regularly
- Keep devices on stable network connections

### Performance Optimization
- Use cached videos instead of streaming when possible
- Optimize image sizes before uploading
- Limit playlist items to 10-15 per playlist
- Schedule content updates during off-hours

### Security
- Change default passwords immediately
- Use strong device tokens
- Keep server software updated
- Enable HTTPS for production use
- Restrict network access to server

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` or `/` | Focus search (where available) |
| `Esc` | Close modal |
| `←` `→` | Navigate between items |
| `Enter` | Select/confirm |

---

## Getting Help

- **FAQ**: See [FAQ](faq.md) for common questions
- **Installation Issues**: Check [Installation Guide](installation.md)
- **Advanced Config**: See [Administrator Guide](admin-guide.md)
- **Report Bugs**: https://github.com/jimmyeao/TheiaCast/issues

---

**Next**: Read the [Administrator Guide](admin-guide.md) for advanced configuration options.
