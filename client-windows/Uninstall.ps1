<#
.SYNOPSIS
    Uninstalls TheiaCast Kiosk Client

.DESCRIPTION
    Stops and removes the TheiaCast Kiosk Client service/task and optionally removes installation files.

.PARAMETER RemoveFiles
    Remove installation directory (default: $false)

.PARAMETER InstallPath
    Installation directory to remove (default: C:\Program Files\TheiaCast\KioskClient)

.EXAMPLE
    .\Uninstall.ps1

.EXAMPLE
    .\Uninstall.ps1 -RemoveFiles
#>

param(
    [Parameter(Mandatory=$false)]
    [switch]$RemoveFiles,

    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "C:\Program Files\TheiaCast\KioskClient"
)

# Require Administrator
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "TheiaCast Kiosk Client Uninstaller" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Remove scheduled task
Write-Host "[1/3] Removing scheduled task..." -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName "TheiaCastKioskClient-AutoStart" -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName "TheiaCastKioskClient-AutoStart" -Confirm:$false
    Write-Host "  V Scheduled task removed" -ForegroundColor Green
} else {
    Write-Host "  V Scheduled task not found" -ForegroundColor Green
}
Write-Host ""

# Stop and remove service (for old installations)
Write-Host "[2/3] Removing Windows Service (if exists)..." -ForegroundColor Yellow
$service = Get-Service -Name "TheiaCastKioskClient" -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -eq "Running") {
        Stop-Service -Name "TheiaCastKioskClient" -Force
        Start-Sleep -Seconds 2
    }
    sc.exe delete "TheiaCastKioskClient" | Out-Null
    Write-Host "  V Service removed" -ForegroundColor Green
} else {
    Write-Host "  V Service not found" -ForegroundColor Green
}
Write-Host ""

# Remove files if requested
if ($RemoveFiles) {
    Write-Host "[3/3] Removing installation files..." -ForegroundColor Yellow

    # Stop any running processes
    Get-Process -Name "KioskClient.Service" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1

    if (Test-Path $InstallPath) {
        try {
            Remove-Item -Path $InstallPath -Recurse -Force
            Write-Host "  V Installation directory removed: $InstallPath" -ForegroundColor Green
        } catch {
            Write-Warning "Could not remove installation directory: $_"
            Write-Host "  You may need to remove it manually: $InstallPath" -ForegroundColor Gray
        }
    } else {
        Write-Host "  V Installation directory not found" -ForegroundColor Green
    }

    # Remove browser profile
    $profileDir = "C:\ProgramData\TheiaCast\browser-profile"
    if (Test-Path $profileDir) {
        try {
            Remove-Item -Path $profileDir -Recurse -Force
            Write-Host "  V Browser profile removed" -ForegroundColor Green
        } catch {
            Write-Warning "Could not remove browser profile: $_"
        }
    }

    # Remove environment variable
    try {
        [Environment]::SetEnvironmentVariable("PLAYWRIGHT_BROWSERS_PATH", $null, "Machine")
        Write-Host "  V Environment variable removed" -ForegroundColor Green
    } catch {
        Write-Warning "Could not remove environment variable"
    }
} else {
    Write-Host "[3/3] Skipping file removal (use -RemoveFiles to remove)" -ForegroundColor Yellow
    Write-Host "  Installation files remain at: $InstallPath" -ForegroundColor Gray
}
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Uninstall Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
