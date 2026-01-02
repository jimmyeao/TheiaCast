# Remote Browser Control - Usage Guide

**Last Updated:** 2025-12-30

The system supports comprehensive remote browser interaction, allowing admins to control browsers on both Raspberry Pi and Windows clients in real-time. This includes **live video streaming** via Chrome DevTools Protocol (CDP) and screenshot-based remote control.

## 🎯 Features Implemented

### 1. Live Remote Control (Primary Method)
**Full-featured live streaming interface with direct interaction**

- **Real-time Video Stream**: 10-30 FPS live stream via CDP (Raspberry Pi) or polling (Windows)
- **Click-to-Interact**: Click anywhere on the live stream to send click commands
- **Direct Keyboard Input**: Focus canvas and type directly (including passwords)
- **FPS Indicator**: Monitor stream performance in real-time
- **Connection Status**: Visual feedback of connection state
- **Automatic Scaling**: Coordinates automatically scaled to device resolution

**Frontend Component**: `LiveRemoteControl.tsx`
**Usage**: Click "Live Remote" button on device card in admin UI

### 2. Visual Remote Control (Fallback Method)
**Screenshot-based remote control with auto-refresh**

- **Auto-refresh Mode**: Continuous screenshot updates every 2 seconds
- **Click on Screenshot**: Click anywhere to send click commands
- **Keyboard Controls Sidebar**: Buttons for special keys (Enter, Tab, ESC, F5, arrows)
- **Text Input with Selectors**: Type text with optional CSS selector targeting
- **Manual Refresh**: On-demand screenshot refresh

**Frontend Component**: `VisualRemoteControl.tsx`
**Usage**: Click "Visual Remote" button on device card in admin UI

### 3. Remote Control Commands (Backend API)
- **Remote Click** - Click at specific coordinates with button support (left/right/middle)
- **Remote Type** - Type text into form fields with optional CSS selector targeting
- **Remote Key** - Press keyboard keys with modifier support (Ctrl, Shift, Alt, Meta)
- **Remote Scroll** - Scroll the page (absolute or relative, deltaX/deltaY)

## 🏗️ Architecture: HTTP Control + WebSocket Data

**Critical Design**: The system uses a **hybrid communication model**:

### HTTP Endpoints (Control Plane)
- **Purpose**: Reliable command delivery with error feedback
- **Used For**: Screencast start/stop, remote commands (click, type, key, scroll)
- **Benefits**: Request-response pattern, error codes, reference counting, timeouts

**API Endpoints**:
```
POST /devices/{deviceId}/screencast/start
POST /devices/{deviceId}/screencast/stop
POST /devices/{deviceId}/remote/click
POST /devices/{deviceId}/remote/type
POST /devices/{deviceId}/remote/key
POST /devices/{deviceId}/remote/scroll
```

### WebSocket Events (Data Plane)
- **Purpose**: Low-latency, high-throughput data streaming
- **Used For**: Frame streaming, health reports, playback state
- **Benefits**: Bi-directional, event-driven, efficient for high-frequency messages

**Events (Server → Client/Device)**:
- `screencast:start` - Triggered by HTTP endpoint, starts CDP session
- `screencast:stop` - Triggered by HTTP endpoint, stops CDP session
- `remote:click` - Triggered by HTTP endpoint, executes click
- `remote:type` - Triggered by HTTP endpoint, executes type
- `remote:key` - Triggered by HTTP endpoint, executes key press
- `remote:scroll` - Triggered by HTTP endpoint, executes scroll

**Events (Client → Server → Admins)**:
- `screencast:frame` → `admin:screencast:frame` - Live stream frames (high-frequency)
- `playback:state:update` → `admin:playback:state` - Playback state updates

## 🔌 Data Flow Example

**Starting a Live Remote Session:**

