# TheiaCast Client - Windows .NET

Windows client for TheiaCast Digital Signage built with .NET 10 and Playwright.

## ✨ Why This Version?

- **Scheduled Task Auto-Start**: Runs as a scheduled task on user login for proper UI display
- **Simpler Installation**: Automated PowerShell installer with command-line configuration
- **Better Integration**: Native Windows APIs for health monitoring
- **Lower Resources**: Less memory, faster startup
- **Full Feature Parity**: All features from Node.js client now implemented

## Requirements

- Windows 10/11 or Windows Server 2019+
- .NET 8.0 SDK or later
- Administrator privileges
- PowerShell 5.1 or later

## Quick Install

### Option 1: Setup.exe Installer (Recommended)

#### 1. Download or Build Installer

**Download:** Get `TheiaCast-Setup.exe` from releases

**Or Build It Yourself:**
```powershell
# Install Inno Setup from https://jrsoftware.org/isdl.php
# Then run:
cd path\to\client-windows
.\BuildInstaller.ps1
```

#### 2. Obtain Device Token

Before installing, get a device token from the TheiaCast admin interface:
1. Log into TheiaCast admin UI (e.g., http://your-server:5173)
2. Go to **Devices** page
3. Create or select your device
4. Copy the **Device Token**

#### 3. Run Installer

**Interactive Installation (GUI):**
```powershell
TheiaCast-Setup.exe
```
The installer will prompt for Server URL, Device ID, and Token.

**Silent Installation (for scripting/remote deployment):**
```powershell
TheiaCast-Setup.exe /VERYSILENT /ServerUrl=http://192.168.0.57:5001 /DeviceId=office-kiosk /DeviceToken=abc123
```

### Option 2: PowerShell Installer Script

```powershell
cd path\to\client-windows
.\Install.ps1 -ServerUrl "http://192.168.0.57:5001" -DeviceId "lobby-display" -DeviceToken "abc123"
```

## Remote Deployment

### Using Setup.exe (Recommended)

```powershell
# Copy installer to remote machine
Copy-Item TheiaCast-Setup.exe \\REMOTE-PC\C$\Temp\

# Execute silent installation remotely
Invoke-Command -ComputerName REMOTE-PC -ScriptBlock {
    C:\Temp\TheiaCast-Setup.exe /VERYSILENT /ServerUrl=http://192.168.0.57:5001 /DeviceId=remote-kiosk /DeviceToken=abc123
}
```

### Using PowerShell Script

```powershell
# Copy source to remote machine
Copy-Item -Path ".\client-windows" -Destination "\\REMOTE-PC\C$\Temp\" -Recurse

# Execute installer remotely
Invoke-Command -ComputerName REMOTE-PC -ScriptBlock {
    Set-Location "C:\Temp\client-windows"
    .\Install.ps1 -ServerUrl "http://192.168.0.57:5001" -DeviceId "remote-kiosk" -DeviceToken "token-here"
}
```

## Task Management

### Check Task Status

```powershell
Get-ScheduledTask -TaskName "TheiaCast-AutoStart"
```

### Start/Stop Task

```powershell
Stop-ScheduledTask -TaskName "TheiaCast-AutoStart"
Start-ScheduledTask -TaskName "TheiaCast-AutoStart"
```

### View Logs

```powershell
Get-EventLog -LogName Application -Source KioskClient -Newest 50
```

### Get Task Info

```powershell
Get-ScheduledTask -TaskName "TheiaCast-AutoStart" | Get-ScheduledTaskInfo
```

## Uninstall

```powershell
# Remove scheduled task only
.\Uninstall.ps1

# Remove scheduled task and files
.\Uninstall.ps1 -RemoveFiles
```

## ✅ Features (Complete Feature Parity)

- ✅ Scheduled Task auto-start on user login
- ✅ Real-time WebSocket communication
- ✅ Playlist execution with content rotation
- ✅ Auto-authentication for protected sites
- ✅ Remote browser control (click, type, keyboard, scroll)
- ✅ Live CDP screencast streaming
- ✅ Health monitoring (CPU, memory, disk)
- ✅ Automatic screenshot capture
- ✅ Dynamic display configuration updates
- ✅ Persistent browser profile (retains sessions/cookies)
- ✅ WebAuthn/passkey popup blocking
- ✅ Kiosk mode support (fullscreen)
- ✅ Play/pause/next/previous playlist controls
- ✅ Config updates (resolution, kiosk mode) without restart

## Configuration

Configuration is stored in `C:\Program Files\TheiaCast\appsettings.json`:

```json
{
  "Kiosk": {
    "ServerUrl": "http://192.168.0.57:5001",
    "DeviceId": "office-kiosk",
    "DeviceToken": "your-token-here",
    "HealthReportIntervalMs": 60000,
    "ScreenshotIntervalMs": 300000,
    "Headless": false,
    "KioskMode": false,
    "ViewportWidth": 1920,
    "ViewportHeight": 1080
  }
}
```

After editing configuration, restart the task:

```powershell
Stop-ScheduledTask -TaskName "TheiaCast-AutoStart"
Start-ScheduledTask -TaskName "TheiaCast-AutoStart"
```

## 🆚 vs Node.js Client

| Feature | Node.js Client | .NET Client |
|---------|---------------|-------------|
| **Runtime** | Node.js 20+ | Self-contained .exe |
| **Installation** | npm install | PowerShell installer |
| **Auto-Start** | PM2/systemd | Scheduled Task (on login) |
| **Health Monitor** | systeminformation | Native WMI/PerfCounters |
| **Browser** | Puppeteer + Chromium | Playwright + Chromium |
| **Platform** | Cross-platform | **Windows only** |
| **Features** | ✅ All | ✅ All (Full Parity) |

## 📦 Architecture

```
client-windows/
├── Install.ps1               # Automated installer
├── Uninstall.ps1             # Uninstaller
├── SetupAutoStart.ps1        # Scheduled task setup
├── KioskClient.Core/         # Core library (Playwright, WebSocket, Health)
└── KioskClient.Service/      # Application executable
```

## 🔧 Development

```powershell
# Build
dotnet build

# Run (console mode for testing)
dotnet run --project KioskClient.Service

# Publish
dotnet publish KioskClient.Service -c Release
```

## Troubleshooting

See the full README for troubleshooting steps including:
- Service won't start
- Browser issues
- Network issues
- Log viewing

## 📖 Notes

- **Keep Node.js version**: This is for Windows only, Node.js version still needed for Raspberry Pi
- **Both versions supported**: Can deploy either version to Windows
- **Same backend**: Both connect to the same .NET backend server

