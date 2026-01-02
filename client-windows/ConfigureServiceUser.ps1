<#
.SYNOPSIS
    Configures TheiaCastKioskClient service to run as a user account (to show browser UI)

.DESCRIPTION
    Windows Services running as SYSTEM cannot display UI. This script reconfigures
    the service to run as your user account so the browser window is visible.

.EXAMPLE
    .\ConfigureServiceUser.ps1
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "TheiaCastKioskClient",

    [Parameter(Mandatory=$false)]
    [string]$Username = $env:USERNAME
)

# Require Administrator
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Configure Service to Run as User" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Get full username (DOMAIN\User or COMPUTER\User)
$Domain = $env:USERDOMAIN
$FullUsername = "$Domain\$Username"

Write-Host "Service: $ServiceName" -ForegroundColor Gray
Write-Host "User Account: $FullUsername" -ForegroundColor Gray
Write-Host ""

# Prompt for password
$Password = Read-Host "Enter password for $FullUsername" -AsSecureString
$PasswordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password))

Write-Host ""
Write-Host "[1/4] Stopping service..." -ForegroundColor Yellow
try {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "  V Service stopped" -ForegroundColor Green
}
catch {
    Write-Host "  V Service was not running" -ForegroundColor Green
}
Write-Host ""

Write-Host "[2/4] Configuring service to run as $FullUsername..." -ForegroundColor Yellow
try {
    $result = sc.exe config $ServiceName obj= $FullUsername password= $PasswordText
    if ($LASTEXITCODE -ne 0) {
        throw "sc.exe config failed with exit code $LASTEXITCODE"
    }
    Write-Host "  V Service account configured" -ForegroundColor Green
}
catch {
    Write-Error "Failed to configure service account: $_"
    exit 1
}
Write-Host ""

Write-Host "[3/4] Granting 'Log on as a service' right..." -ForegroundColor Yellow
Write-Host "  (This may require manual configuration in Local Security Policy)" -ForegroundColor Gray
Write-Host ""

Write-Host "[4/4] Starting service..." -ForegroundColor Yellow
try {
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 3

    $service = Get-Service -Name $ServiceName
    if ($service.Status -eq "Running") {
        Write-Host "  V Service started successfully" -ForegroundColor Green
        Write-Host ""
        Write-Host "=====================================" -ForegroundColor Cyan
        Write-Host "Configuration Complete!" -ForegroundColor Green
        Write-Host "=====================================" -ForegroundColor Cyan
        Write-Host "The browser window should now be visible." -ForegroundColor Green
        Write-Host ""
    }
    else {
        Write-Warning "Service status: $($service.Status)"
        Write-Host "  Check Event Viewer for errors" -ForegroundColor Gray
        Write-Host ""
    }
}
catch {
    Write-Error "Failed to start service: $_"
    Write-Host "  Check Event Viewer (Application log) for details" -ForegroundColor Gray
    exit 1
}