1. **Admin UI**: User clicks "Live Remote" button
2. **Frontend → Backend**: `POST /devices/{deviceId}/screencast/start` (HTTP)
3. **Backend**: Validates device, increments reference counter
4. **Backend → Device**: Sends `screencast:start` event (WebSocket)
5. **Device**: Starts CDP session, begins capturing frames
6. **Device → Backend**: `screencast:frame` events at 10-30 FPS (WebSocket)
7. **Backend → Admins**: `admin:screencast:frame` broadcast (WebSocket)
8. **Frontend**: Renders frames on canvas, monitors FPS

**Sending a Click Command:**

1. **Admin UI**: User clicks on live stream canvas
2. **Frontend**: Calculates scaled coordinates
3. **Frontend → Backend**: `POST /devices/{deviceId}/remote/click` (HTTP)
4. **Backend → Device**: Sends `remote:click` event (WebSocket)
5. **Device**: Executes `page.mouse.click(x, y)` via Puppeteer
6. **Device**: Frame stream continues showing result

**Stopping a Live Remote Session:**

1. **Admin UI**: User closes live remote window
2. **Frontend → Backend**: `POST /devices/{deviceId}/screencast/stop` (HTTP)
3. **Backend**: Decrements reference counter
4. **Backend → Device**: If counter reaches 0, sends `screencast:stop` event (WebSocket)
5. **Device**: Stops CDP session, releases resources

## 🧪 Testing Remote Control

### Method 1: Using Admin UI (Recommended)

**Live Remote Control:**
1. Navigate to Devices page in admin UI
2. Find your device card and click "Live Remote"
3. Wait for stream to connect (shows FPS counter)
4. Click anywhere on the stream → click command sent
5. Click canvas to focus, then type directly → type/key commands sent

**Visual Remote Control:**
1. Navigate to Devices page in admin UI
2. Find your device card and click "Visual Remote"
3. Enable "Auto-refresh" for continuous updates
4. Click on screenshot → click command sent
5. Use keyboard controls sidebar for special keys

### Method 2: Using API Directly (For Testing/Automation)

The backend provides HTTP endpoints that are **already implemented** and accessible at:

```
POST /devices/{deviceId}/screencast/start
POST /devices/{deviceId}/screencast/stop
POST /devices/{deviceId}/remote/click
POST /devices/{deviceId}/remote/type
POST /devices/{deviceId}/remote/key
POST /devices/{deviceId}/remote/scroll
```

These endpoints are defined in `Program.cs` (lines 1811-2009) and require JWT authentication.

### Example API Calls

```bash
# Click at coordinates (500, 300)
curl -X POST http://localhost:5001/devices/pi-1/remote/click \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"x": 500, "y": 300, "button": "left"}'

# Type text into a form field
curl -X POST http://localhost:5001/devices/pi-1/remote/type \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "admin@example.com", "selector": "#email"}'

# Type password
curl -X POST http://localhost:5001/devices/pi-1/remote/type \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "mypassword", "selector": "#password"}'

# Press Enter key
curl -X POST http://localhost:5001/devices/pi-1/remote/key \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "Enter"}'

# Press Ctrl+A
curl -X POST http://localhost:5001/devices/pi-1/remote/key \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "KeyA", "modifiers": ["Control"]}'
```

## 🖥️ Frontend Implementation

**Fully Implemented** - The admin UI includes comprehensive remote control capabilities.

### LiveRemoteControl.tsx (Primary Interface)
**Location**: `frontend/src/components/LiveRemoteControl.tsx`

**Features**:
- Full-screen modal with live video stream
- Canvas-based rendering of CDP screencast frames
- Async image decoding with `createImageBitmap()` for performance
- Frame dropping (drops frames when > 30 pending)
- FPS counter for real-time performance monitoring
- Click-to-interact with automatic coordinate scaling
- Direct keyboard input when canvas is focused
- Visual focus indicator (orange border + ring when active)
- Connection status monitoring
- HTTP endpoint control (start/stop via API calls)
- WebSocket frame streaming (listens to `admin:screencast:frame`)

