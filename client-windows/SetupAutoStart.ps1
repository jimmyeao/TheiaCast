<#
.SYNOPSIS
    Sets up TheiaCast Kiosk Client to auto-start on user login using Task Scheduler

.DESCRIPTION
    Alternative to running as a Windows Service. Uses Task Scheduler to launch
    the application on user login, which allows the browser to display properly.
    This is the recommended approach for kiosk displays.

.EXAMPLE
    .\SetupAutoStart.ps1
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "TheiaCastKioskClient",

    [Parameter(Mandatory=$false)]
    [string]$TaskName = "TheiaCastKioskClient-AutoStart",

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
Write-Host "Setup Auto-Start with Task Scheduler" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Stop and disable the Windows Service
Write-Host "[1/3] Stopping and disabling Windows Service..." -ForegroundColor Yellow
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
        Start-Sleep -Seconds 2
    }

    # Disable the service (don't delete it, just disable)
    sc.exe config $ServiceName start= disabled | Out-Null
    Write-Host "  V Service stopped and disabled" -ForegroundColor Green
} else {
    Write-Host "  V Service not found (already removed)" -ForegroundColor Green
}
Write-Host ""

# Remove existing task if it exists
Write-Host "[2/3] Removing existing scheduled task (if any)..." -ForegroundColor Yellow
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "  V Existing task removed" -ForegroundColor Green
} else {
    Write-Host "  V No existing task found" -ForegroundColor Green
}
Write-Host ""

# Create scheduled task
Write-Host "[3/3] Creating scheduled task..." -ForegroundColor Yellow

$ExePath = Join-Path $InstallPath "KioskClient.Service.exe"

if (-not (Test-Path $ExePath)) {
    Write-Error "Executable not found: $ExePath"
    exit 1
}

# Create task action (run the exe)
$action = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory $InstallPath

# Create task trigger (at logon of any user)
$trigger = New-ScheduledTaskTrigger -AtLogOn

# Create task settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

# Create task principal (run as current user with highest privileges)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

# Register the task
$task = Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Auto-start TheiaCast Kiosk Client on user login"

Write-Host "  V Scheduled task created" -ForegroundColor Green
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The Kiosk Client will now start automatically when you log in." -ForegroundColor Gray
Write-Host ""
Write-Host "Options:" -ForegroundColor Cyan
Write-Host "  1. Log out and log back in to test" -ForegroundColor White
Write-Host "  2. Start it manually now with the command below" -ForegroundColor White
Write-Host ""
Write-Host "To start it now, run:" -ForegroundColor Gray
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Yellow
Write-Host ""