**Key Implementation Details**:
```typescript
// Frame rendering with async decoding
const blob = base64ToBlob(payload.data, 'image/jpeg');
createImageBitmap(blob).then(bitmap => {
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close(); // Free GPU resources
});

// Click with coordinate scaling
const scaleX = dimensions.width / rect.width;
const scaleY = dimensions.height / rect.height;
const x = Math.round((e.clientX - rect.left) * scaleX);
const y = Math.round((e.clientY - rect.top) * scaleY);
await deviceService.remoteClick(deviceId, x, y);

// Direct keyboard passthrough
canvas.addEventListener('keydown', (e) => {
  e.preventDefault();
  if (e.key.length === 1) {
    await deviceService.remoteType(deviceId, e.key);
  } else {
    await deviceService.remoteKey(deviceId, e.key, modifiers);
  }
});
```

### VisualRemoteControl.tsx (Fallback Interface)
**Location**: `frontend/src/components/VisualRemoteControl.tsx`

**Features**:
- Screenshot-based remote control
- Auto-refresh mode (2-second intervals)
- Click on screenshot to send coordinates
- Keyboard controls sidebar (Enter, Tab, ESC, F5, arrows, Page Up/Down)
- Text input with CSS selector targeting
- Refresh page button
- Manual screenshot refresh

**Use Case**: For devices where live streaming isn't available or when network latency is high.

### deviceService Integration
**Location**: `frontend/src/services/device.service.ts`

All remote control operations use HTTP endpoints:
```typescript
startScreencast(deviceId: string): POST /devices/{deviceId}/screencast/start
stopScreencast(deviceId: string): POST /devices/{deviceId}/screencast/stop
remoteClick(deviceId, x, y, button): POST /devices/{deviceId}/remote/click
remoteType(deviceId, text, selector): POST /devices/{deviceId}/remote/type
remoteKey(deviceId, key, modifiers): POST /devices/{deviceId}/remote/key
remoteScroll(deviceId, x, y, deltaX, deltaY): POST /devices/{deviceId}/remote/scroll
```

## 🔐 Use Cases

### 1. Handle Website Authentication
```bash
# Navigate to login page
curl -X POST /devices/pi-1/remote/type \
  -d '{"text": "user@example.com", "selector": "input[name=email]"}'

curl -X POST /devices/pi-1/remote/type \
  -d '{"text": "password123", "selector": "input[name=password]"}'

curl -X POST /devices/pi-1/remote/key \
  -d '{"key": "Enter"}'
```

### 2. Fill Interactive Forms
```bash
# Fill out a multi-field form
curl -X POST /devices/pi-1/remote/type \
  -d '{"text": "John Doe", "selector": "#fullName"}'

curl -X POST /devices/pi-1/remote/key \
  -d '{"key": "Tab"}'

curl -X POST /devices/pi-1/remote/type \
  -d '{"text": "john@example.com"}'
```

### 3. Navigate Interactive Dashboards
```bash
# Click on a specific dashboard element
curl -X POST /devices/pi-1/remote/click \
  -d '{"x": 800, "y": 400}'

# Scroll to see more content
curl -X POST /devices/pi-1/remote/scroll \
  -d '{"deltaY": 500}'
```

## ⚙️ Critical Implementation Patterns

### 1. HTTP Control + WebSocket Data (Hybrid Model)
**Why**: Combines reliability of HTTP with low-latency of WebSocket

- **HTTP Endpoints**: Control operations (start/stop, commands) → Error feedback, reference counting
- **WebSocket Events**: Data streaming (frames, state) → Low latency, high throughput

**Historical Context**: Early implementation used pure WebSocket control, but suffered from:
- Silent failures (no error feedback when device offline)
- Race conditions (messages sent before connection OPEN)
- Reference counting bugs (multiple admins caused restart loops)

### 2. JsonDocument Materialization (Backend)
**Why**: Prevent "Cannot access disposed object" errors

JsonDocument must be disposed, but nested JsonElements become invalid. **Solution**: Materialize before async operations.

```csharp
// WRONG: JsonElement passed to async broadcast
BroadcastAdmins("admin:screencast:frame", new {
    metadata = payload.GetProperty("metadata") // Invalid after disposal!
});

// CORRECT: Materialize first
var metadataElement = payload.GetProperty("metadata");
var metadataObj = new {
    sessionId = metadataElement.GetProperty("sessionId").GetInt32(),
    timestamp = metadataElement.GetProperty("timestamp").GetInt64()
};
BroadcastAdmins("admin:screencast:frame", new { metadata = metadataObj });
```

### 3. Fire-and-Forget Broadcasting (Backend)
**Why**: Prevent slow clients from blocking other clients

```csharp
// CORRECT: Simple foreach with fire-and-forget
private static void BroadcastAdmins(string evt, object payload) {
    foreach (var ws in Admins.Values) {
        _ = Send(ws, evt, payload); // Fire-and-forget
    }
}

// WRONG: Task.Run wrapper causes frame loss
_ = Task.Run(async () => { await Send(ws, evt, payload); }); // Don't do this!
```

### 4. Async Image Decoding (Frontend)
**Why**: Prevent UI thread blocking at high FPS

```typescript
// CORRECT: Async decode with createImageBitmap (2-3x faster)
const blob = base64ToBlob(payload.data, 'image/jpeg');
createImageBitmap(blob).then(bitmap => {
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close(); // Free GPU resources
});

// WRONG: Synchronous new Image() blocks rendering
const img = new Image();
img.src = `data:image/jpeg;base64,${payload.data}`; // Blocks at high FPS
```

### 5. Frame Dropping (Frontend)
**Why**: Prevent memory buildup when rendering is slow

```typescript
let pendingFrames = 0;

if (pendingFrames > 30) {
    console.warn('Dropping frame - too many pending');
    return; // Drop frame instead of queuing
}

pendingFrames++;
createImageBitmap(blob).then(bitmap => {
    pendingFrames--;
    // Render...
});
```

### 6. Synchronous Frame Transmission (Windows Client)
**Why**: Timer-based polling requires blocking pattern

```csharp
// CORRECT: .Wait() blocks timer thread (acceptable for 100ms intervals)
_wsClient.SendEventAsync("screencast:frame", payload).Wait();

// WRONG: Task.Run async causes frames to never arrive
_ = Task.Run(async () => { await _wsClient.SendEventAsync(...); }); // Broken!
```

## 🚀 Advanced Features

1. **Auto-Authentication** - Store credentials in Content entity for automatic login
2. **Reference Counting** - Multiple admins can watch same device without restart loops
3. **Connection State Machine** - Frontend WebSocket with DISCONNECTED → CONNECTING → OPEN → CLOSED
4. **Message Queuing** - Auto-queue WebSocket messages sent before connection is OPEN
5. **Coordinate Scaling** - Automatic scaling from display resolution to device resolution

## 📝 Notes

- The client logs all remote control actions for debugging
- Coordinates are absolute pixel positions from top-left (0,0)
- CSS selectors work with any valid selector (`#id`, `.class`, `input[name=foo]`)
- Keyboard keys use Puppeteer's key names (`Enter`, `Tab`, `ArrowDown`, etc.)
- All commands are executed via Puppeteer on the actual Chromium browser

## 🔍 Debugging

Check client logs to see remote control execution:
```bash
# On Raspberry Pi
journalctl -u kiosk-client -f

# Or check log files
tail -f /var/log/kiosk-client.log
```

You should see:
```
[INFO] Remote click at (500, 300) with left button
[INFO] Remote click executed successfully
[INFO] Remote type: "admin@example.com" in selector: #email
[INFO] Remote type executed successfully
```
